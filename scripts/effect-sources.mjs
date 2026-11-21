import { MODULE_ID, adaptRulesToSystem } from "./item-sources.mjs";
import { ownPackName } from "./system-context.mjs";

const publication = { title: "Tech Core", authors: "", license: "ORC", remaster: true };

// Временные Effect Items применяются отдельно от постоянного источника.
// Ссылки на состояния SF2e (conditions) переключаются на PF2e (conditionitems).
const switchConditionRefs = (node, system) => {
  if (system !== "pf2e") return node;
  if (typeof node === "string")
    return node.replaceAll(
      "Compendium.sf2e.conditions.",
      "Compendium.pf2e.conditionitems.",
    );
  if (Array.isArray(node)) return node.map((child) => switchConditionRefs(child, system));
  if (node && typeof node === "object")
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [key, switchConditionRefs(value, system)]),
    );
  return node;
};

export function buildEffectSource(effect, system = "sf2e") {
  return {
    _id: effect.itemId,
    name: effect.name,
    type: "effect",
    img: "icons/svg/aura.svg",
    effects: [],
    ownership: { default: 0 },
    system: {
      slug: effect.slug,
      description: { value: effect.description, gm: "" },
      duration: { ...effect.duration },
      fromSpell: false,
      level: { value: effect.level },
      publication: { ...publication },
      start: { initiative: null, value: 0 },
      tokenIcon: { show: true },
      traits: { rarity: "common", value: [], otherTags: [] },
      unidentified: false,
      badge: null,
      context: null,
      rules: switchConditionRefs(adaptRulesToSystem(effect.rules, system), system),
    },
    flags: {
      core: {
        sourceId: `Compendium.${MODULE_ID}.${ownPackName(effect.pack, system)}.Item.${effect.itemId}`,
      },
      [MODULE_ID]: { moduleProvided: true, itemEffect: true, effectId: effect.slug },
    },
  };
}