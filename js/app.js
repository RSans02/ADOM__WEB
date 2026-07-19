(function (global) {
    "use strict";

    function initialize() {
        const hashParameters = new URLSearchParams(global.location.hash.slice(1));
        const sharedPayload = hashParameters.get("view");
        let sharedState = null;
        if (sharedPayload) {
            try {
                sharedState = global.ADOM.State.decodeShareState(sharedPayload);
            } catch (error) {
                console.warn("[ADOM] El enlace compartido no es válido.", error);
            }
        }
        const viewerMode = Boolean(sharedState);
        const store = new global.ADOM.State.CharacterStore({
            initialState: sharedState,
            persistenceEnabled: !viewerMode
        });
        const bridge = new global.ADOM.Roll20.Roll20Bridge({ timeoutMs: 18000 });
        const ui = new global.ADOM.UI.SheetUI(store, bridge);
        ui.render();
        if (viewerMode) ui.enableViewerMode();

        global.ADOM.app = Object.freeze({ store, bridge, ui, viewerMode });
        console.info("[ADOM] Ficha externa iniciada.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})(window);
