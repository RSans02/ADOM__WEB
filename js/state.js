(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};
    const LEGACY_STORAGE_KEY = "adom.external.sheet.character.v1";
    const STORAGE_KEY = "adom.external.sheet.characters.v2";
    const COLLECTION_SCHEMA_VERSION = 2;

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
            schemaVersion: 22,
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
                },
                orderLinks: {
                    attributes: true,
                    skills: true
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
        state.ecstasy.arcaneSkills = [{ name: "", value: 1 }];

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

    function normalizeArcaneSkills(value, fallback) {
        const source = Array.isArray(value) ? value : fallback;
        const items = source.map(item => ({
            name: String(item?.name ?? ""),
            value: normalizeNonNegativeNumber(item?.value, 0)
        }));
        return items.length ? items : [{ name: "", value: 1 }];
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
                : (() => {
                    const weapons = Array.isArray(form.weapons) ? normalizeWeapons(form.weapons) : clone(defaultForm.weapons);
                    return weapons.length ? weapons : clone(defaultForm.weapons);
                })(),
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
                arcaneSkills: normalizeArcaneSkills(form.arcaneSkills, defaultForm.arcaneSkills)
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

    function synchronizeItemOrder(referenceItems, targetItems) {
        const positions = new Map((referenceItems || []).map((item, index) => [item.key, index]));
        targetItems.sort((left, right) => {
            const leftPosition = positions.has(left.key) ? positions.get(left.key) : Number.MAX_SAFE_INTEGER;
            const rightPosition = positions.has(right.key) ? positions.get(right.key) : Number.MAX_SAFE_INTEGER;
            return leftPosition - rightPosition;
        });
    }

    function normalizeState(candidate) {
        const defaults = createDefaultState();
        if (!candidate || typeof candidate !== "object") {
            return defaults;
        }

        const human = normalizeAnchors(migrateLegacyTalents(mergeForm(defaults.human, candidate.human)));
        const ecstasy = normalizeAnchors(migrateLegacyTalents(mergeForm(defaults.ecstasy, candidate.ecstasy)));
        const activeForm = candidate.activeForm === "ecstasy" ? "ecstasy" : "human";
        const orderLinks = {
            attributes: candidate.settings?.orderLinks?.attributes !== false,
            skills: candidate.settings?.orderLinks?.skills !== false
        };
        const referenceForm = activeForm === "ecstasy" ? ecstasy : human;
        const targetForm = activeForm === "ecstasy" ? human : ecstasy;
        if (orderLinks.attributes) synchronizeItemOrder(referenceForm.attributes, targetForm.attributes);
        if (orderLinks.skills) synchronizeItemOrder(referenceForm.skills, targetForm.skills);
        const sharedAttributeDescriptors = new Map(
            (activeForm === "ecstasy" ? ecstasy : human).attributes.map(attribute => [attribute.key, attribute.descriptor])
        );
        [human, ecstasy].forEach(form => {
            form.attributes.forEach(attribute => {
                if (sharedAttributeDescriptors.has(attribute.key)) {
                    attribute.descriptor = String(sharedAttributeDescriptors.get(attribute.key) ?? "");
                }
            });
        });
        const sharedExtraExperience = Math.max(-1, normalizeNumber(
            candidate[activeForm]?.extraExperience
                ?? candidate.human?.extraExperience
                ?? candidate.ecstasy?.extraExperience,
            0
        ));
        human.extraExperience = sharedExtraExperience;
        ecstasy.extraExperience = sharedExtraExperience;
        const sharedHealth = clone(activeForm === "ecstasy" ? ecstasy.health : human.health);
        human.health = clone(sharedHealth);
        ecstasy.health = clone(sharedHealth);
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
            schemaVersion: 22,
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
                },
                orderLinks
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
            this.collection = options?.initialState
                ? this.createCollection(normalizeState(options.initialState))
                : this.load();
            this.state = this.getActiveEntry().state;
            this.saveTimer = null;
        }

        createCharacterId() {
            if (typeof global.crypto?.randomUUID === "function") return global.crypto.randomUUID();
            return `character-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }

        createEntityId(prefix) {
            if (typeof global.crypto?.randomUUID === "function") return `${prefix}-${global.crypto.randomUUID()}`;
            return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        }

        createCampaignRecord(name = "Mi campaña") {
            const id = this.createEntityId("campaign");
            return {
                id,
                name: String(name || "Mi campaña").trim() || "Mi campaña",
                folders: ["Jugadores", "NPCs", "Enemigos"].map(folderName => ({
                    id: this.createEntityId("folder"),
                    name: folderName
                }))
            };
        }

        createCollection(initialState) {
            const id = this.createCharacterId();
            const campaign = this.createCampaignRecord();
            return {
                schemaVersion: COLLECTION_SCHEMA_VERSION,
                activeCampaignId: campaign.id,
                activeCharacterId: id,
                campaigns: [campaign],
                characters: [{ id, campaignId: campaign.id, folderId: campaign.folders[0].id, state: initialState }]
            };
        }

        normalizeCollection(candidate) {
            if (!candidate || typeof candidate !== "object" || !Array.isArray(candidate.characters)) return null;
            const usedIds = new Set();
            const characters = candidate.characters.map(entry => {
                let id = String(entry?.id || "").trim();
                if (!id || usedIds.has(id)) id = this.createCharacterId();
                usedIds.add(id);
                return {
                    id,
                    campaignId: String(entry?.campaignId || ""),
                    folderId: String(entry?.folderId || ""),
                    state: normalizeState(entry?.state)
                };
            });
            if (!characters.length) return null;
            const campaignIds = new Set();
            const campaigns = (Array.isArray(candidate.campaigns) ? candidate.campaigns : []).map(item => {
                let id = String(item?.id || "").trim();
                if (!id || campaignIds.has(id)) id = this.createEntityId("campaign");
                campaignIds.add(id);
                const folderIds = new Set();
                const folders = (Array.isArray(item?.folders) ? item.folders : []).map(folder => {
                    let folderId = String(folder?.id || "").trim();
                    if (!folderId || folderIds.has(folderId)) folderId = this.createEntityId("folder");
                    folderIds.add(folderId);
                    return { id: folderId, name: String(folder?.name || "Carpeta").trim() || "Carpeta" };
                });
                if (!folders.length) folders.push({ id: this.createEntityId("folder"), name: "Jugadores" });
                return { id, name: String(item?.name || "Campaña").trim() || "Campaña", folders };
            });
            if (!campaigns.length) campaigns.push(this.createCampaignRecord());

            const fallbackCampaign = campaigns[0];
            characters.forEach(entry => {
                const campaign = campaigns.find(item => item.id === entry.campaignId) || fallbackCampaign;
                entry.campaignId = campaign.id;
                if (!campaign.folders.some(folder => folder.id === entry.folderId)) entry.folderId = campaign.folders[0].id;
            });

            let activeCampaignId = String(candidate.activeCampaignId || "");
            if (!campaigns.some(campaign => campaign.id === activeCampaignId)) activeCampaignId = fallbackCampaign.id;
            if (!characters.some(entry => entry.campaignId === activeCampaignId)) {
                const campaign = campaigns.find(item => item.id === activeCampaignId) || fallbackCampaign;
                characters.push({
                    id: this.createCharacterId(),
                    campaignId: campaign.id,
                    folderId: campaign.folders[0].id,
                    state: createEmptyState()
                });
            }
            const requestedId = String(candidate.activeCharacterId || "");
            const activeCharacter = characters.find(entry => entry.id === requestedId && entry.campaignId === activeCampaignId)
                || characters.find(entry => entry.campaignId === activeCampaignId)
                || characters[0];
            return {
                schemaVersion: COLLECTION_SCHEMA_VERSION,
                activeCampaignId: activeCharacter.campaignId,
                activeCharacterId: activeCharacter.id,
                campaigns,
                characters
            };
        }

        load() {
            try {
                const raw = global.localStorage.getItem(STORAGE_KEY);
                const collection = raw ? this.normalizeCollection(JSON.parse(raw)) : null;
                if (collection) return collection;

                const legacyRaw = global.localStorage.getItem(LEGACY_STORAGE_KEY);
                return this.createCollection(legacyRaw ? normalizeState(JSON.parse(legacyRaw)) : createEmptyState());
            } catch (error) {
                console.warn("[ADOM] No se pudieron cargar los personajes guardados.", error);
                return this.createCollection(createEmptyState());
            }
        }

        getActiveEntry() {
            return this.collection.characters.find(entry => entry.id === this.collection.activeCharacterId)
                || this.collection.characters[0];
        }

        getState() {
            return this.state;
        }

        getActiveCharacterId() {
            return this.collection.activeCharacterId;
        }

        getActiveCampaignId() {
            return this.collection.activeCampaignId;
        }

        getCampaigns() {
            return this.collection.campaigns.map(campaign => ({
                id: campaign.id,
                name: campaign.name,
                folders: campaign.folders.map(folder => ({ ...folder }))
            }));
        }

        getFolders(campaignId = this.collection.activeCampaignId) {
            return this.collection.campaigns.find(campaign => campaign.id === campaignId)?.folders.map(folder => ({ ...folder })) || [];
        }

        getCharacters(campaignId = this.collection.activeCampaignId) {
            return this.collection.characters.filter(entry => !campaignId || entry.campaignId === campaignId).map(entry => ({
                id: entry.id,
                campaignId: entry.campaignId,
                folderId: entry.folderId,
                name: String(entry.state.profile?.name || "").trim()
            }));
        }

        switchCampaign(id) {
            const campaign = this.collection.campaigns.find(item => item.id === id);
            if (!campaign || campaign.id === this.collection.activeCampaignId) return false;
            const entry = this.collection.characters.find(character => character.campaignId === campaign.id);
            if (!entry) return false;
            this.collection.activeCampaignId = campaign.id;
            this.collection.activeCharacterId = entry.id;
            this.state = entry.state;
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "campaign-switch" } }));
            this.scheduleSave();
            return true;
        }

        switchCharacter(id) {
            const entry = this.collection.characters.find(character => character.id === id);
            if (!entry || entry.id === this.collection.activeCharacterId) return false;
            this.collection.activeCampaignId = entry.campaignId;
            this.collection.activeCharacterId = entry.id;
            this.state = entry.state;
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "character-switch" } }));
            this.scheduleSave();
            return true;
        }

        createCharacter(options) {
            const campaign = this.collection.campaigns.find(item => item.id === options?.campaignId)
                || this.collection.campaigns.find(item => item.id === this.collection.activeCampaignId)
                || this.collection.campaigns[0];
            const folderId = campaign.folders.some(folder => folder.id === options?.folderId)
                ? options.folderId
                : campaign.folders[0].id;
            const entry = { id: this.createCharacterId(), campaignId: campaign.id, folderId, state: createEmptyState() };
            this.collection.characters.push(entry);
            this.collection.activeCampaignId = campaign.id;
            this.collection.activeCharacterId = entry.id;
            this.state = entry.state;
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "character-create" } }));
            this.scheduleSave();
            return entry.id;
        }

        deleteCharacter(id) {
            const target = this.collection.characters.find(entry => entry.id === id);
            if (!target) return false;
            if (this.collection.characters.filter(entry => entry.campaignId === target.campaignId).length <= 1) return false;
            const index = this.collection.characters.findIndex(entry => entry.id === id);
            this.collection.characters.splice(index, 1);
            if (this.collection.activeCharacterId === id) {
                const nextEntry = this.collection.characters.find(entry => entry.campaignId === target.campaignId)
                    || this.collection.characters[Math.min(index, this.collection.characters.length - 1)];
                this.collection.activeCampaignId = nextEntry.campaignId;
                this.collection.activeCharacterId = nextEntry.id;
                this.state = nextEntry.state;
            }
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "character-delete" } }));
            this.scheduleSave();
            return true;
        }

        createCampaign(name) {
            const campaign = this.createCampaignRecord(name || "Nueva campaña");
            this.collection.campaigns.push(campaign);
            const characterId = this.createCharacter({ campaignId: campaign.id, folderId: campaign.folders[0].id });
            return { campaignId: campaign.id, characterId };
        }

        renameCampaign(id, name) {
            const campaign = this.collection.campaigns.find(item => item.id === id);
            const normalizedName = String(name || "").trim();
            if (!campaign || !normalizedName) return false;
            campaign.name = normalizedName;
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "campaign-rename" } }));
            this.scheduleSave();
            return true;
        }

        deleteCampaign(id) {
            if (this.collection.campaigns.length <= 1) return false;
            const index = this.collection.campaigns.findIndex(campaign => campaign.id === id);
            if (index < 0) return false;
            const removedCharacterIds = new Set(this.collection.characters.filter(entry => entry.campaignId === id).map(entry => entry.id));
            this.collection.campaigns.splice(index, 1);
            this.collection.characters = this.collection.characters.filter(entry => entry.campaignId !== id);
            if (this.collection.activeCampaignId === id || removedCharacterIds.has(this.collection.activeCharacterId)) {
                const nextCampaign = this.collection.campaigns[Math.min(index, this.collection.campaigns.length - 1)];
                const nextEntry = this.collection.characters.find(entry => entry.campaignId === nextCampaign.id);
                this.collection.activeCampaignId = nextCampaign.id;
                this.collection.activeCharacterId = nextEntry.id;
                this.state = nextEntry.state;
            }
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "campaign-delete" } }));
            this.scheduleSave();
            return true;
        }

        createFolder(campaignId, name) {
            const campaign = this.collection.campaigns.find(item => item.id === campaignId);
            const normalizedName = String(name || "").trim();
            if (!campaign || !normalizedName) return null;
            const folder = { id: this.createEntityId("folder"), name: normalizedName };
            campaign.folders.push(folder);
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "folder-create" } }));
            this.scheduleSave();
            return folder.id;
        }

        renameFolder(campaignId, folderId, name) {
            const folder = this.collection.campaigns.find(item => item.id === campaignId)?.folders.find(item => item.id === folderId);
            const normalizedName = String(name || "").trim();
            if (!folder || !normalizedName) return false;
            folder.name = normalizedName;
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "folder-rename" } }));
            this.scheduleSave();
            return true;
        }

        deleteFolder(campaignId, folderId) {
            const campaign = this.collection.campaigns.find(item => item.id === campaignId);
            if (!campaign || campaign.folders.length <= 1) return false;
            const index = campaign.folders.findIndex(folder => folder.id === folderId);
            if (index < 0) return false;
            campaign.folders.splice(index, 1);
            const fallbackFolder = campaign.folders[Math.min(index, campaign.folders.length - 1)];
            this.collection.characters.forEach(entry => {
                if (entry.campaignId === campaignId && entry.folderId === folderId) entry.folderId = fallbackFolder.id;
            });
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "folder-delete" } }));
            this.scheduleSave();
            return true;
        }

        moveCharacter(characterId, folderId) {
            const entry = this.collection.characters.find(item => item.id === characterId);
            const campaign = entry && this.collection.campaigns.find(item => item.id === entry.campaignId);
            if (!entry || !campaign?.folders.some(folder => folder.id === folderId)) return false;
            entry.folderId = folderId;
            this.dispatchEvent(new CustomEvent("change", { detail: { source: "character-move" } }));
            this.scheduleSave();
            return true;
        }

        replace(nextState, options) {
            this.state = normalizeState(nextState);
            this.getActiveEntry().state = this.state;
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
                global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.collection));
                this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "saved" } }));
            } catch (error) {
                console.error("[ADOM] No se pudo guardar el personaje.", error);
                this.dispatchEvent(new CustomEvent("save-state", { detail: { state: "error" } }));
            }
        }

        reset() {
            this.state = createEmptyState();
            this.getActiveEntry().state = this.state;
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
        LEGACY_STORAGE_KEY,
        createDefaultState,
        createEmptyState,
        normalizeState,
        encodeShareState,
        decodeShareState,
        CharacterStore
    });
})(window);
