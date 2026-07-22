(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};
    const LATEST_BRIDGE_VERSION = "0.6.1";

    const EVENTS = Object.freeze({
        REQUEST: "adom-sheet:bridge-request",
        RESPONSE: "adom-sheet:bridge-response",
        CHAT_UPDATE: "adom-sheet:chat-update"
    });

    const MESSAGE_TYPES = Object.freeze({
        PING: "PING",
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
            this.protocolVersion = 3;
            this.timeoutMs = options?.timeoutMs || 8000;
            this.pending = new Map();
            this.installedBridgeVersion = "";
            this.updateRequired = false;
            global.addEventListener(EVENTS.RESPONSE, event => this.handleResponse(event));
            global.addEventListener(EVENTS.CHAT_UPDATE, event => this.handleChatUpdate(event));
            global.addEventListener("adom-sheet:bridge-installed", event => this.handleBridgeInstalled(event.detail));
            global.setTimeout(() => this.handleBridgeInstalled({
                version: document.documentElement.dataset.adomBridgeVersion || ""
            }), 0);
        }

        handleBridgeInstalled(detail) {
            const version = String(detail?.version || "").trim();
            if (!version) return;
            this.installedBridgeVersion = version;
            this.updateRequired = compareVersions(version, LATEST_BRIDGE_VERSION) < 0;
            if (this.updateRequired) this.dispatchUpdateRequiredStatus();
        }

        dispatchUpdateRequiredStatus() {
            this.dispatchEvent(new CustomEvent("status", {
                detail: {
                    state: "update-required",
                    message: `Hay una actualización del puente disponible (${LATEST_BRIDGE_VERSION}).`,
                    installedVersion: this.installedBridgeVersion,
                    latestVersion: LATEST_BRIDGE_VERSION
                }
            }));
        }

        sendChatCommand(command, speakerName = "") {
            const normalized = String(command || "").trim();
            if (!normalized) {
                return Promise.reject(new Error("El comando está vacío."));
            }

            return this.sendRequest(
                MESSAGE_TYPES.CHAT_COMMAND,
                { command: normalized, speakerName: String(speakerName || "").trim() },
                "Enviando comando a Roll20…"
            );
        }

        async rollDamageDice(skillValue, attributeValue, weaponName = "", speakerName = "") {
            const response = await this.sendRequest(
                MESSAGE_TYPES.DAMAGE_ROLL,
                {
                    skillValue: Number(skillValue) || 0,
                    attributeValue: Number(attributeValue) || 0,
                    weaponName: String(weaponName || ""),
                    speakerName: String(speakerName || "").trim()
                },
                "Esperando la tirada de Roll20…"
            );
            const dice = response?.data?.dice;
            if (!Array.isArray(dice) || dice.length !== 3 || dice.some(value => !Number.isInteger(value) || value < 1 || value > 10)) {
                throw new Error("Roll20 respondió sin los tres dados de daño.");
            }
            return dice;
        }

        sendRequest(type, payload, statusMessage) {

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
            if (this.updateRequired) this.dispatchUpdateRequiredStatus();
            else this.dispatchEvent(new CustomEvent("status", { detail: { state: "sending", message: statusMessage } }));
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
                const speaker = response.data?.speaker;
                if (speaker?.requested && !speaker.matched) {
                    this.dispatchEvent(new CustomEvent("speaker-missing", { detail: speaker }));
                }
                if (this.updateRequired) this.dispatchUpdateRequiredStatus();
                else this.dispatchEvent(new CustomEvent("status", {
                    detail: { state: "connected", message: response.message || "Comando enviado al chat de Roll20." }
                }));
                pending.resolve(response);
            } else {
                const error = new Error(response.error || "Roll20 no pudo procesar el comando.");
                this.dispatchEvent(new CustomEvent("status", { detail: { state: "error", message: error.message } }));
                pending.reject(error);
            }
        }

        checkConnection() {
            return this.sendRequest(
                MESSAGE_TYPES.PING,
                {},
                "Comprobando la conexión con Roll20…"
            );
        }

        handleChatUpdate(event) {
            const messages = event.detail?.messages;
            if (!Array.isArray(messages)) return;
            this.dispatchEvent(new CustomEvent("chat", { detail: { messages } }));
            if (this.updateRequired) this.dispatchUpdateRequiredStatus();
            else this.dispatchEvent(new CustomEvent("status", {
                detail: { state: "connected", message: "Chat sincronizado con Roll20." }
            }));
        }
    }

    function compareVersions(left, right) {
        const leftParts = String(left || "").split(".").map(part => Number.parseInt(part, 10) || 0);
        const rightParts = String(right || "").split(".").map(part => Number.parseInt(part, 10) || 0);
        const length = Math.max(leftParts.length, rightParts.length);
        for (let index = 0; index < length; index += 1) {
            const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
            if (difference) return difference < 0 ? -1 : 1;
        }
        return 0;
    }

    ADOM.Roll20 = Object.freeze({
        EVENTS,
        MESSAGE_TYPES,
        LATEST_BRIDGE_VERSION,
        Roll20Bridge
    });
})(window);
