(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};

    function findEndOfCentralDirectory(view) {
        const minimumOffset = Math.max(0, view.byteLength - 65557);
        for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
            if (view.getUint32(offset, true) === 0x06054b50) return offset;
        }
        throw new Error("El archivo no es un Excel .xlsx válido.");
    }

    function normalizeZipPath(path) {
        const result = [];
        String(path).replace(/^\/+/, "").split("/").forEach(part => {
            if (!part || part === ".") return;
            if (part === "..") result.pop();
            else result.push(part);
        });
        return result.join("/");
    }

    class ZipArchive {
        constructor(buffer) {
            this.buffer = buffer;
            this.view = new DataView(buffer);
            this.decoder = new TextDecoder();
            this.entries = this.readDirectory();
        }

        readDirectory() {
            const endOffset = findEndOfCentralDirectory(this.view);
            const entryCount = this.view.getUint16(endOffset + 10, true);
            let offset = this.view.getUint32(endOffset + 16, true);
            const entries = new Map();

            for (let index = 0; index < entryCount; index += 1) {
                if (this.view.getUint32(offset, true) !== 0x02014b50) {
                    throw new Error("El índice interno del Excel está dañado.");
                }
                const compression = this.view.getUint16(offset + 10, true);
                const compressedSize = this.view.getUint32(offset + 20, true);
                const uncompressedSize = this.view.getUint32(offset + 24, true);
                const nameLength = this.view.getUint16(offset + 28, true);
                const extraLength = this.view.getUint16(offset + 30, true);
                const commentLength = this.view.getUint16(offset + 32, true);
                const localHeaderOffset = this.view.getUint32(offset + 42, true);
                const nameBytes = new Uint8Array(this.buffer, offset + 46, nameLength);
                const name = normalizeZipPath(this.decoder.decode(nameBytes));
                entries.set(name, { compression, compressedSize, uncompressedSize, localHeaderOffset });
                offset += 46 + nameLength + extraLength + commentLength;
            }
            return entries;
        }

        async read(path) {
            const normalizedPath = normalizeZipPath(path);
            const entry = this.entries.get(normalizedPath);
            if (!entry) return null;
            const offset = entry.localHeaderOffset;
            if (this.view.getUint32(offset, true) !== 0x04034b50) {
                throw new Error("Una sección interna del Excel está dañada.");
            }
            const nameLength = this.view.getUint16(offset + 26, true);
            const extraLength = this.view.getUint16(offset + 28, true);
            const dataOffset = offset + 30 + nameLength + extraLength;
            const compressed = new Uint8Array(this.buffer, dataOffset, entry.compressedSize);
            if (entry.compression === 0) return new Uint8Array(compressed);
            if (entry.compression !== 8 || typeof global.DecompressionStream !== "function") {
                throw new Error("Este navegador no puede descomprimir el Excel seleccionado.");
            }
            const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
            const result = new Uint8Array(await new Response(stream).arrayBuffer());
            if (entry.uncompressedSize && result.byteLength !== entry.uncompressedSize) {
                throw new Error("No se pudo descomprimir correctamente el Excel.");
            }
            return result;
        }

        async readText(path) {
            const bytes = await this.read(path);
            return bytes ? this.decoder.decode(bytes) : null;
        }
    }

    function parseXml(text, description) {
        if (!text) throw new Error(`Falta ${description} en el Excel.`);
        const document = new DOMParser().parseFromString(text, "application/xml");
        if (document.querySelector("parsererror")) throw new Error(`No se pudo leer ${description}.`);
        return document;
    }

    function relationshipTarget(basePath, target) {
        if (String(target).startsWith("/")) return normalizeZipPath(target);
        const baseParts = normalizeZipPath(basePath).split("/");
        baseParts.pop();
        return normalizeZipPath([...baseParts, target].join("/"));
    }

    async function readSharedStrings(archive) {
        const text = await archive.readText("xl/sharedStrings.xml");
        if (!text) return [];
        const document = parseXml(text, "los textos compartidos");
        return Array.from(document.getElementsByTagName("si"), item =>
            Array.from(item.getElementsByTagName("t"), node => node.textContent || "").join("")
        );
    }

    function readSheetCells(document, sharedStrings) {
        const cells = new Map();
        Array.from(document.getElementsByTagName("c")).forEach(cell => {
            const address = String(cell.getAttribute("r") || "").toUpperCase();
            if (!address) return;
            const type = cell.getAttribute("t");
            const valueNode = cell.getElementsByTagName("v")[0];
            const rawValue = valueNode?.textContent ?? "";
            let value;
            if (type === "s") value = sharedStrings[Number(rawValue)] ?? "";
            else if (type === "b") value = rawValue === "1";
            else if (type === "inlineStr") {
                value = Array.from(cell.getElementsByTagName("t"), node => node.textContent || "").join("");
            } else if (type === "str" || type === "e") value = rawValue;
            else value = rawValue === "" ? "" : Number(rawValue);
            cells.set(address, Number.isNaN(value) ? rawValue : value);
        });
        return cells;
    }

    async function readSheets(archive) {
        const workbookDocument = parseXml(await archive.readText("xl/workbook.xml"), "la lista de hojas");
        const relationshipsDocument = parseXml(
            await archive.readText("xl/_rels/workbook.xml.rels"),
            "las relaciones entre hojas"
        );
        const targets = new Map(Array.from(relationshipsDocument.getElementsByTagName("Relationship"), relation => [
            relation.getAttribute("Id"),
            relationshipTarget("xl/workbook.xml", relation.getAttribute("Target") || "")
        ]));
        const sharedStrings = await readSharedStrings(archive);
        const sheets = new Map();

        for (const sheet of Array.from(workbookDocument.getElementsByTagName("sheet"))) {
            const name = sheet.getAttribute("name") || "";
            const relationshipId = sheet.getAttribute("r:id")
                || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
            const target = targets.get(relationshipId);
            if (!target) continue;
            const sheetDocument = parseXml(await archive.readText(target), `la hoja ${name}`);
            sheets.set(name, readSheetCells(sheetDocument, sharedStrings));
        }
        return sheets;
    }

    function findSheet(sheets, matcher) {
        const entry = Array.from(sheets.entries()).find(([name]) => matcher.test(
            name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        ));
        return entry?.[1] || null;
    }

    function text(cells, address) {
        return String(cells?.get(address) ?? "").trim();
    }

    function cleanPlaceholder(value) {
        const result = String(value ?? "").trim();
        return result === "-" ? "" : result;
    }

    function number(cells, address, fallback = 0) {
        const value = Number(cells?.get(address));
        return Number.isFinite(value) ? value : fallback;
    }

    function checked(cells, address) {
        const value = cells?.get(address);
        return value === true || value === 1 || String(value).toLowerCase() === "true";
    }

    function splitAttributeLabel(value, code) {
        return String(value || "").replace(new RegExp(`^${code}\\s*`, "i"), "").trim();
    }

    function splitTalents(value) {
        const talents = cleanPlaceholder(value).split(/\s*[\/;\n]\s*/).filter(Boolean).slice(0, 2);
        return [talents[0] || "", talents[1] || ""];
    }

    function importAttributes(form, cells) {
        const rows = ["3", "4", "5", "6"];
        form.attributes.forEach((attribute, index) => {
            const row = rows[index];
            attribute.descriptor = splitAttributeLabel(text(cells, `B${row}`), attribute.code);
            attribute.value = number(cells, `C${row}`);
        });
    }

    function importSkills(form, cells) {
        form.skills.forEach((skill, index) => {
            const row = 9 + index;
            const importedLabel = text(cells, `B${row}`);
            if (importedLabel) skill.label = importedLabel;
            skill.value = number(cells, `C${row}`);
            skill.talents = splitTalents(text(cells, `E${row}`));
        });
    }

    function importWeapons(cells) {
        const weapons = [8, 9].map(row => ({
            name: text(cells, `N${row}`),
            damage: text(cells, `O${row}`),
            damageType: "ranged"
        })).filter(weapon => weapon.name || weapon.damage);
        return weapons.length ? weapons : [{ name: "", damage: "", damageType: "ranged" }];
    }

    function importBonds(cells) {
        return Array.from({ length: 8 }, (_, index) => {
            const row = 20 + index;
            return {
                name: text(cells, `N${row}`),
                level: Math.max(1, number(cells, `O${row}`, 1)),
                anchor: /⚓|true|1/i.test(text(cells, `S${row}`))
            };
        });
    }

    async function firstEmbeddedImage(archive) {
        const path = Array.from(archive.entries.keys()).find(name => /^xl\/media\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(name));
        if (!path) return "";
        const bytes = await archive.read(path);
        if (!bytes || bytes.byteLength > 2_000_000) return "";
        const extension = path.split(".").pop().toLowerCase();
        const mime = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        return `data:${mime};base64,${global.btoa(binary)}`;
    }

    async function importCharacter(file) {
        if (!file || !/\.xlsx$/i.test(file.name || "")) {
            throw new Error("Selecciona un archivo de Excel con extensión .xlsx.");
        }
        const archive = new ZipArchive(await file.arrayBuffer());
        const sheets = await readSheets(archive);
        const humanCells = findSheet(sheets, /forma humana/);
        const ecstasyCells = findSheet(sheets, /forma de extasis/);
        if (!humanCells || !ecstasyCells) {
            throw new Error("El Excel debe incluir las hojas “Forma humana” y “Forma de Éxtasis”.");
        }

        const state = ADOM.State.createEmptyState();
        state.profile.name = text(humanCells, "G3") || text(ecstasyCells, "G3");
        state.profile.concept = text(humanCells, "G6") || text(ecstasyCells, "G6");
        state.profile.complication = text(humanCells, "G9") || text(ecstasyCells, "G9");
        state.profile.temporalAspects = [3, 4, 5, 6].map(row => cleanPlaceholder(humanCells.get(`E${row}`)));
        state.profile.milestones = Array.from({ length: 6 }, (_, index) => cleanPlaceholder(humanCells.get(`G${19 + index}`)));
        state.profile.imageUrl = await firstEmbeddedImage(archive);

        importAttributes(state.human, humanCells);
        importAttributes(state.ecstasy, ecstasyCells);
        importSkills(state.human, humanCells);
        importSkills(state.ecstasy, ecstasyCells);

        state.drama = ["H14", "I14", "J14", "K14", "L14"].map(address => checked(humanCells, address));
        const extraExperience = number(humanCells, "H16", number(ecstasyCells, "H16"));
        state.human.extraExperience = extraExperience;
        state.ecstasy.extraExperience = extraExperience;
        state.human.rd = number(humanCells, "O6");
        state.ecstasy.rd = number(ecstasyCells, "O6");
        state.human.weapons = importWeapons(humanCells);

        state.human.health.currentResistance = number(humanCells, "C21");
        state.human.health.lightWounds = ["C23", "C24"].map(address => checked(humanCells, address));
        state.human.health.severeWounds = ["D23", "D24"].map(address => checked(humanCells, address));
        state.ecstasy.health = JSON.parse(JSON.stringify(state.human.health));

        state.distortion.level = number(ecstasyCells, "O12", number(humanCells, "O12"));
        state.distortion.ecstasyTrack = [
            "O15", "P15", "Q15", "R15", "S15",
            "O16", "P16", "Q16", "R16", "S16"
        ].map(address => checked(ecstasyCells, address));
        state.human.bonds = importBonds(humanCells);
        state.ecstasy.arcaneSkills = Array.from({ length: 3 }, (_, index) => {
            const row = 23 + index;
            return { name: text(ecstasyCells, `N${row}`), value: Math.max(1, number(ecstasyCells, `O${row}`, 1)) };
        }).filter(skill => skill.name);
        if (!state.ecstasy.arcaneSkills.length) state.ecstasy.arcaneSkills = [{ name: "", value: 1 }];

        return ADOM.State.normalizeState(state);
    }

    ADOM.Excel = Object.freeze({ importCharacter });
})(window);
