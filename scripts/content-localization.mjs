import { MODULE_ID, escapeHTML as esc } from "./item-sources.mjs";
let russian;
let loading;
const language = () => globalThis.game?.i18n?.lang ?? "en";

export function initializeContentLocalization() {
  if (russian) return Promise.resolve(russian);
  if (loading) return loading;
  loading = (async () => {
    const base = game.modules.get(MODULE_ID)?.path ?? `modules/${MODULE_ID}`;
    const response = await fetch(`${base}/data/ru-content.json`);
    if (!response.ok) throw new Error(`Cannot load ${MODULE_ID}/data/ru-content.json (${response.status})`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !data["familiar-abilities"]?.entries || !data["robot-customizations"]?.entries || !data["robot-chassis"]?.entries)
      throw new Error(`Invalid ${MODULE_ID} Russian content file`);
    russian = data;
    return data;
  })().catch((error) => { loading = undefined; throw error; });
  return loading;
}
export const displayField = (entry, field) => entry.display?.[field] ?? entry[field];
export const displayTerm = (word) => language() === "ru" ? (russian?.terms?.[word] ?? word) : word;

export function localizeCatalog(catalog, category, options = {}) {
  const selectedLanguage = options.language ?? language();
  const translations = options.translations ?? russian;
  const translated = translations?.[category];
  if (selectedLanguage !== "ru" || !translated) return catalog;
  return {
    ...catalog,
    note: translated.note ?? catalog.note,
    entries: catalog.entries.map((entry) => ({
      ...entry,
      display: { rulesNote: translated.rulesNote, ...translated.entries[entry.id] },
    })),
  };
}
function preserveConditionLinks(original, translated) {
  const names = { "off-guard": "застигнут врасплох", prone: "ничком", dazzled: "ослеплён" };
  for (const match of original.matchAll(/@UUID\[([^\]]+)\]\{([^}]+)\}/g)) {
    const name = Object.entries(names).find(
      ([english, russian]) => match[2] === english || match[2] === russian,
    )?.[1];
    if (name) translated = translated.replace(name, `@UUID[${match[1]}]{${name}}`);
  }
  return translated;
}
export function localizeItemSource(source, category, entry, options = {}) {
  const selectedLanguage = options.language ?? language();
  const translations = options.translations ?? russian;
  const family = ["robot-support", "robot-advanced-maneuvers"].includes(category) ? "robot-chassis" : category;
  const text = translations?.[family]?.entries?.[entry.id];
  if (selectedLanguage !== "ru" || !text) return source;
  const result = structuredClone(source);
  const original = source.system.description.value;
  result.name = category === "robot-support" ? `${text.name}: Поддержка`
    : category === "robot-advanced-maneuvers" ? text.advancedManeuver : text.name;
  let description;
  if (category === "robot-chassis") {
    description = `<p>${esc(text.special ?? text.name)}</p><p><strong>Преимущество поддержки:</strong> ${esc(text.supportBenefit)}</p><p><strong>Продвинутый манёвр:</strong> ${esc(text.advancedManeuver)}</p><p>${esc(translations[family].rulesNote)}</p>`;
  } else {
    const value = category === "robot-support" ? text.supportBenefit
      : category === "robot-advanced-maneuvers" ? text.advancedManeuverDescription : text.description;
    description = original.replace(/^<p>[\s\S]*?<\/p>/, `<p>${esc(value)}</p>`);
  }
  result.system.description.value = preserveConditionLinks(original, description);
  return result;
}
