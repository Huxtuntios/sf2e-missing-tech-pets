// SF2e-способности фамильяров: описание не выдаётся за выполненный игровой эффект.
import { MODULE_ID, escapeHTML } from "./item-sources.mjs";
import { ownPackName } from "./system-context.mjs";
export function buildFamiliarSource(entry, system = "sf2e") {
  return {
    _id: entry.itemId,
    name: entry.name,
    type: "action",
    img: `systems/${system}/icons/actions/Passive.webp`,
    system: {
      slug: entry.id,
      actionType: {
        value: entry.id === "familiar-focus" ? "action" : "passive",
      },
      actions: { value: entry.id === "familiar-focus" ? 2 : null },
      category: "familiar",
      description: {
        value: `<p>${escapeHTML(entry.description)}</p>`,
      },
      publication: {
        title: "Tech Core",
        authors: "",
        license: "ORC",
        remaster: true,
      },
      traits: { rarity: "common", value: [] },
      rules: structuredClone(entry.rules ?? []),
    },
    flags: {
      core: {
        sourceId: `Compendium.${MODULE_ID}.${ownPackName("familiar-abilities", system)}.Item.${entry.itemId}`,
      },
      [MODULE_ID]: {
        familiarAbility: true,
        catalogId: entry.id,
        abilityCategory: entry.category,
        automation: entry.automation,
      },
    },
    effects: [],
  };
}
