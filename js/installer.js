(function (global) {
    "use strict";

    const elements = Object.fromEntries([
        "overallStatus", "overallStatusTitle", "overallStatusText", "extensionStep", "bridgeStep", "roll20Step",
        "browserName", "tampermonkeyLink", "chromiumNote", "chromiumPermissionLead", "userScriptsPermissionLabel", "bridgeInstalledButton", "bridgeVersion",
        "checkConnectionButton", "connectionResult", "readyPanel", "copyGuideLink", "copyResult"
    ].map(id => [id, document.getElementById(id)]));

    const browser = detectBrowser();
    const bridge = new global.ADOM.Roll20.Roll20Bridge({ timeoutMs: 6500 });
    let bridgeVersion = document.documentElement.dataset.adomBridgeVersion || "";
    let roll20Connected = false;

    elements.browserName.textContent = browser.name;
    elements.tampermonkeyLink.href = browser.installUrl;
    elements.tampermonkeyLink.textContent = `Instalar Tampermonkey para ${browser.name}`;
    elements.chromiumNote.hidden = !browser.chromium;
    elements.chromiumPermissionLead.textContent = browser.name === "Opera"
        ? "En Opera, abre Administrar extensión y activa"
        : "Después, abre los detalles de Tampermonkey y activa";
    elements.userScriptsPermissionLabel.textContent = browser.userScriptsPermissionLabel || "Permitir scripts de usuario";

    global.addEventListener("adom-sheet:bridge-installed", event => {
        bridgeVersion = String(event.detail?.version || document.documentElement.dataset.adomBridgeVersion || "instalado");
        renderProgress();
    });

    elements.bridgeInstalledButton.addEventListener("click", () => global.location.reload());
    elements.checkConnectionButton.addEventListener("click", checkConnection);
    elements.copyGuideLink.addEventListener("click", copyGuideLink);

    renderProgress();

    function detectBrowser() {
        const userAgent = navigator.userAgent;
        if (/Firefox\//i.test(userAgent)) {
            return {
                name: "Firefox",
                chromium: false,
                installUrl: "https://www.tampermonkey.net/index.php?browser=firefox&locale=es"
            };
        }
        if (/Edg\//i.test(userAgent)) {
            return {
                name: "Microsoft Edge",
                chromium: true,
                userScriptsPermissionLabel: "Permitir scripts de usuario",
                installUrl: "https://www.tampermonkey.net/index.php?browser=edge&locale=es"
            };
        }
        if (/OPR\//i.test(userAgent)) {
            return {
                name: "Opera",
                chromium: true,
                userScriptsPermissionLabel: "Permitir secuencias de comandos del usuario",
                installUrl: "https://www.tampermonkey.net/index.php?browser=opera&locale=es"
            };
        }
        if (/Safari\//i.test(userAgent) && !/Chrome|Chromium|CriOS/i.test(userAgent)) {
            return {
                name: "Safari",
                chromium: false,
                installUrl: "https://www.tampermonkey.net/index.php?browser=safari&locale=es"
            };
        }
        return {
            name: /Brave/i.test(navigator.brave ? "Brave" : "") ? "Brave" : "Chrome",
            chromium: true,
            userScriptsPermissionLabel: "Permitir scripts de usuario",
            installUrl: "https://www.tampermonkey.net/index.php?browser=chrome&locale=es"
        };
    }

    function setStepState(element, complete) {
        element.dataset.state = complete ? "complete" : "pending";
        element.querySelector(".step-state").textContent = complete ? "Completado" : "Pendiente";
    }

    function renderProgress() {
        const bridgeInstalled = Boolean(bridgeVersion);
        setStepState(elements.extensionStep, bridgeInstalled);
        setStepState(elements.bridgeStep, bridgeInstalled);
        setStepState(elements.roll20Step, roll20Connected);
        elements.bridgeVersion.textContent = bridgeInstalled
            ? `Puente ADOM ${bridgeVersion} detectado y activo.`
            : "Puente no detectado en esta pestaña.";

        const ready = bridgeInstalled && roll20Connected;
        elements.overallStatus.dataset.state = ready ? "ready" : "pending";
        elements.overallStatusTitle.textContent = ready ? "Instalación completada" : "Preparación pendiente";
        elements.overallStatusText.textContent = ready
            ? "La ficha y Roll20 pueden comunicarse."
            : bridgeInstalled
                ? "El puente está instalado; falta comprobar Roll20."
                : "Instala Tampermonkey y el puente ADOM.";
        elements.readyPanel.hidden = !ready;
    }

    async function checkConnection() {
        if (!bridgeVersion) {
            elements.connectionResult.dataset.state = "error";
            elements.connectionResult.textContent = "Primero instala el puente ADOM y recarga esta página.";
            return;
        }

        elements.checkConnectionButton.disabled = true;
        elements.checkConnectionButton.textContent = "Comprobando…";
        elements.connectionResult.dataset.state = "pending";
        elements.connectionResult.textContent = "Buscando una partida de Roll20 abierta…";
        try {
            await bridge.checkConnection();
            roll20Connected = true;
            elements.connectionResult.dataset.state = "success";
            elements.connectionResult.textContent = "Conexión correcta. Roll20 ha respondido sin publicar ningún mensaje.";
        } catch (error) {
            roll20Connected = false;
            elements.connectionResult.dataset.state = "error";
            elements.connectionResult.textContent = "No responde. Abre una partida de Roll20, recárgala y vuelve a comprobar.";
        } finally {
            elements.checkConnectionButton.disabled = false;
            elements.checkConnectionButton.textContent = "Comprobar conexión";
            renderProgress();
        }
    }

    async function copyGuideLink() {
        const guideUrl = global.location.protocol === "http:" || global.location.protocol === "https:"
            ? global.location.href.split("#")[0]
            : "https://adom-web.vercel.app/instalar.html";
        try {
            await navigator.clipboard.writeText(guideUrl);
            elements.copyResult.textContent = "Enlace copiado. Ya puedes enviárselo a tus jugadores.";
        } catch (error) {
            global.prompt("Copia este enlace para tus jugadores:", guideUrl);
        }
    }
})(window);
