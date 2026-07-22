(function (global) {
    "use strict";

    const elements = Object.fromEntries([
        "overallStatus", "overallStatusTitle", "overallStatusText", "extensionStep", "bridgeStep", "roll20Step",
        "browserName", "tampermonkeyLink", "chromiumNote", "chromiumPermissionLead", "userScriptsPermissionLabel", "bridgeStepTitle", "bridgeStepDescription",
        "bridgeInstallLink", "bridgeInstalledButton", "bridgeVersion",
        "checkConnectionButton", "connectionResult", "readyPanel", "copyGuideLink", "copyResult"
    ].map(id => [id, document.getElementById(id)]));

    const browser = detectBrowser();
    const latestBridgeVersion = global.ADOM.Roll20.LATEST_BRIDGE_VERSION;
    const bridge = new global.ADOM.Roll20.Roll20Bridge({ timeoutMs: 6500 });
    let bridgeVersion = document.documentElement.dataset.adomBridgeVersion || "";
    let roll20Connected = false;
    let automaticCheckStarted = false;
    let connectionCheckRunning = false;
    let bridgeActionPending = false;

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
        startAutomaticConnectionCheck();
    });

    elements.bridgeInstallLink.addEventListener("click", () => {
        bridgeActionPending = true;
    });
    elements.bridgeInstalledButton.addEventListener("click", () => global.location.reload());
    global.addEventListener("focus", refreshAfterBridgeAction);
    document.addEventListener("visibilitychange", refreshAfterBridgeAction);
    elements.checkConnectionButton.addEventListener("click", checkConnection);
    elements.copyGuideLink.addEventListener("click", copyGuideLink);

    renderProgress();
    startAutomaticConnectionCheck();

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

    function bridgeNeedsUpdate() {
        return Boolean(bridgeVersion) && compareVersions(bridgeVersion, latestBridgeVersion) < 0;
    }

    function renderProgress() {
        const bridgeInstalled = Boolean(bridgeVersion);
        const updateRequired = bridgeNeedsUpdate();
        const bridgeReady = bridgeInstalled && !updateRequired;
        setStepState(elements.extensionStep, bridgeInstalled);
        setStepState(elements.bridgeStep, bridgeReady);
        if (updateRequired) {
            elements.bridgeStep.dataset.state = "update";
            elements.bridgeStep.querySelector(".step-state").textContent = "Actualizar";
        }
        setStepState(elements.roll20Step, roll20Connected && !updateRequired);
        elements.bridgeVersion.textContent = updateRequired
            ? `Tienes el puente ADOM ${bridgeVersion}. Hay una versión nueva disponible.`
            : bridgeInstalled
                ? `Puente ADOM ${bridgeVersion} detectado y activo.`
            : "Puente no detectado en esta pestaña.";
        elements.bridgeStepTitle.textContent = bridgeReady
            ? "Puente ADOM instalado"
            : updateRequired
                ? "Actualiza el puente ADOM"
                : "Instala el puente ADOM";
        elements.bridgeStepDescription.innerHTML = bridgeReady
            ? "La versión instalada está al día y se ha detectado automáticamente."
            : updateRequired
                ? "Se abrirá Tampermonkey. Pulsa <strong>Actualizar</strong> y vuelve a esta pestaña."
                : "Se abrirá Tampermonkey. Pulsa <strong>Instalar</strong>; no necesitas copiar ni configurar ningún código.";
        elements.bridgeInstallLink.textContent = updateRequired ? "Actualizar puente ADOM" : "Instalar puente ADOM";
        elements.bridgeInstalledButton.textContent = updateRequired ? "Ya lo he actualizado" : "Ya lo he instalado";
        elements.bridgeInstallLink.hidden = bridgeReady;
        elements.bridgeInstalledButton.hidden = bridgeReady;

        const ready = bridgeInstalled && !updateRequired && roll20Connected;
        elements.overallStatus.dataset.state = ready ? "ready" : updateRequired ? "update" : "pending";
        elements.overallStatusTitle.textContent = ready
            ? "Instalación completada"
            : updateRequired
                ? "Actualización disponible"
                : "Preparación pendiente";
        elements.overallStatusText.textContent = ready
            ? "La ficha y Roll20 pueden comunicarse."
            : updateRequired
                ? "Actualiza el puente ADOM para continuar."
            : bridgeInstalled
                ? "El puente está instalado; falta comprobar Roll20."
                : "Instala Tampermonkey y el puente ADOM.";
        elements.readyPanel.hidden = !ready;
    }

    function refreshAfterBridgeAction() {
        if (!bridgeActionPending || document.visibilityState === "hidden") return;
        bridgeActionPending = false;
        global.setTimeout(() => global.location.reload(), 250);
    }

    function startAutomaticConnectionCheck() {
        if (!bridgeVersion || bridgeNeedsUpdate() || automaticCheckStarted) return;
        automaticCheckStarted = true;
        global.setTimeout(() => checkConnection(), 350);
    }

    async function checkConnection() {
        if (connectionCheckRunning) return;
        if (!bridgeVersion) {
            elements.connectionResult.dataset.state = "error";
            elements.connectionResult.textContent = "Primero instala el puente ADOM y recarga esta página.";
            return;
        }
        if (bridgeNeedsUpdate()) {
            elements.connectionResult.dataset.state = "error";
            elements.connectionResult.textContent = "Actualiza primero el puente ADOM y recarga esta página.";
            return;
        }

        connectionCheckRunning = true;
        elements.checkConnectionButton.disabled = true;
        elements.checkConnectionButton.textContent = "Comprobando…";
        elements.connectionResult.dataset.state = "pending";
        elements.connectionResult.textContent = "Buscando una partida de Roll20 abierta…";
        try {
            await bridge.checkConnection();
            roll20Connected = true;
            elements.connectionResult.dataset.state = "success";
            elements.connectionResult.textContent = "Conexión correcta con Roll20.";
        } catch (error) {
            roll20Connected = false;
            elements.connectionResult.dataset.state = "error";
            elements.connectionResult.textContent = "No responde. Abre una partida de Roll20, recárgala y vuelve a comprobar.";
        } finally {
            connectionCheckRunning = false;
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
})(window);
