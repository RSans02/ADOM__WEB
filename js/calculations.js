(function (global) {
    "use strict";

    const ADOM = global.ADOM = global.ADOM || {};

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function sum(items, selector) {
        return items.reduce((total, item) => total + number(selector(item)), 0);
    }

    function findValue(items, key) {
        return number(items.find(item => item.key === key)?.value);
    }

    function countTalents(skills) {
        return (skills || []).reduce((total, skill) => {
            return total + (skill.talents || []).filter(talent => String(talent || "").trim()).length;
        }, 0);
    }

    function calculateTier(experience) {
        const xp = number(experience);
        if (xp < 400) return xp / 400;
        if (xp < 500) return 1 + (xp - 400) / 100;
        if (xp < 600) return 2 + (xp - 500) / 100;
        if (xp < 800) return 3 + (xp - 600) / 200;
        return 4 + (xp - 800) / 800;
    }

    function isDamageFormulaInput(value) {
        const formula = String(value ?? "");
        return formula.length <= 16 && /^[mMc]*$/.test(formula);
    }

    function parseDamageFormula(value) {
        const formula = String(value ?? "").trim();
        if (!/^[mMc]+$/.test(formula) || formula.length > 16) return null;
        return { formula, symbols: [...formula] };
    }

    function calculateWeaponDamage(formula, dice, bonus = 0) {
        const parsed = parseDamageFormula(formula);
        if (!parsed || !Array.isArray(dice) || dice.length !== 3) return null;
        const safeBonus = number(bonus);
        if (!Number.isSafeInteger(safeBonus)) return null;
        const sortedDice = dice.map(number).sort((a, b) => a - b);
        if (sortedDice.some(die => !Number.isInteger(die) || die < 1 || die > 10)) return null;
        const values = { m: sortedDice[0], c: sortedDice[1], M: sortedDice[2] };
        const selectedDice = parsed.symbols.map(symbol => values[symbol]);
        const diceTotal = selectedDice.reduce((total, die) => total + die, 0);
        const total = diceTotal + safeBonus;
        if (!Number.isSafeInteger(total)) return null;
        return { ...parsed, bonus: safeBonus, sortedDice, values, selectedDice, diceTotal, total };
    }

    function deriveForm(state, formKey) {
        const form = state[formKey];
        const attributesTotal = sum(form.attributes, item => item.value);
        const skillsTotal = sum(form.skills, item => item.value);
        const talentsTotal = countTalents(form.skills);
        const bondsTotal = sum(form.bonds.filter(item => String(item.name || "").trim()), item => item.level);
        const arcaneTotal = formKey === "ecstasy" ? sum(form.arcaneSkills || [], item => item.value) : 0;

        const strength = findValue(form.attributes, "strength");
        const reflexes = findValue(form.attributes, "reflexes");
        const will = findValue(form.attributes, "will");
        const intellect = findValue(form.attributes, "intellect");
        const combat = findValue(form.skills, "combat");

        const initiative = Math.floor(reflexes + intellect / 2);
        const rangedDamage = Math.floor(combat / 4);
        const meleeDamage = Math.floor((strength + combat) / 4);
        const woundThreshold = Math.floor(strength + will / 2);
        const totalResistance = woundThreshold * 3;
        const ecstasyExit = 10 + number(state.distortion.level);

        const experience = attributesTotal * 15
            + skillsTotal * 5
            + talentsTotal * 10
            + bondsTotal * 5
            + arcaneTotal * 5;

        const humanBondsTotal = sum(state.human.bonds.filter(item => String(item.name || "").trim()), item => item.level);
        const adjustedExperience = formKey === "ecstasy"
            ? experience - number(state.distortion.level) * 30 + humanBondsTotal * 5
            : experience;

        return {
            attributesTotal,
            skillsTotal,
            talentsTotal,
            bondsTotal,
            arcaneTotal,
            initiative,
            rangedDamage,
            meleeDamage,
            woundThreshold,
            totalResistance,
            ecstasyExit,
            experience,
            adjustedExperience,
            tier: calculateTier(adjustedExperience)
        };
    }

    ADOM.Calculations = Object.freeze({
        number,
        countTalents,
        calculateTier,
        isDamageFormulaInput,
        parseDamageFormula,
        calculateWeaponDamage,
        deriveForm
    });
})(window);
