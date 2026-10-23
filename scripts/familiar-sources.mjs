// SF2e-способности фамильяров: описание не выдаётся за выполненный игровой эффект.
import { MODULE_ID, escapeHTML } from "./item-sources.mjs";
export function buildFamiliarSource(entry) {
  return {
    _id: entry.itemId,
    name: entry.name,
    type: "action",
    img: "systems/sf2e/icons/actions/Passive.webp",
    system: {
      slug: entry.id,
      actionType: {
        value: entry.id === "familiar-focus" ? "action" : "passive",
      },
      actions: { value: entry.id === "familiar-focus" ? 2 : null },
      category: "familiar",
      description: {
        value: `<p>${escapeHTML(entry.description)}</p><p><a href="${escapeHTML(entry.sourceUrl)}">Tech Core — Archives of Nethys</a></p>`,
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
        sourceId: `Compendium.${MODULE_ID}.familiar-abilities.Item.${entry.itemId}`,
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
