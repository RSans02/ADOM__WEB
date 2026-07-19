// ==UserScript==
// @name         ADOM External Sheet · Roll20 Bridge
// @namespace    https://github.com/RSans02/ADOM__WEB
// @version      2.0.0
// @description  Envía comandos y devuelve a la ficha ADOM los dados lanzados realmente por Roll20.
// @match        file:///C:/ADOM__WEB/*
// @match        https://rsans02.github.io/ADOM__WEB/*
// @match        https://app.roll20.net/editor/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const REQUEST_EVENT = "adom-sheet:bridge-request";
    const RESPONSE_EVENT = "adom-sheet:bridge-response";
    const REQUEST_KEY = "adom.roll20.bridge.request.v2";
    const RESPONSE_KEY = "adom.roll20.bridge.response.v2";
    const RESPONSE_TIMEOUT_MS = 10000;

    function relayResponse(response) {
        GM_setValue(RESPONSE_KEY, { ...response, relayNonce: `${Date.now()}-${Math.random()}` });
    }

    function attachSheetRelay() {
        window.addEventListener(REQUEST_EVENT, event => {
            const request = event.detail;
            if (!request?.id) return;
            GM_setValue(REQUEST_KEY, { ...request, relayNonce: `${Date.now()}-${Math.random()}` });
        });

        GM_addValueChangeListener(RESPONSE_KEY, (_key, _oldValue, response, remote) => {
            if (!remote || !response?.requestId) return;
            window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: response }));
        });
    }

    function findChatControls() {
        const input = document.querySelector("#textchat-input textarea, textarea.ui-autocomplete-input");
        const button = document.querySelector("#textchat-input button[type='submit'], #textchat-input .btn");
        return { input, button };
    }

    function setNativeValue(element, value) {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
        if (descriptor?.set) descriptor.set.call(element, value);
        else element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function submitChatCommand(command) {
        const deadline = Date.now() + 5000;
        let controls;
        do {
            controls = findChatControls();
            if (controls.input && controls.button) break;
            await new Promise(resolve => setTimeout(resolve, 100));
        } while (Date.now() < deadline);

        if (!controls?.input || !controls?.button) throw new Error("No se encontró el chat de Roll20.");
        setNativeValue(controls.input, command);
        controls.button.click();
    }

    function tooltipSources(element) {
        return ["title", "data-original-title", "data-orig-title", "aria-label"]
            .map(attribute => element.getAttribute(attribute))
            .filter(Boolean);
    }

    function extractDice(element, marker) {
        const source = tooltipSources(element).find(value => value.includes(marker));
        if (!source) return null;

        const wrapper = document.createElement("div");
        wrapper.innerHTML = source;
        const classDice = [...wrapper.querySelectorAll(".basicdiceroll")]
            .map(node => Number(node.textContent.trim()))
            .filter(value => Number.isInteger(value) && value >= 1 && value <= 10);
        if (classDice.length >= 3) return classDice.slice(0, 3);

        const plainText = wrapper.textContent || source.replace(/<[^>]+>/g, " ");
        const equation = plainText.includes("=") ? plainText.slice(plainText.lastIndexOf("=") + 1) : plainText;
        const numericDice = (equation.match(/\b(?:10|[1-9])\b/g) || []).map(Number);
        return numericDice.length >= 3 ? numericDice.slice(0, 3) : null;
    }

    function waitForRoll(marker) {
        return new Promise((resolve, reject) => {
            const findResult = root => {
                const candidates = [];
                if (root instanceof Element && root.matches(".inlinerollresult")) candidates.push(root);
                if (root.querySelectorAll) candidates.push(...root.querySelectorAll(".inlinerollresult"));
                for (const candidate of candidates) {
                    const dice = extractDice(candidate, marker);
                    if (dice) return dice;
                }
                return null;
            };

            const existing = findResult(document);
            if (existing) return resolve(existing);

            const observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    const roots = mutation.type === "attributes"
                        ? [mutation.target]
                        : [...mutation.addedNodes];
                    for (const node of roots) {
                        const dice = findResult(node);
                        if (dice) {
                            observer.disconnect();
                            clearTimeout(timeoutId);
                            resolve(dice);
                            return;
                        }
                    }
                }
            });
            observer.observe(document.body, { childList: true, subtree: true, attributes: true });
            const timeoutId = setTimeout(() => {
                observer.disconnect();
                reject(new Error("Roll20 no expuso los tres dados antes de agotar el tiempo."));
            }, RESPONSE_TIMEOUT_MS);
        });
    }

    async function processRequest(request) {
        try {
            if (request.type === "CHAT_COMMAND") {
                await submitChatCommand(String(request.payload?.command || ""));
                relayResponse({ requestId: request.id, success: true, message: "Comando enviado al chat de Roll20." });
                return;
            }
            if (request.type === "DAMAGE_ROLL") {
                const marker = `ADOM-${request.id}`;
                const dicePromise = waitForRoll(marker);
                dicePromise.catch(() => {});
                await submitChatCommand(`[[3d10[${marker}]]]`);
                const dice = await dicePromise;
                relayResponse({
                    requestId: request.id,
                    success: true,
                    payload: { dice },
                    message: `Roll20 devolvió los dados ${dice.join(", ")}.`
                });
                return;
            }
            throw new Error(`Tipo de mensaje no compatible: ${request.type}`);
        } catch (error) {
            relayResponse({ requestId: request.id, success: false, error: error.message || String(error) });
        }
    }

    function attachRoll20Relay() {
        let queue = Promise.resolve();
        GM_addValueChangeListener(REQUEST_KEY, (_key, _oldValue, request, remote) => {
            if (!remote || !request?.id) return;
            queue = queue.then(() => processRequest(request));
        });
    }

    if (location.hostname === "app.roll20.net") attachRoll20Relay();
    else attachSheetRelay();
})();
