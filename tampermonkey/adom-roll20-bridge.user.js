// ==UserScript==
// @name         ADOM External Sheet - Roll20 Bridge
// @namespace    https://adom-external-sheet.local/
// @version      0.4.4
// @description  Bus de mensajes entre la ficha externa ADOM y Roll20.
//
// Ficha externa local:
// @match        https://adom-web.vercel.app/*
// @match        http://127.0.0.1:5500/*
// @match        http://localhost:5500/*
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
        VERSION: 3,

        CHANNELS: Object.freeze({
            REQUEST: "adom-sheet:bridge-request",
            RESPONSE: "adom-sheet:bridge-response",
            CHAT: "adom-sheet:chat-state"
        }),

        EVENTS: Object.freeze({
            PAGE_REQUEST: "adom-sheet:bridge-request",
            PAGE_RESPONSE: "adom-sheet:bridge-response",
            PAGE_CHAT_UPDATE: "adom-sheet:chat-update"
        }),

        MESSAGE_TYPES: Object.freeze({
            CHAT_COMMAND: "CHAT_COMMAND",
            DAMAGE_ROLL: "DAMAGE_ROLL"
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
        ROLL_RESULT_TIMEOUT_MS: 12_000,
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

        GM_addValueChangeListener(
            PROTOCOL.CHANNELS.CHAT,
            handleChatStateChange
        );

        const currentChat = GM_getValue(PROTOCOL.CHANNELS.CHAT, null);
        if (currentChat) publishChatToExternalPage(currentChat);
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

    function handleChatStateChange(key, oldValue, newValue, remote) {
        if (!remote || !newValue) return;
        publishChatToExternalPage(newValue);
    }

    function publishChatToExternalPage(chatState) {
        window.dispatchEvent(new CustomEvent(PROTOCOL.EVENTS.PAGE_CHAT_UPDATE, {
            detail: chatState
        }));
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

        initializeRoll20ChatMirror();
    }

    function initializeRoll20ChatMirror() {
        let updateTimer = null;
        const publish = () => {
            const messages = readRoll20ChatMessages();
            GM_setValue(PROTOCOL.CHANNELS.CHAT, { messages, createdAt: Date.now() });
        };
        const schedule = () => {
            window.clearTimeout(updateTimer);
            updateTimer = window.setTimeout(publish, 120);
        };
        const observer = new MutationObserver(schedule);
        observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        schedule();
    }

    function readRoll20ChatMessages() {
        let nodes = Array.from(document.querySelectorAll("#textchat .message"));
        if (!nodes.length) nodes = Array.from(document.querySelectorAll("#textchat .content > div"));
        return nodes.slice(-80).map((node, index) => {
            const speakerNode = findSpeakerNode(node);
            const speaker = findRoll20Speaker(node, speakerNode);
            let text = String(node.innerText || node.textContent || "").trim();
            if (speakerNode) {
                const speakerText = String(speakerNode.textContent || "").trim();
                if (text.startsWith(speakerText)) text = text.slice(speakerText.length).replace(/^:\s*/, "").trim();
            }
            const roll = extractRollDisplay(node);
            return {
                id: `${index}-${text.slice(0, 40)}`,
                speaker,
                text,
                kind: roll ? "roll" : "message",
                roll
            };
        }).filter(message => message.text);
    }

    function findSpeakerNode(node) {
        const selector = ".by, .who, .message-name, [class*='speaker'], [class*='author'], [data-testid*='author']";
        const direct = node.querySelector(selector);
        if (direct) return direct;

        let previous = node.previousElementSibling;
        for (let distance = 0; previous && distance < 5; distance += 1) {
            const candidate = previous.matches(selector) ? previous : previous.querySelector(selector);
            if (candidate) return candidate;
            previous = previous.previousElementSibling;
        }

        let container = node.parentElement;
        for (let depth = 0; container && depth < 3 && container.closest("#textchat"); depth += 1) {
            if (container.id === "textchat" || container.classList.contains("content")) break;
            const candidate = container.querySelector(selector);
            if (candidate) return candidate;
            container = container.parentElement;
        }
        return null;
    }

    function findRoll20Speaker(node, speakerNode) {
        const attributeSpeaker = [
            node.dataset?.who,
            node.dataset?.speaker,
            node.dataset?.author,
            node.getAttribute("data-displayname")
        ].find(value => String(value || "").trim());
        const explicitSpeaker = String(speakerNode?.textContent || attributeSpeaker || "")
            .replace(/:\s*$/, "")
            .trim();
        if (explicitSpeaker) return explicitSpeaker;

        if (node.classList.contains("you")) {
            const speakingAs = document.querySelector("#speakingas, select[name='speakingas'], #textchat-input select");
            const selectedName = String(speakingAs?.selectedOptions?.[0]?.textContent || speakingAs?.value || "")
                .replace(/^\s*(?:como|as)\s*:?\s*/i, "")
                .trim();
            if (selectedName) return selectedName;
        }
        return "Roll20";
    }

    function extractRollDisplay(node) {
        const rollNode = node.matches(".rollresult")
            ? node
            : node.querySelector(".rollresult") || (node.querySelector(".diceroll, .rolled, .inlinerollresult") ? node : null);
        if (!rollNode) return null;

        const formula = String(
            rollNode.querySelector(".formula:not(.formattedformula)")?.textContent || ""
        ).replace(/^rolling\s*/i, "").trim();
        const dice = Array.from(rollNode.querySelectorAll(".diceroll .didroll")).map(die => {
            const dieNode = die.closest(".diceroll");
            const sidesClass = Array.from(dieNode?.classList || []).find(name => /^d\d+$/i.test(name));
            const classNames = new Set([
                ...Array.from(dieNode?.classList || []),
                ...Array.from(die.classList || [])
            ]);
            const value = String(die.textContent || "").trim();
            const numericValue = Number.parseInt(value, 10);
            const sides = Number.parseInt(String(sidesClass || "").slice(1), 10);
            const outcome = classNames.has("critsuccess") || classNames.has("crit-success") || (Number.isInteger(sides) && numericValue === sides)
                ? "critical"
                : classNames.has("critfail") || classNames.has("crit-fail") || numericValue === 1
                    ? "fumble"
                    : "normal";
            return {
                value,
                sides: sidesClass ? sidesClass.toLowerCase() : "die",
                dropped: Boolean(dieNode?.classList.contains("dropped")),
                outcome
            };
        }).filter(die => die.value);
        const total = String(
            rollNode.querySelector(".rolled, .roll-total, [class*='rolltotal'], .inlinerollresult")?.textContent || ""
        ).trim();

        if (!formula && !dice.length && !total) return null;
        return { formula, dice, total };
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

            case PROTOCOL.MESSAGE_TYPES.DAMAGE_ROLL:
                return handleDamageRoll(message);

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
     * HANDLER: DAMAGE_ROLL
     * ============================================================
     */

    async function handleDamageRoll(message) {
        const skillValue = normalizeModifier(message.payload?.skillValue);
        const attributeValue = normalizeModifier(message.payload?.attributeValue);
        const weaponName = normalizeRollLabel(message.payload?.weaponName, "Arma");

        if (skillValue === null || attributeValue === null) {
            return createErrorResponse({
                requestId: message.id,
                errorCode: "INVALID_DAMAGE_ROLL",
                error: "La habilidad o el atributo de la tirada no son válidos."
            });
        }

        const command = `/roll {3d10dh1}kh1${formatRollModifier(skillValue, "Habilidad")}${formatRollModifier(attributeValue, "Atributo")}${formatRollModifier(0, `Arma: ${weaponName}`)}`;
        let rollWaiter = null;

        try {
            await sendCommandToRoll20Chat(command, () => {
                rollWaiter = createRollResultWaiter();
            });
            const dice = await rollWaiter.promise;

            return createSuccessResponse({
                requestId: message.id,
                data: { dice },
                message: "Tirada recibida desde Roll20."
            });
        } finally {
            rollWaiter?.cancel();
        }
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

    async function sendCommandToRoll20Chat(command, beforeSend = null) {
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
        beforeSend?.();
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

    function createRollResultWaiter() {
        let completed = false;
        let timeoutId = null;
        let settleTimeoutId = null;
        let observer = null;
        const knownRollMessages = new Set(document.querySelectorAll(".message.rollresult.you"));

        const finish = () => {
            if (completed) return;
            completed = true;
            observer?.disconnect();
            if (timeoutId !== null) window.clearTimeout(timeoutId);
            if (settleTimeoutId !== null) window.clearTimeout(settleTimeoutId);
        };

        const promise = new Promise((resolve, reject) => {
            const inspect = () => {
                const dice = findFreshRollDice(knownRollMessages);
                if (!dice || completed) return;
                finish();
                resolve(dice);
            };

            const scheduleInspect = () => {
                if (completed) return;
                if (settleTimeoutId !== null) window.clearTimeout(settleTimeoutId);
                settleTimeoutId = window.setTimeout(inspect, 75);
            };

            observer = new MutationObserver(scheduleInspect);
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ["class"],
                childList: true,
                subtree: true
            });

            timeoutId = window.setTimeout(() => {
                if (completed) return;
                finish();
                reject(new Error("Roll20 no devolvió una tirada con tres dados legibles."));
            }, CONFIG.ROLL_RESULT_TIMEOUT_MS);

            scheduleInspect();
        });

        return {
            promise,
            cancel() {
                if (completed) return;
                finish();
            }
        };
    }

    function findFreshRollDice(knownRollMessages) {
        const messages = document.querySelectorAll(".message.rollresult.you");

        for (const message of messages) {
            if (knownRollMessages.has(message)) continue;

            const formula = message.querySelector(".formula:not(.formattedformula)")?.textContent || "";
            if (!formula.includes("{3d10dh1}kh1")) continue;

            const diceGroup = message.querySelector(
                ".formula.formattedformula .dicegrouping[data-groupindex='0']"
            );
            const diceElements = Array.from(
                diceGroup?.querySelectorAll(".diceroll.d10[data-origindex] .didroll") || []
            );
            const dice = extractDiceElements(diceElements);
            if (dice) return dice;
        }

        return null;
    }

    function extractDiceElements(elements) {
        const dice = elements
            .map(element => Number.parseInt(element.textContent, 10))
            .filter(value => Number.isInteger(value) && value >= 1 && value <= 10);
        return dice.length === 3 ? dice : null;
    }

    function normalizeModifier(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || Math.abs(number) > 9999) return null;
        return Math.trunc(number);
    }

    function formatRollModifier(value, label) {
        const sign = value < 0 ? "-" : "+";
        return `${sign}${Math.abs(value)}[${label}]`;
    }

    function normalizeRollLabel(value, fallback) {
        const label = String(value || "")
            .replace(/[\[\]\r\n|]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
        return label || fallback;
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
