// ==UserScript==
// @name         ADOM External Sheet - Roll20 Bridge
// @namespace    https://adom-external-sheet.local/
// @version      0.2.0
// @description  Bus de mensajes entre la ficha externa ADOM y Roll20.
//
// Ficha externa local:
// @match        https://adom-web.vercel.app
// @match        http://127.0.0.1:5500/index.html
//
// Roll20:
// @match        https://app.roll20.net/editor
// @match        https://app.roll20.net/editor/*
//
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// ==/UserScript==

(() => {
    "use strict";

    /*
     * ============================================================
     * PROTOCOLO
     * ============================================================
     */

    const PROTOCOL = Object.freeze({
        VERSION: 1,

        CHANNELS: Object.freeze({
            REQUEST: "adom-sheet:bridge-request",
            RESPONSE: "adom-sheet:bridge-response"
        }),

        EVENTS: Object.freeze({
            PAGE_REQUEST: "adom-sheet:bridge-request",
            PAGE_RESPONSE: "adom-sheet:bridge-response"
        }),

        MESSAGE_TYPES: Object.freeze({
            CHAT_COMMAND: "CHAT_COMMAND"
        }),

        RESPONSE_TYPES: Object.freeze({
            COMMAND_RESULT: "COMMAND_RESULT"
        })
    });

    /*
     * ============================================================
     * CONFIGURACIÓN
     * ============================================================
     */

    const CONFIG = Object.freeze({
        ROLL20_HOST: "app.roll20.net",
        REQUEST_MAX_AGE_MS: 30_000,
        CHAT_INPUT_TIMEOUT_MS: 10_000,
        MAX_PROCESSED_REQUESTS: 500
    });

    /*
     * ============================================================
     * ESTADO EN MEMORIA
     * ============================================================
     */

    const runtime = {
        processedRequestIds: new Set()
    };

    initialize();

    /*
     * ============================================================
     * INICIALIZACIÓN
     * ============================================================
     */

    function initialize() {
        if (isRoll20Page()) {
            initializeRoll20Bridge();
        } else {
            initializeExternalPageBridge();
        }
    }

    /*
     * ============================================================
     * PUENTE DE LA PÁGINA EXTERNA
     * ============================================================
     */

    function initializeExternalPageBridge() {
        console.info(
            "[ADOM Bridge] Ejecutándose en la ficha externa."
        );

        window.addEventListener(
            PROTOCOL.EVENTS.PAGE_REQUEST,
            handleExternalPageRequest
        );

        GM_addValueChangeListener(
            PROTOCOL.CHANNELS.RESPONSE,
            handleBridgeResponseChange
        );
    }

    function handleExternalPageRequest(event) {
        const message = event.detail;

        const validation = validateBridgeMessage(message);

        if (!validation.valid) {
            publishResponseToExternalPage(
                createErrorResponse({
                    requestId: message?.id ?? null,
                    errorCode: "INVALID_MESSAGE",
                    error: validation.error
                })
            );

            return;
        }

        GM_setValue(
            PROTOCOL.CHANNELS.REQUEST,
            message
        );

        console.info(
            "[ADOM Bridge] Mensaje enviado:",
            message
        );
    }

    function handleBridgeResponseChange(
        key,
        oldValue,
        newValue,
        remote
    ) {
        if (!remote || !newValue) {
            return;
        }

        publishResponseToExternalPage(newValue);
    }

    function publishResponseToExternalPage(response) {
        window.dispatchEvent(
            new CustomEvent(
                PROTOCOL.EVENTS.PAGE_RESPONSE,
                {
                    detail: response
                }
            )
        );
    }

    /*
     * ============================================================
     * PUENTE DE ROLL20
     * ============================================================
     */

    function initializeRoll20Bridge() {
        console.info(
            "[ADOM Bridge] Ejecutándose dentro de Roll20."
        );

        GM_addValueChangeListener(
            PROTOCOL.CHANNELS.REQUEST,
            handleBridgeRequestChange
        );

        /*
         * Recuperamos una posible petición reciente.
         *
         * Esto permite procesar una orden enviada mientras Roll20
         * todavía estaba terminando de cargar.
         */
        const pendingRequest = GM_getValue(
            PROTOCOL.CHANNELS.REQUEST,
            null
        );

        if (pendingRequest) {
            processBridgeMessage(pendingRequest);
        }
    }

    function handleBridgeRequestChange(
        key,
        oldValue,
        newValue,
        remote
    ) {
        if (!remote || !newValue) {
            return;
        }

        processBridgeMessage(newValue);
    }

    async function processBridgeMessage(message) {
        const validation = validateBridgeMessage(message);

        if (!validation.valid) {
            await publishBridgeResponse(
                createErrorResponse({
                    requestId: message?.id ?? null,
                    errorCode: "INVALID_MESSAGE",
                    error: validation.error
                })
            );

            return;
        }

        if (runtime.processedRequestIds.has(message.id)) {
            return;
        }

        rememberProcessedRequest(message.id);

        if (isExpiredMessage(message)) {
            await publishBridgeResponse(
                createErrorResponse({
                    requestId: message.id,
                    errorCode: "REQUEST_EXPIRED",
                    error: "La solicitud ha caducado antes de llegar a Roll20."
                })
            );

            return;
        }

        try {
            const response = await dispatchMessage(message);

            await publishBridgeResponse(response);
        } catch (error) {
            console.error(
                "[ADOM Bridge] Error no controlado:",
                error
            );

            await publishBridgeResponse(
                createErrorResponse({
                    requestId: message.id,
                    errorCode: "UNEXPECTED_ERROR",
                    error: getErrorMessage(error)
                })
            );
        }
    }

    /*
     * ============================================================
     * DISPATCHER
     * ============================================================
     */

    async function dispatchMessage(message) {
        switch (message.type) {
            case PROTOCOL.MESSAGE_TYPES.CHAT_COMMAND:
                return handleChatCommand(message);

            default:
                return createErrorResponse({
                    requestId: message.id,
                    errorCode: "UNSUPPORTED_MESSAGE_TYPE",
                    error: `Tipo de mensaje no soportado: ${message.type}`
                });
        }
    }

    /*
     * ============================================================
     * HANDLER: CHAT_COMMAND
     * ============================================================
     */

    async function handleChatCommand(message) {
        const command = message.payload?.command;

        if (
            typeof command !== "string" ||
            command.trim().length === 0
        ) {
            return createErrorResponse({
                requestId: message.id,
                errorCode: "INVALID_CHAT_COMMAND",
                error: "El comando de chat no es válido."
            });
        }

        await sendCommandToRoll20Chat(
            command.trim()
        );

        return createSuccessResponse({
            requestId: message.id,
            data: {
                command: command.trim()
            },
            message: "Comando enviado al chat de Roll20."
        });
    }

    /*
     * ============================================================
     * ADAPTADOR DEL CHAT DE ROLL20
     * ============================================================
     *
     * Esta es la única zona que depende directamente del DOM
     * interno de Roll20.
     *
     * Si Roll20 cambia su interfaz, debería bastar con modificar
     * estas funciones sin tocar el protocolo ni la ficha externa.
     */

    async function sendCommandToRoll20Chat(command) {
        const chatInput = await waitForElement(
            findRoll20ChatInput,
            CONFIG.CHAT_INPUT_TIMEOUT_MS
        );

        if (!chatInput) {
            throw new Error(
                "No se ha encontrado el cuadro de chat de Roll20."
            );
        }

        chatInput.focus();

        setNativeInputValue(
            chatInput,
            command
        );

        dispatchInputEvents(chatInput);
        dispatchEnterKeyEvents(chatInput);
    }

    function findRoll20ChatInput() {
        const selectors = [
            "#textchat-input textarea",
            "#textchat-input input[type='text']",
            "textarea[placeholder*='chat' i]",
            "textarea[aria-label*='chat' i]",
            "input[placeholder*='chat' i]",
            "input[aria-label*='chat' i]"
        ];

        for (const selector of selectors) {
            const element = document.querySelector(selector);

            if (element && isVisible(element)) {
                return element;
            }
        }

        return null;
    }

    function setNativeInputValue(element, value) {
        const prototype =
            element instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;

        const descriptor =
            Object.getOwnPropertyDescriptor(
                prototype,
                "value"
            );

        if (!descriptor?.set) {
            element.value = value;
            return;
        }

        descriptor.set.call(
            element,
            value
        );
    }

    function dispatchInputEvents(element) {
        element.dispatchEvent(
            new Event("input", {
                bubbles: true
            })
        );

        element.dispatchEvent(
            new Event("change", {
                bubbles: true
            })
        );
    }

    function dispatchEnterKeyEvents(element) {
        const eventOptions = {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        };

        element.dispatchEvent(
            new KeyboardEvent(
                "keydown",
                eventOptions
            )
        );

        element.dispatchEvent(
            new KeyboardEvent(
                "keypress",
                eventOptions
            )
        );

        element.dispatchEvent(
            new KeyboardEvent(
                "keyup",
                eventOptions
            )
        );
    }

    /*
     * ============================================================
     * RESPUESTAS DEL PROTOCOLO
     * ============================================================
     */

    function createSuccessResponse({
        requestId,
        message,
        data = null
    }) {
        return {
            id: crypto.randomUUID(),
            type: PROTOCOL.RESPONSE_TYPES.COMMAND_RESULT,
            requestId,
            success: true,
            message,
            data,
            error: null,
            errorCode: null,
            metadata: {
                source: "ROLL20_BRIDGE",
                createdAt: Date.now(),
                protocolVersion: PROTOCOL.VERSION
            }
        };
    }

    function createErrorResponse({
        requestId,
        errorCode,
        error
    }) {
        return {
            id: crypto.randomUUID(),
            type: PROTOCOL.RESPONSE_TYPES.COMMAND_RESULT,
            requestId,
            success: false,
            message: null,
            data: null,
            error,
            errorCode,
            metadata: {
                source: "ROLL20_BRIDGE",
                createdAt: Date.now(),
                protocolVersion: PROTOCOL.VERSION
            }
        };
    }

    async function publishBridgeResponse(response) {
        GM_setValue(
            PROTOCOL.CHANNELS.RESPONSE,
            response
        );
    }

    /*
     * ============================================================
     * VALIDACIÓN
     * ============================================================
     */

    function validateBridgeMessage(message) {
        if (!message || typeof message !== "object") {
            return {
                valid: false,
                error: "El mensaje debe ser un objeto."
            };
        }

        if (
            typeof message.id !== "string" ||
            message.id.length === 0
        ) {
            return {
                valid: false,
                error: "El mensaje no contiene un identificador válido."
            };
        }

        if (
            typeof message.type !== "string" ||
            message.type.length === 0
        ) {
            return {
                valid: false,
                error: "El mensaje no contiene un tipo válido."
            };
        }

        if (
            !message.payload ||
            typeof message.payload !== "object"
        ) {
            return {
                valid: false,
                error: "El mensaje no contiene un payload válido."
            };
        }

        if (
            !message.metadata ||
            typeof message.metadata !== "object"
        ) {
            return {
                valid: false,
                error: "El mensaje no contiene metadatos válidos."
            };
        }

        if (
            !Number.isFinite(message.metadata.createdAt)
        ) {
            return {
                valid: false,
                error: "El mensaje no contiene una fecha válida."
            };
        }

        if (
            message.metadata.protocolVersion !==
            PROTOCOL.VERSION
        ) {
            return {
                valid: false,
                error:
                    "La versión del protocolo no es compatible."
            };
        }

        return {
            valid: true,
            error: null
        };
    }

    /*
     * ============================================================
     * UTILIDADES
     * ============================================================
     */

    function isRoll20Page() {
        return (
            window.location.hostname ===
            CONFIG.ROLL20_HOST
        );
    }

    function isExpiredMessage(message) {
        return (
            Date.now() -
                message.metadata.createdAt >
            CONFIG.REQUEST_MAX_AGE_MS
        );
    }

    function rememberProcessedRequest(requestId) {
        runtime.processedRequestIds.add(requestId);

        /*
         * Evita que el Set crezca indefinidamente si la pestaña
         * permanece abierta durante muchas horas.
         */
        if (
            runtime.processedRequestIds.size >
            CONFIG.MAX_PROCESSED_REQUESTS
        ) {
            const oldestRequestId =
                runtime.processedRequestIds
                    .values()
                    .next()
                    .value;

            runtime.processedRequestIds.delete(
                oldestRequestId
            );
        }
    }

    function isVisible(element) {
        const style =
            window.getComputedStyle(element);

        const rectangle =
            element.getBoundingClientRect();

        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rectangle.width > 0 &&
            rectangle.height > 0
        );
    }

    function waitForElement(finder, timeoutMs) {
        return new Promise(resolve => {
            const existingElement = finder();

            if (existingElement) {
                resolve(existingElement);
                return;
            }

            let completed = false;

            const observer =
                new MutationObserver(() => {
                    const element = finder();

                    if (!element || completed) {
                        return;
                    }

                    completed = true;
                    observer.disconnect();
                    resolve(element);
                });

            observer.observe(
                document.documentElement,
                {
                    childList: true,
                    subtree: true
                }
            );

            window.setTimeout(() => {
                if (completed) {
                    return;
                }

                completed = true;
                observer.disconnect();
                resolve(null);
            }, timeoutMs);
        });
    }

    function getErrorMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }

        return "Se ha producido un error desconocido.";
    }
})();