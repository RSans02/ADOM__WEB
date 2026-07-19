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

    function deriveForm(state, formKey) {
        const form = state[formKey];
        const attributesTotal = sum(form.attributes, item => item.value);
        const skillsTotal = sum(form.skills, item => item.value);
        const talentsTotal = countTalents(form.skills);
        const bondsTotal = sum(form.bonds, item => item.level);
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

        const humanBondsTotal = sum(state.human.bonds, item => item.level);
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
        deriveForm
    });
})(window);
