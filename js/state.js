(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};
    const STORAGE_KEY = "adom.external.sheet.character.v1";

    const ATTRIBUTE_TEMPLATE = [
        { key: "strength", code: "FOR", descriptor: "Sílfide", value: 2 },
        { key: "reflexes", code: "REF", descriptor: "Paso ligero", value: 2 },
        { key: "will", code: "VOL", descriptor: "Estoica", value: 4 },
        { key: "intellect", code: "INT", descriptor: "Instruida", value: 8 }
    ];

    const SKILL_TEMPLATE = [
        { key: "physical", label: "Forma física", value: 3, talents: ["", ""] },
        { key: "combat", label: "Combate", value: 3, talents: ["", ""] },
        { key: "perception", label: "Percepción", value: 4, talents: ["", ""] },
        { key: "subterfuge", label: "Subterfugio", value: 3, talents: ["", ""] },
        { key: "communication", label: "Comunicación", value: 2, talents: ["", ""] },
        { key: "culture", label: "Cultura", value: 5, talents: ["Geóloga", ""] },
        { key: "occultism", label: "Ocultismo", value: 5, talents: ["", ""] },
        { key: "emotional", label: "Gestión emocional", value: 3, talents: ["", ""] }
    ];

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function createDefaultState() {
        const humanAttributes = clone(ATTRIBUTE_TEMPLATE);
        const ecstasyAttributes = clone(ATTRIBUTE_TEMPLATE);
        ecstasyAttributes.find(item => item.key === "will").value = 5;

        const humanSkills = clone(SKILL_TEMPLATE);
        const ecstasySkills = clone(SKILL_TEMPLATE);
        ecstasySkills.find(item => item.key === "culture").value = 6;

        return {
            schemaVersion: 3,
            activeForm: "human",
            profile: {
                name: "Lluvia Clara",
                imageUrl: "",
                concept: "Solitaria soñadora",
                complication: "Dispersa",
                temporalAspects: ["", "", "", ""],
                milestones: [
                    "Es de clase baja, viviendo muy cerca de la cúpula",
                    "Se sacó la carrera con doble especialización (biología y botánica) y el máster en geología en tiempo récord",
                    "", "", "", ""
                ]
            },
            distortion: {
                level: 1,
                ecstasyTrack: [false, false, false, false, false, false, false, false, false, false]
            },
            settings: {
                baseDie: "1d20"
            },
            human: {
                attributes: humanAttributes,
                skills: humanSkills,
                drama: [true, true, true, true, true],
                extraExperience: 0,
                rd: 0,
                weapons: [{ name: "", damage: "" }],
                health: {
                    currentResistance: 12,
                    lightWounds: [false, false],
                    severeWounds: [false, false]
                },
                bonds: [
                    { name: "Aura, mejor amiga", level: 1, anchor: true },
                    { name: "Duna, quiero ser como tú", level: 1, anchor: false },
                    { name: "", level: 1, anchor: false }, { name: "", level: 1, anchor: false },
                    { name: "", level: 1, anchor: false }, { name: "", level: 1, anchor: false },
                    { name: "", level: 1, anchor: false }, { name: "", level: 1, anchor: false }
                ]
            },
            ecstasy: {
                attributes: ecstasyAttributes,
                skills: ecstasySkills,
                arcaneSkills: [
                    { name: "Eco de la tierra (innata)", value: 1 },
                    { name: "Dardo eléctrico (aprendida)", value: 1 }
                ],
                drama: [true, true, true, true, true],
                extraExperience: 0,
                rd: 0,
                weapons: [{ name: "", damage: "" }],
                health: {
                    currentResistance: 12,
                    lightWounds: [false, false],
                    severeWounds: [false, false]
                },
                bonds: Array.from({ length: 8 }, () => ({ name: "", level: 1, anchor: false }))
            }
        };
    }

    function normalizeNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeStringArray(value, fallback) {
        if (!Array.isArray(value)) {
            return clone(fallback);
        }
        return value.map(item => typeof item === "string" ? item : String(item ?? ""));
    }

    function mergeForm(defaultForm, incomingForm) {
        const form = incomingForm && typeof incomingForm === "object" ? incomingForm : {};
        return {
            ...clone(defaultForm),
            ...form,
            attributes: Array.isArray(form.attributes) ? form.attributes.map((item, index) => ({
                ...clone(defaultForm.attributes[index] || { key: `attribute-${index}`, code: "ATR", descriptor: "", value: 0 }),
                ...item,
                value: normalizeNumber(item?.value, 0)
            })) : clone(defaultForm.attributes),
            skills: Array.isArray(form.skills) ? form.skills.map((item, index) => {
                const fallbackSkill = clone(defaultForm.skills[index] || { key: `skill-${index}`, label: "Habilidad", value: 0, talents: ["", ""] });
                const talents = Array.isArray(item?.talents) ? item.talents : fallbackSkill.talents;
                return {
                    ...fallbackSkill,
                    ...item,
                    value: normalizeNumber(item?.value, 0),
                    talents: [String(talents?.[0] ?? ""), String(talents?.[1] ?? "")]
                };
            }) : clone(defaultForm.skills),
            drama: Array.isArray(form.drama) ? form.drama.slice(0, 5).map(Boolean) : clone(defaultForm.drama),
            extraExperience: normalizeNumber(form.extraExperience, 0),
            rd: normalizeNumber(form.rd, 0),
            weapons: Array.isArray(form.weapons) ? form.weapons.map(item => ({
                name: String(item?.name ?? ""),
                damage: String(item?.damage ?? "")
            })) : clone(defaultForm.weapons),
            health: {
                ...clone(defaultForm.health),
                ...(form.health || {}),
                currentResistance: normalizeNumber(form.health?.currentResistance, defaultForm.health.currentResistance),
                lightWounds: Array.isArray(form.health?.lightWounds) ? form.health.lightWounds.slice(0, 2).map(Boolean) : clone(defaultForm.health.lightWounds),
                severeWounds: Array.isArray(form.health?.severeWounds) ? form.health.severeWounds.slice(0, 2).map(Boolean) : clone(defaultForm.health.severeWounds)
            },
            bonds: Array.from({ length: 8 }, (_, index) => {
                const item = Array.isArray(form.bonds) ? form.bonds[index] : null;
                const fallback = defaultForm.bonds[index] || { name: "", level: 1, anchor: false };
                return {
                    name: String(item?.name ?? fallback.name ?? ""),
                    level: normalizeNumber(item?.level, fallback.level ?? 1),
                    anchor: Boolean(item?.anchor ?? fallback.anchor)
                };
            }),
            ...(Object.prototype.hasOwnProperty.call(defaultForm, "arcaneSkills") ? {
                arcaneSkills: Array.isArray(form.arcaneSkills) ? form.arcaneSkills.map(item => ({
                    name: String(item?.name ?? ""),
                    value: normalizeNumber(item?.value, 0)
                })) : clone(defaultForm.arcaneSkills)
            } : {})
        };
    }


    function migrateLegacyTalents(form) {
        if (!Array.isArray(form?.talents) || !form.talents.length || !Array.isArray(form.skills)) return form;
        const target = form.skills.find(skill => skill.key === "culture") || form.skills[0];
        target.talents = [String(form.talents[0] ?? ""), String(form.talents[1] ?? "")];
        delete form.talents;
        return form;
    }

    function normalizeAnchors(form) {
        if (!Array.isArray(form?.bonds)) return form;
        let anchorFound = false;
        form.bonds.forEach(bond => {
            if (bond.anchor && !anchorFound) {
                anchorFound = true;
            } else {
                bond.anchor = false;
            }
        });
        return form;
    }

    function normalizeState(candidate) {
        const defaults = createDefaultState();
        if (!candidate || typeof candidate !== "object") {
            return defaults;
        }

        return {
            schemaVersion: 3,
            activeForm: candidate.activeForm === "ecstasy" ? "ecstasy" : "human",
            profile: {
                name: String(candidate.profile?.name ?? defaults.profile.name),
                imageUrl: String(candidate.profile?.imageUrl ?? defaults.profile.imageUrl),
                concept: String(candidate.profile?.concept ?? defaults.profile.concept),
                complication: String(candidate.profile?.complication ?? defaults.profile.complication),
                temporalAspects: normalizeStringArray(candidate.profile?.temporalAspects, defaults.profile.temporalAspects),
                milestones: Array.from({ length: 6 }, (_, index) => String(candidate.profile?.milestones?.[index] ?? defaults.profile.milestones[index] ?? ""))
            },
            distortion: {
                level: normalizeNumber(candidate.distortion?.level, defaults.distortion.level),
                ecstasyTrack: Array.isArray(candidate.distortion?.ecstasyTrack)
                    ? candidate.distortion.ecstasyTrack.slice(0, 10).map(Boolean)
                    : clone(defaults.distortion.ecstasyTrack)
            },
            settings: {
                baseDie: String(candidate.settings?.baseDie ?? defaults.settings.baseDie)
            },
            human: normalizeAnchors(migrateLegacyTalents(mergeForm(defaults.human, candidate.human))),
            ecstasy: normalizeAnchors(migrateLegacyTalents(mergeForm(defaults.ecstasy, candidate.ecstasy)))
        };
    }

    class CharacterStore extends EventTarget {
        constructor() {
            super();
            this.state = this.load();
            this.saveTimer = null;
        }

        load() {
            try {
                const raw = global.localStorage.getItem(STORAGE_KEY);
                return raw ? normalizeState(JSON.parse(raw)) : createDefaultState();
            } catch (error) {
                console.warn("[ADOM] No se pudo cargar el personaje guardado.", error);
                return createDefaultState();
            }
        }

        getState() {
            return this.state;
        }

        replace(nextState, options) {
            this.state = normalizeState(nextState);
            this.dispatchEvent(new CustomEvent("change", { detail: { source: options?.source || "replace" } }));
            this.scheduleSave();
        }

        update(mutator, options) {
            mutator(this.state);
            this.dispatchEvent(new CustomEvent("change", { detail: { source: options?.source || "update" } }));
            this.scheduleSave();
        }

        scheduleSave() {
            this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "saving" } }));
            global.clearTimeout(this.saveTimer);
            this.saveTimer = global.setTimeout(() => this.save(), 250);
        }

        save() {
            try {
                global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
                this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "saved" } }));
            } catch (error) {
                console.error("[ADOM] No se pudo guardar el personaje.", error);
                this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "error" } }));
            }
        }

        reset() {
            this.state = createDefaultState();
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "reset" } }));
            this.save();
        }

        exportJson() {
            return JSON.stringify(this.state, null, 2);
        }

        importJson(text) {
            const parsed = JSON.parse(text);
            this.replace(parsed, { source: "import" });
        }
    }

    ADOM.State = Object.freeze({
        STORAGE_KEY,
        createDefaultState,
        normalizeState,
        CharacterStore
    });
})(window);
