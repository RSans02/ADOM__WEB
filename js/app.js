(function (global) {
    "use strict";

    function initialize() {
        const store = new global.ADOM.State.CharacterStore();
        const bridge = new global.ADOM.Roll20.Roll20Bridge({ timeoutMs: 8000 });
        const ui = new global.ADOM.UI.SheetUI(store, bridge);
        ui.render();

        global.ADOM.app = Object.freeze({ store, bridge, ui });
        console.info("[ADOM] Ficha externa iniciada.");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})(window);
