(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};

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

    class SheetUI {
        constructor(store, bridge) {
            this.store = store;
            this.bridge = bridge;
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
                "appShell", "humanTab", "ecstasyTab", "saveStatus", "exportButton", "importInput", "resetButton",
                "characterName", "characterImageUrl", "characterPortrait", "characterPortraitPlaceholder", "applyImageUrlButton", "clearImageUrlButton", "characterConcept", "characterComplication", "attributesList", "attributesTotal",
                "skillsList", "skillsTotal", "temporalAspectsList",
                "dramaTrack", "extraExperience", "milestonesList", "healthPanel", "combatPanel",
                "addWeaponButton", "distortionPanel", "arcaneCard", "arcaneSkillsList", "arcaneTotal", "addArcaneSkillButton",
                "bondsPanel", "checksPanel", "experienceTotal", "adjustedExperienceRow", "adjustedExperience",
                "tierLabel", "tierValue", "baseDieInput", "manualCommand", "sendCommandButton", "connectionStatus",
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
                this.elements.characterPortrait.hidden = true;
                this.elements.characterPortraitPlaceholder.hidden = false;
                this.showToast("La imagen no se pudo cargar. Comprueba que la URL sea pública y directa.", "error");
            });
            this.elements.characterPortrait.addEventListener("load", () => {
                this.elements.characterPortrait.hidden = false;
                this.elements.characterPortraitPlaceholder.hidden = true;
            });
            this.bindTextInput(this.elements.characterConcept, state => state.profile.concept, (state, value) => { state.profile.concept = value; });
            this.bindTextInput(this.elements.characterComplication, state => state.profile.complication, (state, value) => { state.profile.complication = value; });
            this.bindTextInput(this.elements.baseDieInput, state => state.settings.baseDie, (state, value) => { state.settings.baseDie = value; });

            this.elements.extraExperience.addEventListener("input", event => {
                this.store.update(state => {
                    state[state.activeForm].extraExperience = this.numberFromInput(event.target.value);
                }, { source: "live-input" });
            });

            this.elements.addWeaponButton.addEventListener("click", () => {
                this.store.update(state => state[state.activeForm].weapons.push({ name: "", damage: "" }));
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
            this.renderTabs(formKey);
            this.renderCharacterPortrait(state.profile);
            this.syncStaticFields(state, form);
            this.renderAttributes(form, derived);
            this.renderSkills(form, derived);
            this.renderTemporalAspects(state.profile.temporalAspects);
            this.renderDrama(form.drama);
            this.renderMilestones(state.profile.milestones);
            this.renderHealth(form, derived);
            this.renderCombat(form, derived);
            this.renderDistortion(state.distortion, derived);
            this.renderArcane(formKey, form, derived);
            this.renderBonds(form.bonds);
            this.renderChecks(formKey, derived);
            this.renderHelp(formKey);
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

            this.elements.bondsPanel.querySelectorAll(".bond-row").forEach((row, index) => {
                const level = ADOM.Calculations.number(form.bonds[index]?.level);
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
            this.syncInput(this.elements.baseDieInput, state.settings.baseDie);
        }

        syncInput(element, value) {
            if (document.activeElement !== element) {
                element.value = value ?? "";
            }
        }

        renderCharacterPortrait(profile) {
            const url = String(profile.imageUrl || "").trim();
            if (!url) {
                this.elements.characterPortrait.removeAttribute("src");
                this.elements.characterPortrait.hidden = true;
                this.elements.characterPortraitPlaceholder.hidden = false;
                return;
            }
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
            this.store.update(state => { state.profile.imageUrl = url; });
        }

        clearCharacterImageUrl() {
            this.elements.characterImageUrl.value = "";
            this.store.update(state => { state.profile.imageUrl = ""; });
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
                        <input type="text" value="${escapeHtml(skill.label)}" aria-label="Nombre de habilidad" data-action="skill-label" data-index="${index}">
                        <input class="stat-value" type="number" min="0" step="1" value="${skill.value}" aria-label="Valor de ${escapeHtml(skill.label)}" data-action="skill-value" data-index="${index}">
                        <button class="roll-button" type="button" title="Tirar habilidad y elegir atributo" aria-label="Tirar ${escapeHtml(skill.label)}" data-action="roll-stat" data-kind="skill" data-index="${index}">${diceIcon()}</button>
                    </div>
                    <div class="skill-talents" aria-label="Talentos de ${escapeHtml(skill.label)}">
                        <span class="skill-talents-label">Talentos</span>
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

        renderCombat(form, derived) {
            this.elements.combatPanel.innerHTML = `
                <div class="derived-row"><span>Iniciativa</span><strong class="derived-value" data-output="initiative">${derived.initiative}</strong></div>
                <div class="derived-row"><span>Daño a distancia</span><strong class="derived-value" data-output="rangedDamage">${derived.rangedDamage}</strong></div>
                <div class="derived-row"><span>Daño cuerpo a cuerpo</span><strong class="derived-value" data-output="meleeDamage">${derived.meleeDamage}</strong></div>
                <div class="health-current-row">
                    <label for="rdInput">RD</label>
                    <input id="rdInput" type="number" min="0" step="1" value="${form.rd}" data-action="rd">
                </div>
                <div class="weapon-table-header"><span>Arma / ataque</span><span>Daño</span><span></span><span></span></div>
                ${form.weapons.map((weapon, index) => `
                    <div class="weapon-row">
                        <input type="text" value="${escapeHtml(weapon.name)}" placeholder="Nombre" data-action="weapon-name" data-index="${index}">
                        <input type="text" value="${escapeHtml(weapon.damage)}" placeholder="1d6+1" data-action="weapon-damage" data-index="${index}">
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

        renderBonds(items) {
            const fixedItems = Array.from({ length: 8 }, (_, index) => items[index] || { name: "", level: 1, anchor: false });
            this.elements.bondsPanel.innerHTML = `
                <div class="bond-table-header"><span>Ancla</span><span>Nombre</span><span>Lazo</span><span>Medio</span><span>Mayor</span><span>Crítico</span></div>
                ${fixedItems.map((item, index) => {
                    const level = ADOM.Calculations.number(item.level);
                    return `
                        <div class="bond-row">
                            <label class="anchor-cell" title="Marcar como ancla">
                                <input type="radio" name="bond-anchor-${this.store.getState().activeForm}" ${item.anchor ? "checked" : ""} data-action="bond-anchor" data-index="${index}">
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
        }

        handleDynamicInput(event) {
            const target = event.target.closest("[data-action]");
            if (!target || target.type === "checkbox") return;
            const action = target.dataset.action;
            const index = Number(target.dataset.index);
            const value = target.type === "number" ? this.numberFromInput(target.value) : target.value;

            this.store.update(state => {
                const form = state[state.activeForm];
                switch (action) {
                    case "attribute-descriptor": form.attributes[index].descriptor = value; break;
                    case "attribute-value": form.attributes[index].value = value; break;
                    case "skill-label": form.skills[index].label = value; break;
                    case "skill-value": form.skills[index].value = value; break;
                    case "temporal": state.profile.temporalAspects[index] = value; break;
                    case "skill-talent": form.skills[index].talents[Number(target.dataset.talentIndex)] = value; break;
                    case "milestone": state.profile.milestones[index] = value; break;
                    case "current-resistance": form.health.currentResistance = value; break;
                    case "rd": form.rd = value; break;
                    case "weapon-name": form.weapons[index].name = value; break;
                    case "weapon-damage": form.weapons[index].damage = value; break;
                    case "distortion-level": state.distortion.level = value; break;
                    case "arcane-name": state.ecstasy.arcaneSkills[index].name = value; break;
                    case "arcane-value": state.ecstasy.arcaneSkills[index].value = value; break;
                    case "bond-name": form.bonds[index].name = value; break;
                    case "bond-level": form.bonds[index].level = Math.max(1, value); break;
                    default: return;
                }
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
                        form.bonds.forEach((bond, bondIndex) => { bond.anchor = bondIndex === index; });
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
                    case "remove-weapon": form.weapons.splice(index, 1); break;
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

        async rollWeapon(index) {
            const state = this.store.getState();
            const weapon = state[state.activeForm].weapons[index];
            const formula = String(weapon.damage || "").trim();
            if (!formula) {
                this.showToast("Indica primero la fórmula de daño del arma.", "error");
                return;
            }
            const command = formula.startsWith("/") ? formula : `/roll ${formula}`;
            await this.sendRollCommand(command, weapon.name || "Daño de arma");
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
            if (!global.confirm("¿Restablecer la ficha al personaje de ejemplo? Se perderán los cambios guardados en este navegador.")) {
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
