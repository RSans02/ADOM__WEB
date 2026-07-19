(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};

    const EVENTS = Object.freeze({
        REQUEST: "adom-sheet:bridge-request",
        RESPONSE: "adom-sheet:bridge-response"
    });

    const MESSAGE_TYPES = Object.freeze({
        CHAT_COMMAND: "CHAT_COMMAND",
        DAMAGE_ROLL: "DAMAGE_ROLL"
    });

    function uniqueId() {
        if (global.crypto?.randomUUID) {
            return global.crypto.randomUUID();
        }
        return `adom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    class Roll20Bridge extends EventTarget {
        constructor(options) {
            super();
            this.protocolVersion = 2;
            this.timeoutMs = options?.timeoutMs || 8000;
            this.pending = new Map();
            global.addEventListener(EVENTS.RESPONSE, event => this.handleResponse(event));
        }

        sendChatCommand(command) {
            const normalized = String(command || "").trim();
            if (!normalized) {
                return Promise.reject(new Error("El comando está vacío."));
            }

            return this.sendRequest(MESSAGE_TYPES.CHAT_COMMAND, { command: normalized });
        }

        rollThreeD10() {
            return this.sendRequest(MESSAGE_TYPES.DAMAGE_ROLL, { dice: "3d10" }).then(response => {
                const dice = response?.payload?.dice;
                const valid = Array.isArray(dice)
                    && dice.length === 3
                    && dice.every(die => Number.isInteger(die) && die >= 1 && die <= 10);
                if (!valid) throw new Error("Roll20 no devolvió los tres resultados individuales.");
                return dice;
            });
        }

        sendRequest(type, payload) {

            const message = {
                id: uniqueId(),
                type,
                payload,
                metadata: {
                    source: "ADOM_EXTERNAL_SHEET",
                    createdAt: Date.now(),
                    protocolVersion: this.protocolVersion
                }
            };

            const promise = new Promise((resolve, reject) => {
                const timeoutId = global.setTimeout(() => {
                    this.pending.delete(message.id);
                    const error = new Error("No se recibió respuesta del bridge. Comprueba que Roll20 está abierto y que Tampermonkey está activo.");
                    this.dispatchEvent(new CustomEvent("status", { detail: { state: "error", message: error.message } }));
                    reject(error);
                }, this.timeoutMs);

                this.pending.set(message.id, { resolve, reject, timeoutId });
            });

            global.dispatchEvent(new CustomEvent(EVENTS.REQUEST, { detail: message }));
            const messageText = type === MESSAGE_TYPES.DAMAGE_ROLL
                ? "Esperando la tirada de Roll20…"
                : "Enviando comando a Roll20…";
            this.dispatchEvent(new CustomEvent("status", { detail: { state: "sending", message: messageText } }));
            return promise;
        }

        handleResponse(event) {
            const response = event.detail;
            if (!response || typeof response !== "object" || !response.requestId) {
                return;
            }

            const pending = this.pending.get(response.requestId);
            if (!pending) {
                return;
            }

            global.clearTimeout(pending.timeoutId);
            this.pending.delete(response.requestId);

            if (response.success) {
                this.dispatchEvent(new CustomEvent("status", {
                    detail: { state: "connected", message: response.message || "Comando enviado al chat de Roll20." }
                }));
                pending.resolve(response);
            } else {
                const error = new Error(response.error || "Roll20 no pudo procesar el comando.");
                this.dispatchEvent(new CustomEvent("status", { detail: { state: "error", message: error.message } }));
                pending.reject(error);
            }
        }
    }

    ADOM.Roll20 = Object.freeze({
        EVENTS,
        MESSAGE_TYPES,
        Roll20Bridge
    });
})(window);
