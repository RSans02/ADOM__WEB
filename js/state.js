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
            schemaVersion: 16,
            activeForm: "human",
            drama: [true, true, true, true, true],
            profile: {
                name: "Lluvia Clara",
                imageUrl: "",
                imageTransform: { x: 0, y: 0, zoom: 1 },
                imageFrame: "square",
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
                baseDie: "1d20",
                formColors: {
                    human: "#a64d78",
                    ecstasy: "#3f7f8b"
                },
                formBackgrounds: {
                    human: "#ead5df",
                    ecstasy: "#d4e4e7"
                }
            },
            human: {
                attributes: humanAttributes,
                skills: humanSkills,
                extraExperience: 0,
                rd: 0,
                weapons: [{ name: "", damage: "", damageType: "ranged" }],
                health: {
                    currentResistance: 12,
                    lightWoundDescription: "",
                    lightWounds: [false, false],
                    severeWoundDescription: "",
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
                extraExperience: 0,
                rd: 0,
                weapons: [],
                health: {
                    currentResistance: 12,
                    lightWoundDescription: "",
                    lightWounds: [false, false],
                    severeWoundDescription: "",
                    severeWounds: [false, false]
                },
                bonds: []
            }
        };
    }

    function createEmptyState() {
        const state = createDefaultState();

        state.drama.fill(false);
        state.profile.name = "";
        state.profile.imageUrl = "";
        state.profile.imageTransform = { x: 0, y: 0, zoom: 1 };
        state.profile.imageFrame = "square";
        state.profile.concept = "";
        state.profile.complication = "";
        state.profile.temporalAspects.fill("");
        state.profile.milestones.fill("");
        state.distortion.level = 0;
        state.distortion.ecstasyTrack.fill(false);

        [state.human, state.ecstasy].forEach(form => {
            form.attributes.forEach(attribute => {
                attribute.descriptor = "";
                attribute.value = 0;
            });
            form.skills.forEach(skill => {
                skill.value = 0;
                skill.talents = ["", ""];
            });
            form.extraExperience = 0;
            form.rd = 0;
            form.health.currentResistance = 0;
            form.health.lightWoundDescription = "";
            form.health.lightWounds.fill(false);
            form.health.severeWoundDescription = "";
            form.health.severeWounds.fill(false);
        });

        state.human.weapons = [{ name: "", damage: "", damageType: "ranged" }];
        state.human.bonds.forEach(bond => {
            bond.name = "";
            bond.level = 1;
            bond.anchor = false;
        });
        state.ecstasy.arcaneSkills = [];

        return state;
    }

    function normalizeNumber(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeNonNegativeNumber(value, fallback) {
        return Math.max(0, normalizeNumber(value, fallback));
    }

    function clamp(value, minimum, maximum, fallback) {
        return Math.min(maximum, Math.max(minimum, normalizeNumber(value, fallback)));
    }

    function normalizeImageTransform(value, legacyPosition) {
        const zoom = clamp(value?.zoom, 1, 3, 1);
        const positionScale = legacyPosition ? 2 : 1;
        return {
            x: clamp(normalizeNumber(value?.x, 0) * positionScale, -100, 100, 0),
            y: clamp(normalizeNumber(value?.y, 0) * positionScale, -100, 100, 0),
            zoom
        };
    }

    function normalizeBooleanTrack(value, fallback, length) {
        return Array.from({ length }, (_, index) => Boolean(
            Array.isArray(value) ? value[index] : fallback[index]
        ));
    }

    function normalizeStringArray(value, fallback) {
        if (!Array.isArray(value)) {
            return clone(fallback);
        }
        return value.map(item => typeof item === "string" ? item : String(item ?? ""));
    }

    function normalizeColor(value, fallback) {
        const color = String(value ?? "").trim();
        return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
    }

    function normalizeDamageFormula(value) {
        const formula = String(value ?? "").trim();
        const match = /^([mMc]+)(?:[+-]\d+)?$/.exec(formula);
        return match && match[1].length <= 16 ? match[1] : "";
    }

    function normalizeWeapons(value) {
        return Array.isArray(value) ? value.map(item => ({
            name: String(item?.name ?? ""),
            damage: normalizeDamageFormula(item?.damage),
            damageType: item?.damageType === "melee" ? "melee" : "ranged"
        })) : [];
    }

    function mergeForm(defaultForm, incomingForm) {
        const form = incomingForm && typeof incomingForm === "object" ? incomingForm : {};
        const incomingBonds = Array.isArray(form.bonds) ? form.bonds : [];
        return {
            ...clone(defaultForm),
            ...form,
            attributes: Array.isArray(form.attributes) ? form.attributes.map((item, index) => ({
                ...clone(defaultForm.attributes[index] || { key: `attribute-${index}`, code: "ATR", descriptor: "", value: 0 }),
                ...item,
                value: normalizeNonNegativeNumber(item?.value, 0)
            })) : clone(defaultForm.attributes),
            skills: Array.isArray(form.skills) ? form.skills.map((item, index) => {
                const fallbackSkill = clone(defaultForm.skills[index] || { key: `skill-${index}`, label: "Habilidad", value: 0, talents: ["", ""] });
                const talents = Array.isArray(item?.talents) ? item.talents : fallbackSkill.talents;
                return {
                    ...fallbackSkill,
                    ...item,
                    value: normalizeNonNegativeNumber(item?.value, 0),
                    talents: [String(talents?.[0] ?? ""), String(talents?.[1] ?? "")]
                };
            }) : clone(defaultForm.skills),
            extraExperience: Math.max(-1, normalizeNumber(form.extraExperience, 0)),
            rd: normalizeNonNegativeNumber(form.rd, 0),
            weapons: defaultForm.weapons.length === 0
                ? []
                : (Array.isArray(form.weapons) ? normalizeWeapons(form.weapons) : clone(defaultForm.weapons)),
            health: {
                ...clone(defaultForm.health),
                ...(form.health || {}),
                currentResistance: normalizeNonNegativeNumber(form.health?.currentResistance, defaultForm.health.currentResistance),
                lightWoundDescription: String(form.health?.lightWoundDescription ?? defaultForm.health.lightWoundDescription),
                lightWounds: normalizeBooleanTrack(form.health?.lightWounds, defaultForm.health.lightWounds, 2),
                severeWoundDescription: String(form.health?.severeWoundDescription ?? defaultForm.health.severeWoundDescription),
                severeWounds: normalizeBooleanTrack(form.health?.severeWounds, defaultForm.health.severeWounds, 2)
            },
            bonds: Array.from({ length: defaultForm.bonds.length }, (_, index) => {
                const item = incomingBonds[index];
                const fallback = defaultForm.bonds[index] || { name: "", level: 1, anchor: false };
                return {
                    name: String(item?.name ?? fallback.name ?? ""),
                    level: Math.max(1, normalizeNumber(item?.level, fallback.level ?? 1)),
                    anchor: Boolean(item?.anchor ?? fallback.anchor)
                };
            }),
            ...(Object.prototype.hasOwnProperty.call(defaultForm, "arcaneSkills") ? {
                arcaneSkills: Array.isArray(form.arcaneSkills) ? form.arcaneSkills.map(item => ({
                    name: String(item?.name ?? ""),
                    value: normalizeNonNegativeNumber(item?.value, 0)
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

        const human = normalizeAnchors(migrateLegacyTalents(mergeForm(defaults.human, candidate.human)));
        const ecstasy = normalizeAnchors(migrateLegacyTalents(mergeForm(defaults.ecstasy, candidate.ecstasy)));
        const activeForm = candidate.activeForm === "ecstasy" ? "ecstasy" : "human";
        const sharedExtraExperience = Math.max(-1, normalizeNumber(
            candidate[activeForm]?.extraExperience
                ?? candidate.human?.extraExperience
                ?? candidate.ecstasy?.extraExperience,
            0
        ));
        human.extraExperience = sharedExtraExperience;
        ecstasy.extraExperience = sharedExtraExperience;
        delete human.drama;
        delete ecstasy.drama;
        if (normalizeNumber(candidate.schemaVersion, 0) < 12) {
            normalizeWeapons(candidate.ecstasy?.weapons).forEach(weapon => {
                if (!weapon.name.trim() && !weapon.damage) return;
                const duplicate = human.weapons.some(item => item.name === weapon.name && item.damage === weapon.damage);
                if (!duplicate) human.weapons.push(weapon);
            });
        }

        return {
            schemaVersion: 16,
            activeForm,
            drama: normalizeBooleanTrack(
                candidate.drama,
                Array.isArray(candidate.human?.drama)
                    ? candidate.human.drama
                    : (Array.isArray(candidate.ecstasy?.drama) ? candidate.ecstasy.drama : defaults.drama),
                5
            ),
            profile: {
                name: String(candidate.profile?.name ?? defaults.profile.name),
                imageUrl: String(candidate.profile?.imageUrl ?? defaults.profile.imageUrl),
                imageTransform: normalizeImageTransform(candidate.profile?.imageTransform, normalizeNumber(candidate.schemaVersion, 0) < 10),
                imageFrame: candidate.profile?.imageFrame === "portrait" ? "portrait" : "square",
                concept: String(candidate.profile?.concept ?? defaults.profile.concept),
                complication: String(candidate.profile?.complication ?? defaults.profile.complication),
                temporalAspects: normalizeStringArray(candidate.profile?.temporalAspects, defaults.profile.temporalAspects),
                milestones: Array.from({ length: 6 }, (_, index) => String(candidate.profile?.milestones?.[index] ?? defaults.profile.milestones[index] ?? ""))
            },
            distortion: {
                level: normalizeNonNegativeNumber(candidate.distortion?.level, defaults.distortion.level),
                ecstasyTrack: normalizeBooleanTrack(candidate.distortion?.ecstasyTrack, defaults.distortion.ecstasyTrack, 10)
            },
            settings: {
                baseDie: String(candidate.settings?.baseDie ?? defaults.settings.baseDie),
                formColors: {
                    human: normalizeColor(candidate.settings?.formColors?.human, defaults.settings.formColors.human),
                    ecstasy: normalizeColor(candidate.settings?.formColors?.ecstasy, defaults.settings.formColors.ecstasy)
                },
                formBackgrounds: {
                    human: normalizeColor(candidate.settings?.formBackgrounds?.human, defaults.settings.formBackgrounds.human),
                    ecstasy: normalizeColor(candidate.settings?.formBackgrounds?.ecstasy, defaults.settings.formBackgrounds.ecstasy)
                }
            },
            human,
            ecstasy
        };
    }

    function encodeBase64Url(bytes) {
        let binary = "";
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        return global.btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
    }

    function decodeBase64Url(payload) {
        const normalizedPayload = String(payload).replaceAll("-", "+").replaceAll("_", "/");
        const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, "=");
        const binary = global.atob(paddedPayload);
        return Uint8Array.from(binary, character => character.charCodeAt(0));
    }

    async function transformBytes(bytes, StreamConstructor, format) {
        const stream = new Blob([bytes]).stream().pipeThrough(new StreamConstructor(format));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async function encodeShareState(state) {
        const bytes = new TextEncoder().encode(JSON.stringify(normalizeState(state)));
        if (typeof global.CompressionStream === "function") {
            const compressed = await transformBytes(bytes, global.CompressionStream, "gzip");
            return `z${encodeBase64Url(compressed)}`;
        }
        return `j${encodeBase64Url(bytes)}`;
    }

    async function decodeShareState(payload) {
        const value = String(payload || "");
        let bytes;
        if (value.startsWith("z")) {
            if (typeof global.DecompressionStream !== "function") {
                throw new Error("Este navegador no puede descomprimir el enlace compartido.");
            }
            bytes = await transformBytes(decodeBase64Url(value.slice(1)), global.DecompressionStream, "gzip");
        } else {
            // Los enlaces antiguos no llevaban prefijo; `j` identifica el nuevo formato sin comprimir.
            bytes = decodeBase64Url(value.startsWith("j") ? value.slice(1) : value);
        }
        return normalizeState(JSON.parse(new TextDecoder().decode(bytes)));
    }

    class CharacterStore extends EventTarget {
        constructor(options) {
            super();
            this.persistenceEnabled = options?.persistenceEnabled !== false;
            this.state = options?.initialState ? normalizeState(options.initialState) : this.load();
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
            if (!this.persistenceEnabled) return;
            this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "saving" } }));
            global.clearTimeout(this.saveTimer);
            this.saveTimer = global.setTimeout(() => this.save(), 250);
        }

        save() {
            if (!this.persistenceEnabled) return;
            try {
                global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
                this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "saved" } }));
            } catch (error) {
                console.error("[ADOM] No se pudo guardar el personaje.", error);
                this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "error" } }));
            }
        }

        reset() {
            this.state = createEmptyState();
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
        createEmptyState,
        normalizeState,
        encodeShareState,
        decodeShareState,
        CharacterStore
    });
})(window);
