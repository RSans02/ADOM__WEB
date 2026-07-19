(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};
    const DEFAULT_PORTRAIT_URL = "https://img.magnific.com/vector-gratis/ilustracion-icono-galeria_53876-27002.jpg";

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function diceIcon() {
        return `<svg class="dice-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="3" y="3" width="18" height="18" rx="4"></rect>
            <circle cx="8" cy="8" r="1.45"></circle>
            <circle cx="16" cy="8" r="1.45"></circle>
            <circle cx="12" cy="12" r="1.45"></circle>
            <circle cx="8" cy="16" r="1.45"></circle>
            <circle cx="16" cy="16" r="1.45"></circle>
        </svg>`;
    }

    function parseHexColor(hex) {
        const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));
        return match ? [
            Number.parseInt(match[1], 16),
            Number.parseInt(match[2], 16),
            Number.parseInt(match[3], 16)
        ] : [166, 77, 120];
    }

    function mixHexColor(hex, target, amount) {
        const source = parseHexColor(hex);
        const mixed = source.map((channel, index) => Math.round(channel + (target[index] - channel) * amount));
        return `#${mixed.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
    }

    class SheetUI {
        constructor(store, bridge) {
            this.store = store;
            this.bridge = bridge;
            this.portraitDrag = null;
            this.viewerMode = false;
            this.elements = this.collectElements();
            this.bindStaticEvents();
            this.store.addEventListener("change", event => {
                if (event.detail?.source === "live-input") {
                    this.refreshComputedOutputs();
                    return;
                }
                this.render();
            });
            this.store.addEventListener("save-state", event => this.renderSaveState(event.detail.state));
            this.bridge.addEventListener("status", event => this.renderBridgeStatus(event.detail));
        }

        collectElements() {
            const ids = [
                "appShell", "humanTab", "ecstasyTab", "viewerBadge", "saveStatus", "shareButton", "exportButton", "importInput", "resetButton",
                "characterName", "characterImageUrl", "portraitPreviewWrap", "characterPortrait", "characterPortraitPlaceholder", "portraitAdjustments", "portraitAdjustmentHelp", "characterImageFrame", "characterImageZoom", "characterImageZoomValue", "resetImageTransformButton", "applyImageUrlButton", "clearImageUrlButton", "characterConcept", "characterComplication", "attributesList", "attributesTotal",
                "skillsList", "skillsTotal", "temporalAspectsList",
                "dramaTrack", "extraExperience", "milestonesList", "healthPanel", "combatPanel",
                "addWeaponButton", "distortionPanel", "arcaneCard", "arcaneSkillsList", "arcaneTotal", "addArcaneSkillButton",
                "bondsTitle", "bondsNote", "bondsPanel", "checksPanel", "experienceTotal", "adjustedExperienceRow", "adjustedExperience",
                "tierLabel", "tierValue", "humanColorInput", "humanBackgroundInput", "ecstasyColorInput", "ecstasyBackgroundInput", "manualCommand", "sendCommandButton", "connectionStatus",
                "bridgeMessage", "formHelp", "toastRegion"
            ];
            return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
        }

        bindStaticEvents() {
            this.elements.humanTab.addEventListener("click", () => this.setActiveForm("human"));
            this.elements.ecstasyTab.addEventListener("click", () => this.setActiveForm("ecstasy"));

            this.bindTextInput(this.elements.characterName, state => state.profile.name, (state, value) => { state.profile.name = value; });
            this.elements.applyImageUrlButton.addEventListener("click", () => this.applyCharacterImageUrl());
            this.elements.clearImageUrlButton.addEventListener("click", () => this.clearCharacterImageUrl());
            this.elements.characterImageUrl.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.applyCharacterImageUrl();
                }
            });
            this.elements.characterPortrait.addEventListener("error", () => {
                const failedDefault = this.elements.characterPortrait.dataset.defaultPortrait === "true";
                this.elements.characterPortrait.hidden = true;
                this.elements.characterPortraitPlaceholder.hidden = false;
                if (!failedDefault) {
                    this.showToast("La imagen no se pudo cargar. Se mostrará la imagen predeterminada.", "error");
                    this.store.update(state => {
                        state.profile.imageUrl = "";
                        state.profile.imageTransform = { x: 0, y: 0, zoom: 1 };
                    });
                }
            });
            this.elements.characterPortrait.addEventListener("load", () => {
                this.elements.characterPortrait.hidden = false;
                this.elements.characterPortraitPlaceholder.hidden = true;
                const profile = this.store.getState().profile;
                this.applyPortraitTransform(this.hasCustomPortrait() ? profile.imageTransform : { x: 0, y: 0, zoom: 1 });
            });
            this.elements.characterPortrait.addEventListener("pointerdown", event => this.startPortraitDrag(event));
            this.elements.characterPortrait.addEventListener("pointermove", event => this.movePortraitDrag(event));
            this.elements.characterPortrait.addEventListener("pointerup", event => this.finishPortraitDrag(event));
            this.elements.characterPortrait.addEventListener("pointercancel", event => this.finishPortraitDrag(event));
            this.elements.characterPortrait.addEventListener("wheel", event => this.zoomPortraitWithWheel(event), { passive: false });
            this.elements.characterImageZoom.addEventListener("input", event => {
                const zoom = this.clampNumber(event.target.value, 1, 3, 1);
                this.store.update(state => {
                    state.profile.imageTransform.zoom = zoom;
                    this.constrainPortraitPosition(state.profile.imageTransform);
                }, { source: "live-input" });
                this.applyPortraitTransform(this.store.getState().profile.imageTransform);
            });
            this.elements.characterImageFrame.addEventListener("change", event => {
                this.store.update(state => {
                    state.profile.imageFrame = event.target.value === "portrait" ? "portrait" : "square";
                }, { source: "image-frame" });
            });
            this.elements.resetImageTransformButton.addEventListener("click", () => {
                this.store.update(state => { state.profile.imageTransform = { x: 0, y: 0, zoom: 1 }; });
            });
            global.addEventListener("resize", () => {
                const profile = this.store.getState().profile;
                this.applyPortraitTransform(this.hasCustomPortrait() ? profile.imageTransform : { x: 0, y: 0, zoom: 1 });
            });
            this.bindTextInput(this.elements.characterConcept, state => state.profile.concept, (state, value) => { state.profile.concept = value; });
            this.bindTextInput(this.elements.characterComplication, state => state.profile.complication, (state, value) => { state.profile.complication = value; });
            this.elements.humanColorInput.addEventListener("input", event => this.setFormColor("human", event.target.value));
            this.elements.ecstasyColorInput.addEventListener("input", event => this.setFormColor("ecstasy", event.target.value));
            this.elements.humanBackgroundInput.addEventListener("input", event => this.setFormBackground("human", event.target.value));
            this.elements.ecstasyBackgroundInput.addEventListener("input", event => this.setFormBackground("ecstasy", event.target.value));

            this.elements.extraExperience.addEventListener("input", event => {
                this.store.update(state => {
                    state[state.activeForm].extraExperience = this.numberFromInput(event.target.value);
                }, { source: "live-input" });
            });

            this.elements.addWeaponButton.addEventListener("click", () => {
                this.store.update(state => state.human.weapons.push({ name: "", damage: "" }));
            });
            this.elements.addArcaneSkillButton.addEventListener("click", () => {
                this.store.update(state => state.ecstasy.arcaneSkills.push({ name: "", value: 1 }));
            });

            this.elements.sendCommandButton.addEventListener("click", () => this.sendManualCommand());
            this.elements.manualCommand.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.sendManualCommand();
                }
            });

            this.elements.exportButton.addEventListener("click", () => this.exportCharacter());
            this.elements.shareButton.addEventListener("click", () => this.shareCharacter());
            this.elements.importInput.addEventListener("change", event => this.importCharacter(event));
            this.elements.resetButton.addEventListener("click", () => this.resetCharacter());
        }

        bindTextInput(element, getter, setter) {
            element.addEventListener("input", event => {
                this.store.update(state => setter(state, event.target.value), { source: "live-input" });
            });
            element.dataset.getter = getter;
        }

        setActiveForm(formKey) {
            this.store.update(state => { state.activeForm = formKey; }, { source: "form-switch" });
        }

        render() {
            const state = this.store.getState();
            const formKey = state.activeForm;
            const form = state[formKey];
            const derived = ADOM.Calculations.deriveForm(state, formKey);

            this.elements.appShell.dataset.form = formKey;
            this.applyFormTheme(state.settings.formColors[formKey], state.settings.formBackgrounds[formKey]);
            this.renderTabs(formKey);
            this.renderCharacterPortrait(state.profile);
            this.syncStaticFields(state, form);
            this.renderAttributes(form, derived);
            this.renderSkills(form, derived);
            this.renderTemporalAspects(state.profile.temporalAspects);
            this.renderDrama(form.drama);
            this.renderMilestones(state.profile.milestones);
            this.renderHealth(form, derived);
            this.renderCombat(form, state.human.weapons, derived);
            this.renderDistortion(state.distortion, derived);
            this.renderArcane(formKey, form, derived);
            this.renderBonds(formKey, this.getVisibleBonds(state, formKey));
            this.renderChecks(formKey, derived);
            this.renderHelp(formKey);
            if (this.viewerMode) this.applyViewerRestrictions();
        }

        enableViewerMode() {
            this.viewerMode = true;
            this.applyViewerRestrictions();
        }

        applyViewerRestrictions() {
            this.elements.appShell.dataset.viewer = "true";
            this.elements.viewerBadge.hidden = false;
            this.elements.appShell.querySelectorAll("input, textarea, select").forEach(element => { element.disabled = true; });
            this.elements.appShell.querySelectorAll("button:not(.form-tab)").forEach(element => { element.disabled = true; });
        }

        refreshComputedOutputs() {
            const state = this.store.getState();
            const formKey = state.activeForm;
            const form = state[formKey];
            const derived = ADOM.Calculations.deriveForm(state, formKey);

            this.elements.attributesTotal.textContent = derived.attributesTotal;
            this.elements.skillsTotal.textContent = derived.skillsTotal;
            if (formKey === "ecstasy") {
                this.elements.arcaneTotal.textContent = derived.arcaneTotal;
            }

            const outputs = {
                initiative: derived.initiative,
                rangedDamage: derived.rangedDamage,
                meleeDamage: derived.meleeDamage,
                woundThreshold: derived.woundThreshold,
                totalResistance: derived.totalResistance,
                ecstasyExit: derived.ecstasyExit
            };

            for (const [name, value] of Object.entries(outputs)) {
                const element = document.querySelector(`[data-output="${name}"]`);
                if (element) element.textContent = value;
            }

            const visibleBonds = this.getVisibleBonds(state, formKey);
            this.elements.bondsPanel.querySelectorAll(".bond-row").forEach((row, index) => {
                const level = ADOM.Calculations.number(visibleBonds[index]?.level);
                const values = [Math.floor(level / 2), level, level * 2];
                row.querySelectorAll(".bond-derived").forEach((cell, cellIndex) => {
                    cell.textContent = values[cellIndex] ?? 0;
                });
            });

            this.renderChecks(formKey, derived);
        }

        renderTabs(formKey) {
            const humanActive = formKey === "human";
            this.elements.humanTab.classList.toggle("is-active", humanActive);
            this.elements.humanTab.setAttribute("aria-selected", String(humanActive));
            this.elements.ecstasyTab.classList.toggle("is-active", !humanActive);
            this.elements.ecstasyTab.setAttribute("aria-selected", String(!humanActive));
        }

        syncStaticFields(state, form) {
            this.syncInput(this.elements.characterName, state.profile.name);
            this.syncInput(this.elements.characterImageUrl, state.profile.imageUrl);
            this.syncInput(this.elements.characterConcept, state.profile.concept);
            this.syncInput(this.elements.characterComplication, state.profile.complication);
            this.syncInput(this.elements.extraExperience, form.extraExperience);
            this.syncInput(this.elements.humanColorInput, state.settings.formColors.human);
            this.syncInput(this.elements.ecstasyColorInput, state.settings.formColors.ecstasy);
            this.syncInput(this.elements.humanBackgroundInput, state.settings.formBackgrounds.human);
            this.syncInput(this.elements.ecstasyBackgroundInput, state.settings.formBackgrounds.ecstasy);
        }

        setFormColor(formKey, color) {
            this.store.update(state => {
                state.settings.formColors[formKey] = color;
            }, { source: "theme-color" });
        }

        setFormBackground(formKey, color) {
            this.store.update(state => {
                state.settings.formBackgrounds[formKey] = color;
            }, { source: "theme-background" });
        }

        applyFormTheme(color, background) {
            const rgb = parseHexColor(color);
            this.elements.appShell.style.setProperty("--accent", color);
            this.elements.appShell.style.setProperty("--accent-strong", mixHexColor(color, [0, 0, 0], 0.28));
            this.elements.appShell.style.setProperty("--accent-soft", mixHexColor(color, [255, 255, 255], 0.86));
            this.elements.appShell.style.setProperty("--accent-rgb", rgb.join(", "));
            this.elements.appShell.style.setProperty("--page-bg", background);
            this.elements.appShell.style.setProperty("--page-bg-deep", mixHexColor(background, [0, 0, 0], 0.08));
        }

        syncInput(element, value) {
            if (document.activeElement !== element) {
                element.value = value ?? "";
            }
        }

        renderCharacterPortrait(profile) {
            const customUrl = String(profile.imageUrl || "").trim();
            const url = customUrl || DEFAULT_PORTRAIT_URL;
            const hasCustomImage = Boolean(customUrl);
            this.elements.characterPortrait.dataset.defaultPortrait = String(!hasCustomImage);
            this.elements.characterPortrait.classList.toggle("is-adjustable", hasCustomImage);
            this.elements.clearImageUrlButton.hidden = !hasCustomImage;
            this.elements.portraitAdjustments.hidden = !hasCustomImage;
            this.elements.portraitAdjustmentHelp.hidden = !hasCustomImage;
            this.elements.portraitPreviewWrap.dataset.frame = profile.imageFrame === "portrait" ? "portrait" : "square";
            this.syncInput(this.elements.characterImageFrame, profile.imageFrame);
            this.applyPortraitTransform(hasCustomImage ? profile.imageTransform : { x: 0, y: 0, zoom: 1 });
            if (this.elements.characterPortrait.src !== url) {
                this.elements.characterPortrait.hidden = true;
                this.elements.characterPortraitPlaceholder.hidden = false;
                this.elements.characterPortrait.src = url;
            }
        }

        applyCharacterImageUrl() {
            const url = this.elements.characterImageUrl.value.trim();
            if (url && !/^https?:\/\//i.test(url)) {
                this.showToast("La imagen debe usar una URL pública que empiece por http:// o https://.", "error");
                return;
            }
            this.store.update(state => {
                if (state.profile.imageUrl !== url) {
                    state.profile.imageTransform = { x: 0, y: 0, zoom: 1 };
                }
                state.profile.imageUrl = url;
            });
        }

        clearCharacterImageUrl() {
            this.elements.characterImageUrl.value = "";
            this.store.update(state => {
                state.profile.imageUrl = "";
                state.profile.imageTransform = { x: 0, y: 0, zoom: 1 };
            });
        }

        applyPortraitTransform(transform) {
            const x = this.clampNumber(transform?.x, -100, 100, 0);
            const y = this.clampNumber(transform?.y, -100, 100, 0);
            const zoom = this.clampNumber(transform?.zoom, 1, 3, 1);
            const geometry = this.getPortraitGeometry(zoom);
            if (geometry) {
                const offsetX = geometry.maxX * x / 100;
                const offsetY = geometry.maxY * y / 100;
                this.elements.characterPortrait.style.width = `${geometry.baseWidth}px`;
                this.elements.characterPortrait.style.height = `${geometry.baseHeight}px`;
                this.elements.characterPortrait.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
            }
            this.elements.characterImageZoom.value = String(zoom);
            this.elements.characterImageZoomValue.value = `${Math.round(zoom * 100)}%`;
        }

        getPortraitGeometry(zoom) {
            const image = this.elements.characterPortrait;
            const bounds = this.elements.portraitPreviewWrap.getBoundingClientRect();
            if (!image.naturalWidth || !image.naturalHeight || !bounds.width || !bounds.height) return null;
            const coverScale = Math.max(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
            const baseWidth = image.naturalWidth * coverScale;
            const baseHeight = image.naturalHeight * coverScale;
            return {
                baseWidth,
                baseHeight,
                maxX: Math.max(0, (baseWidth * zoom - bounds.width) / 2),
                maxY: Math.max(0, (baseHeight * zoom - bounds.height) / 2)
            };
        }

        startPortraitDrag(event) {
            if (!this.hasCustomPortrait() || this.elements.characterPortrait.hidden || event.button !== 0) return;
            const transform = this.store.getState().profile.imageTransform;
            this.portraitDrag = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                imageX: transform.x,
                imageY: transform.y
            };
            this.elements.characterPortrait.setPointerCapture(event.pointerId);
            this.elements.characterPortrait.classList.add("is-dragging");
            event.preventDefault();
        }

        movePortraitDrag(event) {
            if (!this.portraitDrag || this.portraitDrag.pointerId !== event.pointerId) return;
            const transform = this.store.getState().profile.imageTransform;
            const geometry = this.getPortraitGeometry(transform.zoom);
            if (!geometry) return;
            const startOffsetX = geometry.maxX * this.portraitDrag.imageX / 100;
            const startOffsetY = geometry.maxY * this.portraitDrag.imageY / 100;
            const offsetX = this.clampNumber(startOffsetX + event.clientX - this.portraitDrag.startX, -geometry.maxX, geometry.maxX, 0);
            const offsetY = this.clampNumber(startOffsetY + event.clientY - this.portraitDrag.startY, -geometry.maxY, geometry.maxY, 0);
            transform.x = geometry.maxX ? offsetX / geometry.maxX * 100 : 0;
            transform.y = geometry.maxY ? offsetY / geometry.maxY * 100 : 0;
            this.applyPortraitTransform(transform);
        }

        finishPortraitDrag(event) {
            if (!this.portraitDrag || this.portraitDrag.pointerId !== event.pointerId) return;
            this.portraitDrag = null;
            this.elements.characterPortrait.classList.remove("is-dragging");
            this.store.update(() => {}, { source: "portrait-drag" });
        }

        zoomPortraitWithWheel(event) {
            if (!this.hasCustomPortrait() || this.elements.characterPortrait.hidden) return;
            event.preventDefault();
            const direction = event.deltaY < 0 ? 0.1 : -0.1;
            this.store.update(state => {
                state.profile.imageTransform.zoom = this.clampNumber(state.profile.imageTransform.zoom + direction, 1, 3, 1);
                this.constrainPortraitPosition(state.profile.imageTransform);
            }, { source: "portrait-zoom" });
        }

        constrainPortraitPosition(transform) {
            transform.x = this.clampNumber(transform.x, -100, 100, 0);
            transform.y = this.clampNumber(transform.y, -100, 100, 0);
        }

        hasCustomPortrait() {
            return !this.viewerMode && Boolean(String(this.store.getState().profile.imageUrl || "").trim());
        }

        shareCharacter() {
            const payload = ADOM.State.encodeShareState(this.store.getState());
            const baseUrl = global.location.href.split("#")[0];
            const shareUrl = `${baseUrl}#view=${payload}`;
            global.prompt("Copia este enlace para compartir la ficha en modo de solo lectura:", shareUrl);
            if (global.location.protocol === "file:") {
                this.showToast("El enlace local solo funcionará donde exista esta misma ruta. Publícalo por HTTP/HTTPS para compartirlo con otras personas.", "info");
            }
        }

        clampNumber(value, minimum, maximum, fallback) {
            const parsed = Number(value);
            const safeValue = Number.isFinite(parsed) ? parsed : fallback;
            return Math.min(maximum, Math.max(minimum, safeValue));
        }

        renderAttributes(form, derived) {
            this.elements.attributesTotal.textContent = derived.attributesTotal;
            this.elements.attributesList.innerHTML = form.attributes.map((attribute, index) => `
                <div class="stat-row">
                    <span class="stat-code">${escapeHtml(attribute.code)}</span>
                    <input type="text" value="${escapeHtml(attribute.descriptor)}" aria-label="Descriptor de ${escapeHtml(attribute.code)}" data-action="attribute-descriptor" data-index="${index}">
                    <input class="stat-value" type="number" min="0" step="1" value="${attribute.value}" aria-label="Valor de ${escapeHtml(attribute.code)}" data-action="attribute-value" data-index="${index}">
                    <button class="roll-button" type="button" title="Lanzar dado base + ${attribute.value}" aria-label="Tirar ${escapeHtml(attribute.code)}" data-action="roll-stat" data-kind="attribute" data-index="${index}">${diceIcon()}</button>
                </div>
            `).join("");
            this.bindDynamicContainer(this.elements.attributesList);
        }

        renderSkills(form, derived) {
            this.elements.skillsTotal.textContent = derived.skillsTotal;
            this.elements.skillsList.innerHTML = form.skills.map((skill, index) => `
                <div class="skill-block">
                    <div class="stat-row skill-main-row">
                        <span class="stat-code">↳</span>
                        <span class="skill-name">${escapeHtml(skill.label)}</span>
                        <input class="stat-value" type="number" min="0" step="1" value="${skill.value}" aria-label="Valor de ${escapeHtml(skill.label)}" data-action="skill-value" data-index="${index}">
                        <button class="roll-button" type="button" title="Tirar habilidad y elegir atributo" aria-label="Tirar ${escapeHtml(skill.label)}" data-action="roll-stat" data-kind="skill" data-index="${index}">${diceIcon()}</button>
                    </div>
                    <div class="skill-talents" aria-label="Talentos de ${escapeHtml(skill.label)}">
                        <input type="text" value="${escapeHtml(skill.talents?.[0] ?? "")}" placeholder="Talento 1" data-action="skill-talent" data-index="${index}" data-talent-index="0">
                        <input type="text" value="${escapeHtml(skill.talents?.[1] ?? "")}" placeholder="Talento 2" data-action="skill-talent" data-index="${index}" data-talent-index="1">
                    </div>
                </div>
            `).join("");
            this.bindDynamicContainer(this.elements.skillsList);
        }

        renderTemporalAspects(items) {
            this.elements.temporalAspectsList.innerHTML = items.map((item, index) => `
                <div class="repeatable-row">
                    <input type="text" value="${escapeHtml(item)}" placeholder="Aspecto temporal ${index + 1}" data-action="temporal" data-index="${index}">
                    <button class="icon-button" type="button" title="Vaciar" aria-label="Vaciar aspecto temporal" data-action="clear-temporal" data-index="${index}">×</button>
                </div>
            `).join("");
            this.bindDynamicContainer(this.elements.temporalAspectsList);
        }

        renderDrama(values) {
            this.elements.dramaTrack.innerHTML = values.map((checked, index) => `
                <label class="track-check" title="Drama ${index + 1}">
                    <input type="checkbox" ${checked ? "checked" : ""} data-action="drama" data-index="${index}">
                </label>
            `).join("");
            this.bindDynamicContainer(this.elements.dramaTrack);
        }

        renderMilestones(items) {
            const fixedItems = Array.from({ length: 6 }, (_, index) => items[index] ?? "");
            this.elements.milestonesList.innerHTML = fixedItems.map((item, index) => `
                <div class="fixed-row">
                    <span class="fixed-row-number">${index + 1}</span>
                    <input type="text" value="${escapeHtml(item)}" placeholder="Hito ${index + 1}" data-action="milestone" data-index="${index}">
                </div>
            `).join("");
            this.bindDynamicContainer(this.elements.milestonesList);
        }

        renderHealth(form, derived) {
            this.elements.healthPanel.innerHTML = `
                <div class="derived-row"><span>Umbral de herida</span><strong class="derived-value" data-output="woundThreshold">${derived.woundThreshold}</strong></div>
                <div class="derived-row"><span>Resistencia total</span><strong class="derived-value" data-output="totalResistance">${derived.totalResistance}</strong></div>
                <div class="health-current-row">
                    <label for="currentResistanceInput">Resistencia actual</label>
                    <input id="currentResistanceInput" type="number" min="0" step="1" value="${form.health.currentResistance}" data-action="current-resistance">
                </div>
                <div class="wounds-block">
                    <p class="wounds-title">Heridas</p>
                    <div class="wound-row"><span>Leves</span>${form.health.lightWounds.map((checked, index) => `<label class="wound-marker"><input type="checkbox" ${checked ? "checked" : ""} data-action="light-wound" data-index="${index}"></label>`).join("")}</div>
                    <div class="wound-row"><span>Graves</span>${form.health.severeWounds.map((checked, index) => `<label class="wound-marker"><input type="checkbox" ${checked ? "checked" : ""} data-action="severe-wound" data-index="${index}"></label>`).join("")}</div>
                    <p class="skull-note">☠ Marca el estado de heridas; la interpretación mecánica queda a cargo de la mesa.</p>
                </div>
            `;
            this.bindDynamicContainer(this.elements.healthPanel);
        }

        renderCombat(form, weapons, derived) {
            this.elements.combatPanel.innerHTML = `
                <div class="derived-row"><span>Iniciativa</span><strong class="derived-value" data-output="initiative">${derived.initiative}</strong></div>
                <div class="derived-row"><span>Daño a distancia</span><strong class="derived-value" data-output="rangedDamage">${derived.rangedDamage}</strong></div>
                <div class="derived-row"><span>Daño cuerpo a cuerpo</span><strong class="derived-value" data-output="meleeDamage">${derived.meleeDamage}</strong></div>
                <div class="health-current-row">
                    <label for="rdInput">RD</label>
                    <input id="rdInput" type="number" min="0" step="1" value="${form.rd}" data-action="rd">
                </div>
                <div class="weapon-table-header"><span>Arma / ataque</span><span>Daño</span><span></span><span></span></div>
                ${weapons.map((weapon, index) => `
                    <div class="weapon-row">
                        <input type="text" value="${escapeHtml(weapon.name)}" placeholder="Nombre" data-action="weapon-name" data-index="${index}">
                        <input type="text" value="${escapeHtml(weapon.damage)}" data-last-valid="${escapeHtml(weapon.damage)}" placeholder="MMm+5" maxlength="64" spellcheck="false" aria-label="Fórmula de daño de ${escapeHtml(weapon.name || "arma")}" data-action="weapon-damage" data-index="${index}">
                        <button class="roll-button" type="button" title="Tirar daño" aria-label="Tirar daño de ${escapeHtml(weapon.name || "arma")}" data-action="roll-weapon" data-index="${index}">${diceIcon()}</button>
                        <button class="icon-button" type="button" title="Eliminar" aria-label="Eliminar arma" data-action="remove-weapon" data-index="${index}">×</button>
                    </div>
                `).join("")}
            `;
            this.bindDynamicContainer(this.elements.combatPanel);
        }

        renderDistortion(distortion, derived) {
            this.elements.distortionPanel.innerHTML = `
                <div class="health-current-row">
                    <label for="distortionLevelInput">Nivel</label>
                    <input id="distortionLevelInput" type="number" min="0" step="1" value="${distortion.level}" data-action="distortion-level">
                </div>
                <div class="derived-row"><span>Salida de éxtasis</span><strong class="derived-value" data-output="ecstasyExit">${derived.ecstasyExit}</strong></div>
                <p class="distortion-caption">Éxtasis</p>
                <div class="distortion-grid">
                    ${distortion.ecstasyTrack.map((checked, index) => `
                        <label class="track-check" title="Casilla de éxtasis ${index + 1}">
                            <input type="checkbox" ${checked ? "checked" : ""} data-action="ecstasy-track" data-index="${index}">
                        </label>
                    `).join("")}
                </div>
            `;
            this.bindDynamicContainer(this.elements.distortionPanel);
        }

        renderArcane(formKey, form, derived) {
            this.elements.arcaneCard.hidden = formKey !== "ecstasy";
            if (formKey !== "ecstasy") {
                return;
            }
            this.elements.arcaneTotal.textContent = derived.arcaneTotal;
            this.elements.arcaneSkillsList.innerHTML = (form.arcaneSkills || []).map((item, index) => `
                <div class="arcane-row">
                    <input type="text" value="${escapeHtml(item.name)}" placeholder="Habilidad arcana" data-action="arcane-name" data-index="${index}">
                    <input type="number" min="0" step="1" value="${item.value}" data-action="arcane-value" data-index="${index}">
                    <button class="icon-button" type="button" title="Eliminar" aria-label="Eliminar habilidad arcana" data-action="remove-arcane" data-index="${index}">×</button>
                </div>
            `).join("");
            this.bindDynamicContainer(this.elements.arcaneSkillsList);
        }

        renderBonds(formKey, items) {
            const isEcstasy = formKey === "ecstasy";
            const count = isEcstasy ? items.length : 8;
            const fixedItems = isEcstasy
                ? items
                : Array.from({ length: count }, (_, index) => items[index] || { name: "", level: 1, anchor: false });
            this.elements.bondsTitle.textContent = isEcstasy ? "Lazo" : "Lazos";
            this.elements.bondsNote.textContent = isEcstasy ? (count ? "Ancla humana" : "Sin ancla") : "8 fijos";
            if (!count) {
                this.elements.bondsPanel.innerHTML = `<p class="empty-bond-message">No hay ningún lazo porque la forma humana no tiene ancla.</p>`;
                return;
            }
            this.elements.bondsPanel.innerHTML = `
                <div class="bond-table-header"><span>Ancla</span><span>Nombre</span><span>Lazo</span><span>Medio</span><span>Mayor</span><span>Crítico</span></div>
                ${fixedItems.map((item, index) => {
                    const level = ADOM.Calculations.number(item.level);
                    return `
                        <div class="bond-row">
                            <label class="anchor-cell${isEcstasy ? " is-readonly" : ""}" title="${isEcstasy ? "El ancla se gestiona desde la forma humana" : "Marcar o desmarcar como ancla"}">
                                <input type="checkbox" ${item.anchor ? "checked" : ""} ${isEcstasy ? "disabled" : ""} data-action="bond-anchor" data-index="${index}">
                                <span></span>
                            </label>
                            <input type="text" value="${escapeHtml(item.name)}" placeholder="Lazo ${index + 1}" data-action="bond-name" data-index="${index}">
                            <input type="number" min="1" step="1" value="${level}" data-action="bond-level" data-index="${index}">
                            <span class="bond-derived">${Math.floor(level / 2)}</span>
                            <span class="bond-derived">${level}</span>
                            <span class="bond-derived">${level * 2}</span>
                        </div>`;
                }).join("")}
            `;
            this.bindDynamicContainer(this.elements.bondsPanel);
        }

        getVisibleBonds(state, formKey) {
            if (formKey === "ecstasy") {
                const anchor = state.human.bonds.find(bond => bond.anchor);
                return anchor ? [anchor] : [];
            }
            return state.human.bonds;
        }

        renderChecks(formKey, derived) {
            const rows = [
                ["Atributos", derived.attributesTotal],
                ["Habilidades", derived.skillsTotal]
            ];
            if (formKey === "human") {
                rows.push(["Lazos", derived.bondsTotal]);
            } else {
                rows.push(["H. arcanas", derived.arcaneTotal]);
            }

            this.elements.checksPanel.innerHTML = rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("");
            this.elements.experienceTotal.textContent = this.formatNumber(derived.experience);
            this.elements.adjustedExperienceRow.hidden = formKey !== "ecstasy";
            this.elements.adjustedExperience.textContent = this.formatNumber(derived.adjustedExperience);
            this.elements.tierLabel.textContent = formKey === "ecstasy" ? "Escalón (Éxtasis)" : "Escalón";
            this.elements.tierValue.textContent = derived.tier.toFixed(2);
        }

        renderHelp(formKey) {
            this.elements.formHelp.innerHTML = formKey === "human"
                ? `<h3>Forma humana</h3><p>La experiencia se calcula con los mismos costes de la hoja: atributos × 15, habilidades × 5, talentos × 10 y lazos × 5.</p><p>Los campos compartidos —nombre, concepto, complicación, aspectos temporales, hitos y distorsión— se conservan al cambiar de forma. La casilla «Experiencia» es un recurso manual y no altera la comprobación de puntos, igual que en el Excel.</p>`
                : `<h3>Forma de éxtasis</h3><p>Cada punto de distorsión resta 30 XP al valor de comparación. Los lazos de la forma humana se vuelven a sumar para que el número ajustado pueda compararse con la ficha humana.</p><p>Los cambios de atributos y habilidades entre formas son independientes, igual que en el documento original. La casilla «Experiencia» se guarda como recurso manual y no altera la comprobación.</p>`;
        }

        bindDynamicContainer(container) {
            container.oninput = event => this.handleDynamicInput(event);
            container.onchange = event => this.handleDynamicChange(event);
            container.onclick = event => this.handleDynamicClick(event);
            container.onfocusout = event => this.handleDynamicFocusOut(event);
        }

        handleDynamicInput(event) {
            const target = event.target.closest("[data-action]");
            if (!target || target.type === "checkbox") return;
            const action = target.dataset.action;
            const index = Number(target.dataset.index);
            const value = target.type === "number" ? this.numberFromInput(target.value) : target.value;

            if (action === "weapon-damage" && !ADOM.Calculations.isDamageFormulaInput(value)) {
                const state = this.store.getState();
                target.value = state.human.weapons[index]?.damage || "";
                return;
            }
            if (action === "weapon-damage") {
                target.setAttribute("aria-invalid", String(Boolean(value) && !ADOM.Calculations.parseDamageFormula(value)));
                if (value === "" || ADOM.Calculations.parseDamageFormula(value)) target.dataset.lastValid = value;
            }

            this.store.update(state => {
                const form = state[state.activeForm];
                const weapons = state.human.weapons;
                const bondIndex = state.activeForm === "ecstasy"
                    ? state.human.bonds.findIndex(bond => bond.anchor)
                    : index;
                switch (action) {
                    case "attribute-descriptor": form.attributes[index].descriptor = value; break;
                    case "attribute-value": form.attributes[index].value = value; break;
                    case "skill-value": form.skills[index].value = value; break;
                    case "temporal": state.profile.temporalAspects[index] = value; break;
                    case "skill-talent": form.skills[index].talents[Number(target.dataset.talentIndex)] = value; break;
                    case "milestone": state.profile.milestones[index] = value; break;
                    case "current-resistance": form.health.currentResistance = value; break;
                    case "rd": form.rd = value; break;
                    case "weapon-name": weapons[index].name = value; break;
                    case "weapon-damage": weapons[index].damage = value; break;
                    case "distortion-level": state.distortion.level = value; break;
                    case "arcane-name": state.ecstasy.arcaneSkills[index].name = value; break;
                    case "arcane-value": state.ecstasy.arcaneSkills[index].value = value; break;
                    case "bond-name": if (bondIndex >= 0) state.human.bonds[bondIndex].name = value; break;
                    case "bond-level": if (bondIndex >= 0) state.human.bonds[bondIndex].level = Math.max(1, value); break;
                    default: return;
                }
            }, { source: "live-input" });
        }

        handleDynamicFocusOut(event) {
            const target = event.target.closest('[data-action="weapon-damage"]');
            if (!target || target.value === "" || ADOM.Calculations.parseDamageFormula(target.value)) return;
            const restoredValue = target.dataset.lastValid || "";
            target.value = restoredValue;
            target.setAttribute("aria-invalid", "false");
            const index = Number(target.dataset.index);
            this.store.update(state => {
                state.human.weapons[index].damage = restoredValue;
            }, { source: "live-input" });
        }

        handleDynamicChange(event) {
            const target = event.target.closest("[data-action]");
            if (!target || (target.type !== "checkbox" && target.type !== "radio")) return;
            const action = target.dataset.action;
            const index = Number(target.dataset.index);
            this.store.update(state => {
                const form = state[state.activeForm];
                switch (action) {
                    case "drama": form.drama[index] = target.checked; break;
                    case "light-wound": form.health.lightWounds[index] = target.checked; break;
                    case "severe-wound": form.health.severeWounds[index] = target.checked; break;
                    case "ecstasy-track": state.distortion.ecstasyTrack[index] = target.checked; break;
                    case "bond-anchor":
                        if (state.activeForm === "ecstasy") return;
                        form.bonds.forEach((bond, bondIndex) => { bond.anchor = target.checked && bondIndex === index; });
                        break;
                    default: return;
                }
            });
        }

        handleDynamicClick(event) {
            const target = event.target.closest("button[data-action]");
            if (!target) return;
            const action = target.dataset.action;
            const index = Number(target.dataset.index);

            if (action === "roll-stat") {
                this.rollStat(target.dataset.kind, index);
                return;
            }
            if (action === "roll-weapon") {
                this.rollWeapon(index);
                return;
            }

            this.store.update(state => {
                const form = state[state.activeForm];
                switch (action) {
                    case "clear-temporal": state.profile.temporalAspects[index] = ""; break;
                    case "remove-weapon": state.human.weapons.splice(index, 1); break;
                    case "remove-arcane": state.ecstasy.arcaneSkills.splice(index, 1); break;
                    default: return;
                }
            });
        }

        async rollStat(kind, index) {
            const state = this.store.getState();
            const form = state[state.activeForm];

            if (kind === "attribute") {
                const attribute = form.attributes[index];
                const label = `${attribute.code} ${attribute.descriptor}`.trim();
                const baseDie = String(state.settings.baseDie || "1d20").trim() || "1d20";
                await this.sendRollCommand(`/roll ${baseDie}+${ADOM.Calculations.number(attribute.value)}`, label);
                return;
            }

            const skill = form.skills[index];
            const attributeIndex = await this.chooseAttribute(form.attributes, skill.label);
            if (attributeIndex === null) {
                return;
            }

            const attribute = form.attributes[attributeIndex];
            const modifier = ADOM.Calculations.number(skill.value) + ADOM.Calculations.number(attribute.value);
            const signedModifier = modifier >= 0 ? `+${modifier}` : `${modifier}`;
            const label = `${skill.label} con ${attribute.code}`;
            await this.sendRollCommand(`/roll {3d10dh1}kh1${signedModifier}`, label);
        }

        chooseAttribute(attributes, skillLabel) {
            return new Promise(resolve => {
                const backdrop = document.createElement("div");
                backdrop.className = "attribute-picker-backdrop";
                backdrop.innerHTML = `
                    <section class="attribute-picker" role="dialog" aria-modal="true" aria-labelledby="attributePickerTitle">
                        <h2 id="attributePickerTitle">¿Con qué atributo tiras ${escapeHtml(skillLabel)}?</h2>
                        <p>Se sumará el valor de la habilidad y el atributo seleccionado.</p>
                        <div class="attribute-picker-options">
                            ${attributes.map((attribute, index) => `
                                <button type="button" class="attribute-option" data-attribute-index="${index}">
                                    <strong>${escapeHtml(attribute.code)}</strong>
                                    <span>${escapeHtml(attribute.descriptor || "Sin descriptor")}</span>
                                    <b>+${ADOM.Calculations.number(attribute.value)}</b>
                                </button>
                            `).join("")}
                        </div>
                        <button type="button" class="button button-secondary attribute-picker-cancel">Cancelar</button>
                    </section>
                `;

                const close = value => {
                    document.removeEventListener("keydown", onKeyDown);
                    backdrop.remove();
                    resolve(value);
                };

                const onKeyDown = event => {
                    if (event.key === "Escape") close(null);
                };

                backdrop.addEventListener("click", event => {
                    const option = event.target.closest("[data-attribute-index]");
                    if (option) {
                        close(Number(option.dataset.attributeIndex));
                        return;
                    }
                    if (event.target === backdrop || event.target.closest(".attribute-picker-cancel")) {
                        close(null);
                    }
                });

                document.addEventListener("keydown", onKeyDown);
                document.body.appendChild(backdrop);
                backdrop.querySelector(".attribute-option")?.focus();
            });
        }

        chooseSkill(skills, weaponLabel) {
            return new Promise(resolve => {
                const backdrop = document.createElement("div");
                backdrop.className = "attribute-picker-backdrop";
                backdrop.innerHTML = `
                    <section class="attribute-picker" role="dialog" aria-modal="true" aria-labelledby="skillPickerTitle">
                        <h2 id="skillPickerTitle">¿Con qué habilidad usas ${escapeHtml(weaponLabel || "este ataque")}?</h2>
                        <p>Después podrás elegir el atributo de la tirada.</p>
                        <div class="attribute-picker-options">
                            ${skills.map((skill, index) => `
                                <button type="button" class="attribute-option" data-skill-index="${index}">
                                    <strong>${index + 1}</strong>
                                    <span>${escapeHtml(skill.label)}</span>
                                    <b>+${ADOM.Calculations.number(skill.value)}</b>
                                </button>
                            `).join("")}
                        </div>
                        <button type="button" class="button button-secondary attribute-picker-cancel">Cancelar</button>
                    </section>
                `;

                const close = value => {
                    document.removeEventListener("keydown", onKeyDown);
                    backdrop.remove();
                    resolve(value);
                };
                const onKeyDown = event => { if (event.key === "Escape") close(null); };
                backdrop.addEventListener("click", event => {
                    const option = event.target.closest("[data-skill-index]");
                    if (option) return close(Number(option.dataset.skillIndex));
                    if (event.target === backdrop || event.target.closest(".attribute-picker-cancel")) close(null);
                });
                document.addEventListener("keydown", onKeyDown);
                document.body.appendChild(backdrop);
                backdrop.querySelector(".attribute-option")?.focus();
            });
        }

        async rollWeapon(index) {
            const state = this.store.getState();
            const form = state[state.activeForm];
            const weapon = state.human.weapons[index];
            const formula = String(weapon.damage || "").trim();
            if (!ADOM.Calculations.parseDamageFormula(formula)) {
                this.showToast("Usa una fórmula como MMm+5: solo m, c, M y un bonificador con + o -.", "error");
                return;
            }
            const skillIndex = await this.chooseSkill(form.skills, weapon.name);
            if (skillIndex === null) return;
            const attributeIndex = await this.chooseAttribute(form.attributes, form.skills[skillIndex].label);
            if (attributeIndex === null) return;

            const dice = this.rollThreeD10();
            const damage = ADOM.Calculations.calculateWeaponDamage(formula, dice);
            if (!damage) {
                this.showToast("No se pudo calcular el daño. Revisa la fórmula.", "error");
                return;
            }
            const skill = form.skills[skillIndex];
            const attribute = form.attributes[attributeIndex];
            const modifier = ADOM.Calculations.number(skill.value) + ADOM.Calculations.number(attribute.value);
            const safeWeaponName = this.sanitizeChatText(weapon.name || "Ataque");
            const diceText = `${dice.join(", ")} (m=${damage.values.m}, c=${damage.values.c}, M=${damage.values.M})`;
            const command = `Dados -> ${diceText} | Tirada -> [[${damage.values.c}+${modifier}]] | Daño -> ${damage.total}`;
            await this.sendRollCommand(command, safeWeaponName);
        }

        rollThreeD10() {
            return Array.from({ length: 3 }, () => {
                if (!global.crypto?.getRandomValues) return Math.floor(Math.random() * 10) + 1;
                const maximum = 0x100000000 - (0x100000000 % 10);
                const values = new Uint32Array(1);
                do global.crypto.getRandomValues(values); while (values[0] >= maximum);
                return values[0] % 10 + 1;
            });
        }

        sanitizeChatText(value) {
            return String(value || "").replace(/[\r\n|]+/g, " ").trim();
        }

        async sendManualCommand() {
            await this.sendRollCommand(this.elements.manualCommand.value, "Comando manual");
        }

        async sendRollCommand(command, label) {
            try {
                await this.bridge.sendChatCommand(command);
                this.showToast(`${label}: enviado a Roll20.`, "success");
            } catch (error) {
                this.showToast(error.message, "error");
            }
        }

        renderBridgeStatus(detail) {
            const state = detail.state === "connected" ? "connected" : detail.state === "error" ? "error" : "unknown";
            this.elements.connectionStatus.dataset.state = state;
            this.elements.connectionStatus.textContent = state === "connected" ? "Conectado" : state === "error" ? "Sin respuesta" : "Enviando…";
            this.elements.bridgeMessage.textContent = detail.message;
        }

        renderSaveState(state) {
            this.elements.saveStatus.dataset.state = state;
            this.elements.saveStatus.textContent = state === "saving" ? "Guardando…" : state === "error" ? "Error al guardar" : "Guardado";
        }

        exportCharacter() {
            const state = this.store.getState();
            const safeName = String(state.profile.name || "personaje-adom")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-Z0-9-_]+/g, "-")
                .replace(/^-|-$/g, "")
                .toLowerCase() || "personaje-adom";
            const blob = new Blob([this.store.exportJson()], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `${safeName}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
            this.showToast("Personaje exportado en JSON.", "success");
        }

        importCharacter(event) {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    this.store.importJson(String(reader.result));
                    this.showToast("Personaje importado correctamente.", "success");
                } catch (error) {
                    this.showToast(`No se pudo importar el archivo: ${error.message}`, "error");
                } finally {
                    event.target.value = "";
                }
            };
            reader.onerror = () => this.showToast("No se pudo leer el archivo seleccionado.", "error");
            reader.readAsText(file);
        }

        resetCharacter() {
            if (!global.confirm("¿Restablecer la ficha al personaje de ejemplo? Se conservarán la imagen y su encuadre, pero se perderán los demás cambios guardados.")) {
                return;
            }
            this.store.reset();
            this.showToast("Ficha restablecida.", "success");
        }

        showToast(message, type) {
            const toast = document.createElement("div");
            toast.className = "toast";
            toast.dataset.type = type || "info";
            toast.textContent = message;
            this.elements.toastRegion.appendChild(toast);
            global.setTimeout(() => toast.remove(), 3600);
        }

        numberFromInput(value) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        formatNumber(value) {
            return Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 });
        }
    }

    ADOM.UI = Object.freeze({ SheetUI });
})(window);
