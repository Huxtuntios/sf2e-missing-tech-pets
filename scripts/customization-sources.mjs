// Собственные SF2e Items устраняют зависимость от совпадений имён в чужих паках.
// Каталог хранит правила и признаки автоматизации; сборка и runtime используют одну фабрику.
import { MODULE_ID, escapeHTML as esc } from "./item-sources.mjs";
export function buildCustomizationSource(entry) {
  const active = [
    "light-mounts",
    "network",
    "emergency-repair",
    "recharge",
  ].includes(entry.id);
  return {
    _id: entry.itemId,
    name: entry.name,
    type: "feat",
    img: `modules/${MODULE_ID}/assets/icons/powerful-chassis.svg`,
    effects: [],
    system: {
      slug: entry.id,
      actionType: { value: active ? "action" : "passive" },
      actions: { value: active ? 1 : null },
      category: "bonus",
      location: null,
      level: { value: 1, taken: 1 },
      onlyLevel1: false,
      maxTakable: entry.repeatable ? null : 1,
      prerequisites: { value: [] },
      publication: {
        title: "Tech Core",
        authors: "",
        license: "ORC",
        remaster: true,
      },
      description: {
        value: `<p>${esc(entry.description)}</p><p>@Localize[SFMTP.${entry.automation === "rules" ? "CustomRulesHint" : "CustomManualHint"}]</p><p><a href="${esc(entry.sourceUrl)}">Tech Core — Archives of Nethys</a></p>`,
      },
      traits: {
        rarity: "common",
        value: entry.id === "recharge" ? ["concentrate"] : [],
        otherTags: [],
      },
      rules: structuredClone(entry.rules ?? []),
    },
    flags: {
      core: {
        sourceId: `Compendium.${MODULE_ID}.robot-customizations.Item.${entry.itemId}`,
      },
      [MODULE_ID]: {
        moduleProvided: true,
        robotCustomization: true,
        catalogId: entry.id,
        customizationGrade: entry.grade,
        automation: entry.automation,
      },
    },
  };
}

// Переносим только подтверждённый нативный выбор, не подготовленные характеристики.
export function preserveCustomizationChoices(source, previous) {
  const choices = previous.flags?.sf2e?.rulesSelections;
  if (!choices) return source;
  source.flags.sf2e ??= {};
  source.flags.sf2e.rulesSelections = {};
  for (const rule of source.system.rules) {
    if (rule.key !== "ChoiceSet" || !rule.flag) continue;
    const value = choices[rule.flag];
    if (!rule.choices?.some((choice) => choice.value === value)) continue;
    rule.selection = value;
    source.flags.sf2e.rulesSelections[rule.flag] = value;
  }
  return source;
}
