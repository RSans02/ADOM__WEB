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

    function dragGripIcon() {
        return `<svg class="drag-grip-icon" viewBox="0 0 16 18" aria-hidden="true" focusable="false">
            <circle cx="4" cy="3" r="1.6"></circle><circle cx="12" cy="3" r="1.6"></circle>
            <circle cx="4" cy="9" r="1.6"></circle><circle cx="12" cy="9" r="1.6"></circle>
            <circle cx="4" cy="15" r="1.6"></circle><circle cx="12" cy="15" r="1.6"></circle>
        </svg>`;
    }

    function updateCumulativeTrack(track, index, checked) {
        track.forEach((value, trackIndex) => {
            if (checked ? trackIndex <= index : trackIndex >= index) {
                track[trackIndex] = checked;
            }
        });
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
            this.portraitEditing = false;
            this.reorderDrag = null;
            this.attributeDropIndex = null;
            this.skillDropIndex = null;
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
                "appShell", "characterManager", "characterSelector", "newCharacterButton", "deleteCharacterButton", "humanTab", "ecstasyTab", "viewerBadge", "saveStatus", "optionsMenu", "shareButton", "exportButton", "importInput", "excelImportInput", "resetButton",
                "characterName", "characterImageUrl", "portraitPreviewWrap", "characterPortrait", "characterPortraitPlaceholder", "portraitEditorControls", "portraitAdjustments", "portraitAdjustmentHelp", "characterImageFrame", "characterImageZoom", "characterImageZoomValue", "resetImageTransformButton", "applyImageUrlButton", "clearImageUrlButton", "characterConcept", "characterComplication", "attributesList", "attributesTotal",
                "skillsList", "skillsTotal", "temporalAspectsNote", "temporalAspectsList",
                "dramaTrack", "extraExperience", "milestonesNote", "milestonesList", "healthPanel", "combatPanel",
                "addWeaponButton", "distortionPanel", "arcaneCard", "arcaneSkillsList", "arcaneTotal", "addArcaneSkillButton",
                "bondsTitle", "bondsNote", "bondsPanel", "checksPanel", "experienceTotal", "experienceBreakdownTooltip", "adjustedExperienceRow", "adjustedExperience", "adjustedExperienceBreakdownTooltip",
                "tierLabel", "tierValue", "humanColorInput", "humanBackgroundInput", "ecstasyColorInput", "ecstasyBackgroundInput", "resetAppearanceButton", "manualCommand", "resetManualCommandButton", "sendCommandButton", "connectionStatus",
                "bridgeMessage", "formHelp", "toastRegion"
            ];
            return Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
        }

        bindStaticEvents() {
            this.elements.appShell.addEventListener("input", event => {
                if (event.target.matches('input[type="text"]')) {
                    event.target.title = event.target.value;
                }
            });
            this.elements.humanTab.addEventListener("click", () => this.setActiveForm("human"));
            this.elements.ecstasyTab.addEventListener("click", () => this.setActiveForm("ecstasy"));
            this.elements.characterSelector.addEventListener("change", event => {
                this.portraitEditing = false;
                this.store.switchCharacter(event.target.value);
            });
            this.elements.newCharacterButton.addEventListener("click", () => this.createCharacter());
            this.elements.deleteCharacterButton.addEventListener("click", () => this.deleteCharacter());

            this.bindTextInput(this.elements.characterName, state => state.profile.name, (state, value) => { state.profile.name = value; });
            this.elements.portraitPreviewWrap.addEventListener("dblclick", event => {
                event.preventDefault();
                this.togglePortraitEditing();
            });
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
                if (!this.canEditPortrait()) return;
                const zoom = this.clampNumber(event.target.value, 1, 3, 1);
                this.store.update(state => {
                    state.profile.imageTransform.zoom = zoom;
                    this.constrainPortraitPosition(state.profile.imageTransform);
                }, { source: "live-input" });
                this.applyPortraitTransform(this.store.getState().profile.imageTransform);
            });
            this.elements.characterImageFrame.addEventListener("change", event => {
                if (!this.canEditPortrait()) return;
                this.store.update(state => {
                    state.profile.imageFrame = event.target.value === "portrait" ? "portrait" : "square";
                }, { source: "image-frame" });
            });
            this.elements.resetImageTransformButton.addEventListener("click", () => {
                if (!this.canEditPortrait()) return;
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
            this.elements.resetAppearanceButton.addEventListener("click", () => this.resetAppearance());

            this.elements.extraExperience.addEventListener("input", event => {
                const parsedValue = Number(event.target.value);
                const experience = Math.max(-1, this.numberFromInput(event.target.value));
                if (Number.isFinite(parsedValue) && parsedValue < -1) event.target.value = "-1";
                this.store.update(state => {
                    state.human.extraExperience = experience;
                    state.ecstasy.extraExperience = experience;
                }, { source: "live-input" });
            });

            this.elements.addWeaponButton.addEventListener("click", () => {
                this.store.update(state => state.human.weapons.push({ name: "", damage: "", damageType: "ranged" }));
            });
            this.elements.addArcaneSkillButton.addEventListener("click", () => {
                this.store.update(state => state.ecstasy.arcaneSkills.push({ name: "", value: 1 }));
            });

            this.elements.sendCommandButton.addEventListener("click", () => this.sendManualCommand());
            this.elements.resetManualCommandButton.addEventListener("click", () => {
                this.elements.manualCommand.value = "/roll {3d10dh1}kh1";
                this.elements.manualCommand.title = this.elements.manualCommand.value;
                this.elements.manualCommand.focus();
            });
            this.elements.manualCommand.addEventListener("keydown", event => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.sendManualCommand();
                }
            });

            this.elements.exportButton.addEventListener("click", () => this.exportCharacter());
            this.elements.shareButton.addEventListener("click", () => this.shareCharacter());
            this.elements.optionsMenu.addEventListener("click", event => {
                if (event.target.closest("button")) global.setTimeout(() => this.elements.optionsMenu.removeAttribute("open"), 0);
            });
            this.elements.importInput.addEventListener("change", event => this.importCharacter(event));
            this.elements.excelImportInput.addEventListener("change", event => this.importExcelCharacter(event));
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
            const healthDerived = ADOM.Calculations.deriveForm(state, "human");

            this.elements.appShell.dataset.form = formKey;
            this.applyFormTheme(state.settings.formColors[formKey], state.settings.formBackgrounds[formKey]);
            this.renderCharacterSelector();
            this.renderTabs(formKey);
            this.renderCharacterPortrait(state.profile);
            this.syncStaticFields(state, form);
            this.renderAttributes(form, derived);
            this.renderSkills(form, derived);
            this.renderTemporalAspects(state.profile.temporalAspects);
            this.renderDrama(state.drama);
            this.renderMilestones(state.profile.milestones);
            this.renderHealth(state.human, healthDerived);
            this.renderCombat(form, state.human.weapons, derived);
            this.renderDistortion(state.distortion, derived);
            this.renderArcane(formKey, form, derived);
            this.renderBonds(formKey, this.getVisibleBonds(state, formKey), derived);
            this.renderChecks(formKey, derived);
            this.renderHelp(formKey);
            if (this.viewerMode) this.applyViewerRestrictions();
            this.syncTextInputTitles();
        }

        enableViewerMode() {
            this.viewerMode = true;
            this.portraitEditing = false;
            this.renderCharacterPortrait(this.store.getState().profile);
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
            const healthDerived = ADOM.Calculations.deriveForm(state, "human");

            this.renderCharacterSelector();
            this.renderSpentTotal(this.elements.attributesTotal, derived.attributesTotal, 15, "Atributos");
            this.renderSpentTotal(this.elements.skillsTotal, derived.skillsTotal, 5, "Habilidades", derived.talentsTotal * 10, "Talentos");
            if (formKey === "ecstasy") {
                this.renderSpentTotal(this.elements.arcaneTotal, derived.arcaneTotal, 5, "Habilidades arcanas");
            }
            this.updateFixedHeaderCounts(state, derived);

            const outputs = {
                initiative: derived.initiative,
                rangedDamage: derived.rangedDamage,
                meleeDamage: derived.meleeDamage,
                woundThreshold: healthDerived.woundThreshold,
                totalResistance: healthDerived.totalResistance,
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

        renderCharacterSelector() {
            const characters = this.store.getCharacters();
            const activeId = this.store.getActiveCharacterId();
            const fragment = document.createDocumentFragment();
            characters.forEach((character, index) => {
                const option = document.createElement("option");
                option.value = character.id;
                option.textContent = character.name || `Personaje sin nombre ${index + 1}`;
                option.selected = character.id === activeId;
                fragment.appendChild(option);
            });
            this.elements.characterSelector.replaceChildren(fragment);
            this.elements.characterSelector.title = this.elements.characterSelector.selectedOptions[0]?.textContent || "";
            this.elements.deleteCharacterButton.disabled = this.viewerMode || characters.length <= 1;
        }

        createCharacter() {
            if (this.viewerMode) return;
            this.portraitEditing = false;
            this.store.createCharacter();
            this.showToast("Personaje nuevo creado.", "success");
            this.elements.characterName.focus();
        }

        deleteCharacter() {
            if (this.viewerMode || this.store.getCharacters().length <= 1) return;
            const name = String(this.store.getState().profile.name || "").trim() || "este personaje sin nombre";
            if (!global.confirm(`¿Quieres eliminar a ${name}? Esta acción no se puede deshacer.`)) return;
            this.portraitEditing = false;
            this.store.deleteCharacter(this.store.getActiveCharacterId());
            this.showToast("Personaje eliminado.", "success");
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

        resetAppearance() {
            if (!global.confirm("¿Quieres restablecer los colores de apariencia de ambas formas?")) return;
            this.store.update(state => {
                state.settings.formColors.human = "#a64d78";
                state.settings.formColors.ecstasy = "#3f7f8b";
                state.settings.formBackgrounds.human = "#ead5df";
                state.settings.formBackgrounds.ecstasy = "#d4e4e7";
            }, { source: "reset-appearance" });
            this.showToast("Apariencia restablecida.", "success");
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

        syncTextInputTitles(root = this.elements.appShell) {
            root.querySelectorAll('input[type="text"]').forEach(input => {
                input.title = input.value;
            });
        }

        renderCharacterPortrait(profile) {
            const customUrl = String(profile.imageUrl || "").trim();
            const url = customUrl || DEFAULT_PORTRAIT_URL;
            const hasCustomImage = Boolean(customUrl);
            const editing = this.canEditPortrait();
            this.elements.characterPortrait.dataset.defaultPortrait = String(!hasCustomImage);
            this.elements.characterPortrait.classList.toggle("is-adjustable", hasCustomImage && editing);
            this.elements.portraitPreviewWrap.classList.toggle("is-editing", editing);
            if (this.viewerMode) {
                this.elements.portraitPreviewWrap.removeAttribute("title");
            } else {
                this.elements.portraitPreviewWrap.title = editing
                    ? "Doble clic para bloquear la foto"
                    : "Doble clic para editar la foto";
            }
            this.elements.portraitEditorControls.hidden = !editing;
            this.elements.portraitEditorControls.querySelectorAll("input, select, button").forEach(element => {
                element.disabled = !editing;
            });
            this.elements.clearImageUrlButton.hidden = !hasCustomImage || !editing;
            this.elements.portraitAdjustments.hidden = !hasCustomImage || !editing;
            this.elements.portraitAdjustmentHelp.hidden = !hasCustomImage || !editing;
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
            if (!this.canEditPortrait()) return;
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
            if (!this.canEditPortrait()) return;
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
            if (!this.canEditPortrait() || !this.hasCustomPortrait() || this.elements.characterPortrait.hidden || event.button !== 0) return;
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
            if (!this.canEditPortrait() || !this.hasCustomPortrait() || this.elements.characterPortrait.hidden) return;
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
            return Boolean(String(this.store.getState().profile.imageUrl || "").trim());
        }

        canEditPortrait() {
            return !this.viewerMode && this.portraitEditing;
        }

        togglePortraitEditing() {
            if (this.viewerMode) return;
            this.portraitEditing = !this.portraitEditing;
            if (!this.portraitEditing) {
                this.portraitDrag = null;
                this.elements.characterPortrait.classList.remove("is-dragging");
            }
            this.renderCharacterPortrait(this.store.getState().profile);
        }

        async shareCharacter() {
            const pendingImageUrl = this.elements.characterImageUrl.value.trim();
            const currentImageUrl = String(this.store.getState().profile.imageUrl || "").trim();

            if (this.portraitEditing && pendingImageUrl && pendingImageUrl !== currentImageUrl) {
                if (!/^https?:\/\//i.test(pendingImageUrl)) {
                    this.showToast("La foto no se puede compartir: usa una URL pública que empiece por http:// o https://.", "error");
                    return;
                }
                this.store.update(state => {
                    state.profile.imageUrl = pendingImageUrl;
                    state.profile.imageTransform = { x: 0, y: 0, zoom: 1 };
                }, { source: "share-image" });
            }

            const shareState = JSON.parse(JSON.stringify(this.store.getState()));
            const renderedImageUrl = this.elements.characterPortrait.dataset.defaultPortrait === "false"
                ? this.elements.characterPortrait.src
                : "";
            if (!shareState.profile.imageUrl && renderedImageUrl) {
                shareState.profile.imageUrl = renderedImageUrl;
            }

            const payload = await ADOM.State.encodeShareState(shareState);
            const baseUrl = global.location.href.split("#")[0];
            const shareUrl = `${baseUrl}#view=${payload}`;
            let copied = false;
            try {
                if (global.navigator.clipboard?.writeText) {
                    await global.navigator.clipboard.writeText(shareUrl);
                    copied = true;
                }
            } catch (error) {
                console.warn("[ADOM] No se pudo copiar automáticamente el enlace compartido.", error);
            }
            if (copied) {
                this.showToast("Enlace de solo lectura copiado. Incluye la foto y su encuadre.", "success");
            } else {
                global.prompt("Copia este enlace para compartir la ficha en modo de solo lectura:", shareUrl);
            }
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
            this.renderSpentTotal(this.elements.attributesTotal, derived.attributesTotal, 15, "Atributos");
            this.elements.attributesList.innerHTML = form.attributes.map((attribute, index) => `
                <div class="stat-row attribute-row${this.attributeDropIndex === index ? " skill-drop-settle" : ""}" data-attribute-block>
                    <span class="attribute-leading">
                        <button class="skill-drag-handle" type="button" draggable="true" data-attribute-drag-handle data-index="${index}" title="Arrastrar para reordenar" aria-label="Arrastrar ${escapeHtml(attribute.code)} para reordenar">${dragGripIcon()}</button>
                        <span class="stat-code">${escapeHtml(attribute.code)}</span>
                    </span>
                    <input type="text" value="${escapeHtml(attribute.descriptor)}" aria-label="Descriptor de ${escapeHtml(attribute.code)}" data-action="attribute-descriptor" data-index="${index}">
                    <input class="stat-value" type="number" min="0" step="1" value="${attribute.value}" aria-label="Valor de ${escapeHtml(attribute.code)}" data-action="attribute-value" data-index="${index}">
                    <button class="roll-button" type="button" title="Lanzar dado base + ${attribute.value}" aria-label="Tirar ${escapeHtml(attribute.code)}" data-action="roll-stat" data-kind="attribute" data-index="${index}">${diceIcon()}</button>
                </div>
            `).join("");
            this.attributeDropIndex = null;
            this.bindDynamicContainer(this.elements.attributesList);
            this.bindReorderDragAndDrop(this.elements.attributesList, "attribute");
        }

        renderSkills(form, derived) {
            this.renderSpentTotal(this.elements.skillsTotal, derived.skillsTotal, 5, "Habilidades", derived.talentsTotal * 10, "Talentos");
            this.elements.skillsList.innerHTML = form.skills.map((skill, index) => `
                <div class="skill-block${this.skillDropIndex === index ? " skill-drop-settle" : ""}" data-skill-block>
                    <div class="stat-row skill-main-row">
                        <span class="stat-code">↳</span>
                        <span class="skill-name">${escapeHtml(skill.label)}</span>
                        <input class="stat-value" type="number" min="0" step="1" value="${skill.value}" aria-label="Valor de ${escapeHtml(skill.label)}" data-action="skill-value" data-index="${index}">
                        <button class="roll-button" type="button" title="Tirar habilidad y elegir atributo" aria-label="Tirar ${escapeHtml(skill.label)}" data-action="roll-stat" data-kind="skill" data-index="${index}">${diceIcon()}</button>
                    </div>
                    <div class="skill-talents" aria-label="Talentos de ${escapeHtml(skill.label)}">
                        <button class="skill-drag-handle" type="button" draggable="true" data-skill-drag-handle data-index="${index}" title="Arrastrar para reordenar" aria-label="Arrastrar ${escapeHtml(skill.label)} para reordenar">${dragGripIcon()}</button>
                        <input type="text" value="${escapeHtml(skill.talents?.[0] ?? "")}" placeholder="Talento 1" data-action="skill-talent" data-index="${index}" data-talent-index="0">
                        <input type="text" value="${escapeHtml(skill.talents?.[1] ?? "")}" placeholder="Talento 2" data-action="skill-talent" data-index="${index}" data-talent-index="1">
                    </div>
                </div>
            `).join("");
            this.skillDropIndex = null;
            this.bindDynamicContainer(this.elements.skillsList);
            this.bindReorderDragAndDrop(this.elements.skillsList, "skill");
        }

        bindReorderDragAndDrop(container, kind) {
            container.ondragstart = event => this.handleReorderDragStart(event, container, kind);
            container.ondragover = event => this.handleReorderDragOver(event);
            container.ondrop = event => this.handleReorderDrop(event);
            container.ondragend = () => this.handleReorderDragEnd();
        }

        handleReorderDragStart(event, container, kind) {
            const handle = event.target.closest(`[data-${kind}-drag-handle]`);
            if (!handle || this.viewerMode) {
                event.preventDefault();
                return;
            }
            const block = handle.closest(`[data-${kind}-block]`);
            this.reorderDrag = { block, container, kind, fromIndex: Number(handle.dataset.index) };
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(handle.dataset.index));
            event.dataTransfer.setDragImage(block, 24, 20);
            global.requestAnimationFrame(() => block.classList.add("is-dragging"));
        }

        handleReorderDragOver(event) {
            if (!this.reorderDrag) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            const { block, container, kind } = this.reorderDrag;
            const target = event.target.closest(`[data-${kind}-block]`);
            if (!target || target === block) return;

            const targetRect = target.getBoundingClientRect();
            const reference = event.clientY < targetRect.top + targetRect.height / 2
                ? target
                : target.nextElementSibling;
            if (reference === block || reference === block.nextElementSibling) return;

            const positions = new Map(
                [...container.querySelectorAll(`[data-${kind}-block]`)]
                    .filter(item => item !== block)
                    .map(item => [item, item.getBoundingClientRect().top])
            );
            container.insertBefore(block, reference);
            positions.forEach((previousTop, item) => {
                const offset = previousTop - item.getBoundingClientRect().top;
                if (!offset) return;
                item.getAnimations().forEach(animation => animation.cancel());
                item.animate(
                    [{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }],
                    { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" }
                );
            });
        }

        handleReorderDrop(event) {
            if (!this.reorderDrag) return;
            event.preventDefault();
            const { block, container, kind, fromIndex } = this.reorderDrag;
            const toIndex = [...container.querySelectorAll(`[data-${kind}-block]`)].indexOf(block);
            this.reorderDrag = null;
            if (toIndex < 0 || toIndex === fromIndex) {
                block.classList.remove("is-dragging");
                return;
            }
            if (kind === "attribute") this.attributeDropIndex = toIndex;
            else this.skillDropIndex = toIndex;
            this.store.update(state => {
                const listName = kind === "attribute" ? "attributes" : "skills";
                const items = state[state.activeForm][listName];
                const [movedItem] = items.splice(fromIndex, 1);
                items.splice(toIndex, 0, movedItem);
                const positions = new Map(items.map((item, index) => [item.key, index]));
                const otherForm = state.activeForm === "human" ? state.ecstasy : state.human;
                otherForm[listName].sort((left, right) => {
                    const leftPosition = positions.has(left.key) ? positions.get(left.key) : Number.MAX_SAFE_INTEGER;
                    const rightPosition = positions.has(right.key) ? positions.get(right.key) : Number.MAX_SAFE_INTEGER;
                    return leftPosition - rightPosition;
                });
            }, { source: `drag-reorder-${kind}` });
        }

        handleReorderDragEnd() {
            if (!this.reorderDrag) return;
            this.reorderDrag = null;
            this.render();
        }

        renderTemporalAspects(items) {
            this.elements.temporalAspectsList.innerHTML = items.map((item, index) => `
                <div class="repeatable-row">
                    <!--<input type="text" value="${escapeHtml(item)}" placeholder="Aspecto temporal ${index + 1}" data-action="temporal" data-index="${index}">-->
                    <input type="text" value="${escapeHtml(item)}" data-action="temporal" data-index="${index}">
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
            this.elements.milestonesNote.textContent = `${fixedItems.filter(item => String(item).trim()).length}/6`;
            this.elements.milestonesList.innerHTML = fixedItems.map((item, index) => `
                <div class="fixed-row">
                    <input type="text" value="${escapeHtml(item)}" data-action="milestone" data-index="${index}">
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
                    <div class="wound-row"><input class="wound-description" type="text" value="${escapeHtml(form.health.lightWoundDescription)}" placeholder="" aria-label="Descripción de heridas leves" data-action="light-wound-description"><span>Leves</span>${form.health.lightWounds.map((checked, index) => `<label class="wound-marker"><input type="checkbox" ${checked ? "checked" : ""} data-action="light-wound" data-index="${index}"></label>`).join("")}</div>
                    <div class="wound-row"><input class="wound-description" type="text" value="${escapeHtml(form.health.severeWoundDescription)}" placeholder="" aria-label="Descripción de heridas graves" data-action="severe-wound-description"><span>Graves</span>${form.health.severeWounds.map((checked, index) => `<label class="wound-marker"><input type="checkbox" ${checked ? "checked" : ""} data-action="severe-wound" data-index="${index}"></label>`).join("")}</div>
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
                <div class="weapon-table-header"><span>Arma / ataque</span><span class="weapon-damage-heading">Daño <span class="damage-formula-help" tabindex="0" aria-label="Ayuda sobre los dados de daño">?<span class="damage-formula-tooltip" role="tooltip"><span><b>m</b>Dado menor</span><span><b>c</b>Dado central</span><span><b>M</b>Dado mayor</span></span></span></span><span>Tipo</span><span></span><span></span></div>
                ${weapons.map((weapon, index) => `
                    <div class="weapon-row">
                        <input type="text" value="${escapeHtml(weapon.name)}" placeholder="Nombre" data-action="weapon-name" data-index="${index}">
                        <input type="text" value="${escapeHtml(weapon.damage)}" data-last-valid="${escapeHtml(weapon.damage)}" placeholder="mMc" maxlength="16" spellcheck="false" aria-label="Dados de daño de ${escapeHtml(weapon.name || "arma")}" data-action="weapon-damage" data-index="${index}">
                        <select class="weapon-damage-type" title="Tipo de daño" aria-label="Tipo de daño de ${escapeHtml(weapon.name || "arma")}" data-action="weapon-damage-type" data-index="${index}">
                            <option value="ranged" ${weapon.damageType === "melee" ? "" : "selected"}>Distancia</option>
                            <option value="melee" ${weapon.damageType === "melee" ? "selected" : ""}>Cuerpo a cuerpo</option>
                        </select>
                        <button class="roll-button" type="button" title="Tirar daño" aria-label="Tirar daño de ${escapeHtml(weapon.name || "arma")}" data-action="roll-weapon" data-index="${index}">${diceIcon()}</button>
                        ${index === 0 ? "" : `<button class="icon-button" type="button" title="Eliminar" aria-label="Eliminar arma" data-action="remove-weapon" data-index="${index}">×</button>`}
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
            this.renderSpentTotal(this.elements.arcaneTotal, derived.arcaneTotal, 5, "Habilidades arcanas");
            this.elements.arcaneSkillsList.innerHTML = (form.arcaneSkills || []).map((item, index) => `
                <div class="arcane-row">
                    <input type="text" value="${escapeHtml(item.name)}" placeholder="${index === 0 ? "Habilidad arcana innata" : "Habilidad arcana aprendida"}" data-action="arcane-name" data-index="${index}">
                    <input type="number" min="0" step="1" value="${item.value}" data-action="arcane-value" data-index="${index}">
                    ${index === 0
                        ? ""
                        : `<button class="icon-button" type="button" title="Eliminar" aria-label="Eliminar habilidad arcana" data-action="remove-arcane" data-index="${index}">×</button>`}
                </div>
            `).join("");
            this.bindDynamicContainer(this.elements.arcaneSkillsList);
        }

        renderBonds(formKey, items, derived) {
            const isEcstasy = formKey === "ecstasy";
            const count = isEcstasy ? items.length : 8;
            const fixedItems = isEcstasy
                ? items
                : Array.from({ length: count }, (_, index) => items[index] || { name: "", level: 1, anchor: false });
            this.elements.bondsTitle.textContent = isEcstasy ? "Lazo" : "Lazos";
            this.elements.bondsNote.textContent = isEcstasy
                ? (count ? "Ancla humana" : "Sin ancla")
                : `${fixedItems.filter(item => String(item.name || "").trim()).length}/8 · ${this.formatNumber(derived.bondsTotal * 5)} XP`;
            this.elements.bondsNote.title = isEcstasy
                ? ""
                : `Lazos: ${this.formatNumber(derived.bondsTotal)} × 5 XP = ${this.formatNumber(derived.bondsTotal * 5)} XP`;
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
                            <!--<input type="text" value="${escapeHtml(item.name)}" placeholder="Lazo ${index + 1}" data-action="bond-name" data-index="${index}">-->
                            <input type="text" value="${escapeHtml(item.name)}" data-action="bond-name" data-index="${index}">
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

        updateFixedHeaderCounts(state, derived) {
            const temporalAspects = Array.from({ length: 4 }, (_, index) => state.profile.temporalAspects[index] ?? "");
            this.elements.temporalAspectsNote.textContent = `${temporalAspects.filter(item => String(item).trim()).length}/4`;
            const milestones = Array.from({ length: 6 }, (_, index) => state.profile.milestones[index] ?? "");
            this.elements.milestonesNote.textContent = `${milestones.filter(item => String(item).trim()).length}/6`;
            if (state.activeForm === "human") {
                const filledBonds = state.human.bonds.filter(item => String(item.name || "").trim()).length;
                this.elements.bondsNote.textContent = `${filledBonds}/8 · ${this.formatNumber(derived.bondsTotal * 5)} XP`;
                this.elements.bondsNote.title = `Lazos: ${this.formatNumber(derived.bondsTotal)} × 5 XP = ${this.formatNumber(derived.bondsTotal * 5)} XP`;
            } else {
                this.elements.bondsNote.title = "";
            }
        }

        renderSpentTotal(element, total, cost, label, additionalExperience = null, additionalLabel = "") {
            const baseExperience = total * cost;
            if (additionalExperience !== null) {
                element.textContent = `${this.formatNumber(total)} · ${this.formatNumber(baseExperience)} + ${this.formatNumber(additionalExperience)} XP`;
                element.title = `${label}: ${this.formatNumber(baseExperience)} XP · ${additionalLabel}: ${this.formatNumber(additionalExperience)} XP · Total: ${this.formatNumber(baseExperience + additionalExperience)} XP`;
                return;
            }

            element.textContent = `${this.formatNumber(total)} · ${this.formatNumber(baseExperience)} XP`;
            element.title = `${label}: ${this.formatNumber(total)} × ${this.formatNumber(cost)} XP = ${this.formatNumber(baseExperience)} XP`;
        }

        renderChecks(formKey, derived) {
            const rows = [
                ["Atributos", derived.attributesTotal],
                ["Habilidades", derived.skillsTotal],
                ["Talentos", derived.talentsTotal]
            ];
            if (formKey === "human") {
                rows.push(["Lazos", derived.bondsTotal]);
            } else {
                rows.push(["H. arcanas", derived.arcaneTotal]);
            }

            this.elements.checksPanel.innerHTML = rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`).join("");
            this.elements.experienceTotal.textContent = this.formatNumber(derived.experience);
            const experienceBreakdown = [
                `Atributos: ${this.formatNumber(derived.attributesTotal)} × 15 = ${this.formatNumber(derived.attributesTotal * 15)} XP`,
                `Habilidades: ${this.formatNumber(derived.skillsTotal)} × 5 = ${this.formatNumber(derived.skillsTotal * 5)} XP`,
                `Talentos: ${this.formatNumber(derived.talentsTotal)} × 10 = ${this.formatNumber(derived.talentsTotal * 10)} XP`,
                formKey === "human"
                    ? `Lazos: ${this.formatNumber(derived.bondsTotal)} × 5 = ${this.formatNumber(derived.bondsTotal * 5)} XP`
                    : `Habilidades arcanas: ${this.formatNumber(derived.arcaneTotal)} × 5 = ${this.formatNumber(derived.arcaneTotal * 5)} XP`,
                `Total: ${this.formatNumber(derived.experience)} XP`
            ];
            this.elements.experienceTotal.removeAttribute("title");
            this.elements.experienceBreakdownTooltip.innerHTML = experienceBreakdown
                .map(item => `<span>${escapeHtml(item)}</span>`)
                .join("");
            this.elements.adjustedExperienceRow.hidden = formKey !== "ecstasy";
            this.elements.adjustedExperience.textContent = this.formatNumber(derived.adjustedExperience);
            this.elements.adjustedExperience.removeAttribute("title");
            if (formKey === "ecstasy") {
                const state = this.store.getState();
                const distortion = ADOM.Calculations.number(state.distortion.level);
                const humanBondsTotal = state.human.bonds
                    .filter(item => String(item.name || "").trim())
                    .reduce((total, item) => total + ADOM.Calculations.number(item.level), 0);
                const adjustedBreakdown = [
                    `Experiencia calculada: ${this.formatNumber(derived.experience)} XP`,
                    `Distorsión: ${this.formatNumber(distortion)} × −30 = ${this.formatNumber(distortion * -30)} XP`,
                    `Lazos: ${this.formatNumber(humanBondsTotal)} × 5 = +${this.formatNumber(humanBondsTotal * 5)} XP`,
                    `Total: ${this.formatNumber(derived.adjustedExperience)} XP`
                ];
                this.elements.adjustedExperienceBreakdownTooltip.innerHTML = adjustedBreakdown
                    .map(item => `<span>${escapeHtml(item)}</span>`)
                    .join("");
            }
            this.elements.tierLabel.textContent = formKey === "ecstasy" ? "Escalón (Éxtasis)" : "Escalón";
            this.elements.tierValue.textContent = derived.tier.toFixed(2);
        }

        renderHelp(formKey) {
            this.elements.formHelp.innerHTML = formKey === "human"
                ? `<h3>Forma humana</h3><p>La experiencia se calcula con los mismos costes de la hoja: atributos × 15, habilidades × 5, talentos × 10 y lazos × 5.</p><p>Los campos compartidos —nombre, concepto, complicación, aspectos temporales, hitos y distorsión— se conservan al cambiar de forma. La casilla «Experiencia» es un recurso manual y no altera la comprobación de puntos, igual que en el Excel.</p>`
                : `<h3>Forma de éxtasis</h3><p>Cada punto de distorsión resta 30 XP al valor de comparación. Los lazos de la forma humana se vuelven a sumar para que el número ajustado pueda compararse con la ficha humana.</p><p>Los descriptores de atributos se comparten entre formas; sus valores, las habilidades y los talentos permanecen independientes. La casilla «Experiencia» se guarda como recurso manual y no altera la comprobación.</p>`;
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
                    case "attribute-descriptor": {
                        const attributeKey = form.attributes[index]?.key;
                        [state.human, state.ecstasy].forEach(targetForm => {
                            const attribute = targetForm.attributes.find(item => item.key === attributeKey);
                            if (attribute) attribute.descriptor = value;
                        });
                        break;
                    }
                    case "attribute-value": form.attributes[index].value = value; break;
                    case "skill-value": form.skills[index].value = value; break;
                    case "temporal": state.profile.temporalAspects[index] = value; break;
                    case "skill-talent": form.skills[index].talents[Number(target.dataset.talentIndex)] = value; break;
                    case "milestone": state.profile.milestones[index] = value; break;
                    case "current-resistance":
                        state.human.health.currentResistance = value;
                        state.ecstasy.health.currentResistance = value;
                        break;
                    case "light-wound-description":
                        state.human.health.lightWoundDescription = value;
                        state.ecstasy.health.lightWoundDescription = value;
                        break;
                    case "severe-wound-description":
                        state.human.health.severeWoundDescription = value;
                        state.ecstasy.health.severeWoundDescription = value;
                        break;
                    case "rd": form.rd = value; break;
                    case "weapon-name": weapons[index].name = value; break;
                    case "weapon-damage": weapons[index].damage = value; break;
                    case "weapon-damage-type": weapons[index].damageType = value === "melee" ? "melee" : "ranged"; break;
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
                    case "drama": updateCumulativeTrack(state.drama, index, target.checked); break;
                    case "light-wound":
                        state.human.health.lightWounds[index] = target.checked;
                        state.ecstasy.health.lightWounds[index] = target.checked;
                        break;
                    case "severe-wound":
                        state.human.health.severeWounds[index] = target.checked;
                        state.ecstasy.health.severeWounds[index] = target.checked;
                        break;
                    case "ecstasy-track": updateCumulativeTrack(state.distortion.ecstasyTrack, index, target.checked); break;
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
            if (action === "move-attribute" || action === "move-skill") {
                const direction = Number(target.dataset.direction);
                this.store.update(state => {
                    const form = state[state.activeForm];
                    const items = action === "move-attribute" ? form.attributes : form.skills;
                    const destination = index + direction;
                    if (![-1, 1].includes(direction) || destination < 0 || destination >= items.length) return;
                    [items[index], items[destination]] = [items[destination], items[index]];
                }, { source: "reorder-stat" });
                return;
            }

            if (action === "clear-temporal") {
                const aspect = this.store.getState().profile.temporalAspects[index];
                if (!global.confirm(`¿Seguro que quieres vaciar el aspecto${aspect?.trim() ? ` «${aspect.trim()}»` : ""}?`)) return;
            }
            if (action === "remove-weapon") {
                if (index === 0) {
                    this.showToast("La primera arma no se puede eliminar.", "info");
                    return;
                }
                const weapon = this.store.getState().human.weapons[index];
                if (!global.confirm(`¿Seguro que quieres eliminar el arma${weapon?.name?.trim() ? ` «${weapon.name.trim()}»` : ""}?`)) return;
            }
            if (action === "remove-arcane") {
                if (index === 0) {
                    this.showToast("La habilidad arcana innata no se puede eliminar.", "info");
                    return;
                }
                const arcaneSkill = this.store.getState().ecstasy.arcaneSkills[index];
                if (!global.confirm(`¿Seguro que quieres eliminar la habilidad arcana${arcaneSkill?.name?.trim() ? ` «${arcaneSkill.name.trim()}»` : ""}?`)) return;
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
            const rollOptions = await this.chooseSkillRollOptions(skill);
            if (rollOptions === null) return;

            const modifier = ADOM.Calculations.number(skill.value)
                + ADOM.Calculations.number(attribute.value)
                + rollOptions.extraModifier;
            const signedModifier = modifier >= 0 ? `+${modifier}` : `${modifier}`;
            const diceExpression = rollOptions.talent ? "{3d10dh1}kh2" : "{3d10dh1}kh1";
            const label = `${skill.label} con ${attribute.code}${rollOptions.talent ? ` · ${rollOptions.talent}` : ""}`;
            await this.sendRollCommand(`/roll ${diceExpression}${signedModifier}`, label);
        }

        chooseSkillRollOptions(skill) {
            const talents = (skill.talents || [])
                .map(talent => String(talent || "").trim())
                .filter(Boolean);

            return new Promise(resolve => {
                const backdrop = document.createElement("div");
                backdrop.className = "attribute-picker-backdrop";
                backdrop.innerHTML = `
                    <form class="attribute-picker skill-roll-options" role="dialog" aria-modal="true" aria-labelledby="skillRollOptionsTitle">
                        <h2 id="skillRollOptionsTitle">Preparar tirada de ${escapeHtml(skill.label)}</h2>
                        <p>Con talento se suman el dado central y el dado pequeño. Sin talento solo se usa el central.</p>
                        <fieldset class="talent-choice-list">
                            <legend>Talento</legend>
                            <label class="talent-choice">
                                <input type="radio" name="talent" value="-1" checked>
                                <span><strong>Sin talento</strong><small>Tirada normal</small></span>
                            </label>
                            ${talents.map((talent, index) => `
                                <label class="talent-choice">
                                    <input type="radio" name="talent" value="${index}">
                                    <span><strong>${escapeHtml(talent)}</strong><small>Suma el dado pequeño</small></span>
                                </label>
                            `).join("")}
                        </fieldset>
                        <label class="field roll-extra-modifier">
                            <span>Modificador extra</span>
                            <input name="extraModifier" type="number" step="1" value="0" inputmode="numeric">
                        </label>
                        <div class="reset-confirm-actions">
                            <button type="button" class="button button-secondary skill-roll-cancel">Cancelar</button>
                            <button type="submit" class="button button-primary">Tirar</button>
                        </div>
                    </form>
                `;

                const form = backdrop.querySelector("form");
                const close = value => {
                    document.removeEventListener("keydown", onKeyDown);
                    backdrop.remove();
                    resolve(value);
                };
                const onKeyDown = event => { if (event.key === "Escape") close(null); };

                backdrop.addEventListener("click", event => {
                    if (event.target === backdrop || event.target.closest(".skill-roll-cancel")) close(null);
                });
                form.addEventListener("submit", event => {
                    event.preventDefault();
                    const talentIndex = Number(form.elements.talent.value);
                    close({
                        talent: talentIndex >= 0 ? talents[talentIndex] : "",
                        extraModifier: this.numberFromInput(form.elements.extraModifier.value)
                    });
                });

                document.addEventListener("keydown", onKeyDown);
                document.body.appendChild(backdrop);
                form.elements.extraModifier.focus();
                form.elements.extraModifier.select();
            });
        }

        chooseAttribute(attributes, rollLabel, chooseSkillAfter = false) {
            return new Promise(resolve => {
                const backdrop = document.createElement("div");
                backdrop.className = "attribute-picker-backdrop";
                backdrop.innerHTML = `
                    <section class="attribute-picker" role="dialog" aria-modal="true" aria-labelledby="attributePickerTitle">
                        <h2 id="attributePickerTitle">¿Con qué atributo tiras ${escapeHtml(rollLabel)}?</h2>
                        <p>${chooseSkillAfter ? "Después podrás elegir la habilidad de la tirada." : "Se sumará el valor de la habilidad y el atributo seleccionado."}</p>
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

        chooseSkill(skills, weaponLabel, attributeLabel = "") {
            return new Promise(resolve => {
                const backdrop = document.createElement("div");
                backdrop.className = "attribute-picker-backdrop";
                backdrop.innerHTML = `
                    <section class="attribute-picker" role="dialog" aria-modal="true" aria-labelledby="skillPickerTitle">
                        <h2 id="skillPickerTitle">¿Con qué habilidad usas ${escapeHtml(weaponLabel || "este ataque")}?</h2>
                        <p>${attributeLabel ? `Se sumará al atributo ${escapeHtml(attributeLabel)} seleccionado.` : "Después podrás elegir el atributo de la tirada."}</p>
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
            const derived = ADOM.Calculations.deriveForm(state, state.activeForm);
            const weapon = state.human.weapons[index];
            const formula = String(weapon.damage || "").trim();
            if (!ADOM.Calculations.parseDamageFormula(formula)) {
                this.showToast("Usa una fórmula como mMc: solo se admiten m, c y M.", "error");
                return;
            }
            const attributeIndex = await this.chooseAttribute(form.attributes, weapon.name || "este ataque", true);
            if (attributeIndex === null) return;
            const attribute = form.attributes[attributeIndex];
            const skillIndex = await this.chooseSkill(form.skills, weapon.name, attribute.code);
            if (skillIndex === null) return;

            const skill = form.skills[skillIndex];
            let dice;
            try {
                dice = await this.bridge.rollDamageDice(
                    ADOM.Calculations.number(skill.value),
                    ADOM.Calculations.number(attribute.value),
                    weapon.name
                );
            } catch (error) {
                this.showToast(error.message, "error");
                return;
            }

            const damageBonus = weapon.damageType === "melee" ? derived.meleeDamage : derived.rangedDamage;
            const damage = ADOM.Calculations.calculateWeaponDamage(formula, dice, damageBonus);
            if (!damage) {
                this.showToast("No se pudo calcular el daño. Revisa la fórmula.", "error");
                return;
            }
            const safeWeaponName = this.sanitizeChatText(weapon.name || "Ataque");
            await this.sendRollCommand(`${safeWeaponName}: Daño -> ${damage.total}`, safeWeaponName);
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
                    this.elements.optionsMenu.removeAttribute("open");
                }
            };
            reader.onerror = () => this.showToast("No se pudo leer el archivo seleccionado.", "error");
            reader.readAsText(file);
        }

        async importExcelCharacter(event) {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
                const importedState = await ADOM.Excel.importCharacter(file);
                this.portraitEditing = false;
                this.store.replace(importedState, { source: "excel-import" });
                this.showToast("Personaje importado desde Excel correctamente.", "success");
            } catch (error) {
                this.showToast(`No se pudo importar el Excel: ${error.message}`, "error");
            } finally {
                event.target.value = "";
                this.elements.optionsMenu.removeAttribute("open");
            }
        }

        confirmReset() {
            return new Promise(resolve => {
                const backdrop = document.createElement("div");
                backdrop.className = "attribute-picker-backdrop";
                backdrop.innerHTML = `
                    <form class="attribute-picker reset-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="resetConfirmTitle">
                        <h2 id="resetConfirmTitle">Restablecer toda la ficha</h2>
                        <p>Esta acción vaciará todos los datos, incluida la imagen. Para continuar, escribe <strong>RESTABLECER</strong>.</p>
                        <label class="field">
                            <span>Confirmación</span>
                            <input type="text" class="reset-confirm-input" autocomplete="off" spellcheck="false" placeholder="RESTABLECER">
                        </label>
                        <div class="reset-confirm-actions">
                            <button type="button" class="button button-secondary reset-confirm-cancel">Cancelar</button>
                            <button type="submit" class="button button-danger reset-confirm-submit" disabled>Restablecer todo</button>
                        </div>
                    </form>
                `;

                const input = backdrop.querySelector(".reset-confirm-input");
                const submitButton = backdrop.querySelector(".reset-confirm-submit");
                const close = confirmed => {
                    document.removeEventListener("keydown", onKeyDown);
                    backdrop.remove();
                    resolve(confirmed);
                };
                const onKeyDown = event => {
                    if (event.key === "Escape") close(false);
                };

                input.addEventListener("input", () => {
                    input.title = input.value;
                    submitButton.disabled = input.value !== "RESTABLECER";
                });
                backdrop.addEventListener("click", event => {
                    if (event.target === backdrop || event.target.closest(".reset-confirm-cancel")) close(false);
                });
                backdrop.querySelector("form").addEventListener("submit", event => {
                    event.preventDefault();
                    if (input.value === "RESTABLECER") close(true);
                });

                document.addEventListener("keydown", onKeyDown);
                document.body.appendChild(backdrop);
                this.syncTextInputTitles(backdrop);
                input.focus();
            });
        }

        async resetCharacter() {
            if (!await this.confirmReset()) return;
            this.store.reset();
            this.showToast("Ficha vaciada por completo.", "success");
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
