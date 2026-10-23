// Свой словарь загружается до регистрации окон; методы локализации Foundry не подменяются.
const MODULE_ID = "sf2e-missing-tech-pets";
let loading;
let dictionary = {};
let currentLanguage;
const atPath = (object, key) =>
  key.split(".").reduce((value, part) => value?.[part], object);
function flatten(object, prefix = "") {
  return Object.fromEntries(
    Object.entries(object).flatMap(([key, value]) => {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string"
        ? [[fullKey, value]]
        : Object.entries(flatten(value, fullKey));
    }),
  );
}
export function initializeLocalization() {
  const language = game.i18n.lang === "ru" ? "ru" : "en";
  if (loading && currentLanguage === language) return loading;
  currentLanguage = language;
  loading = (async () => {
    const base = game.modules.get(MODULE_ID)?.path ?? `modules/${MODULE_ID}`;
    const load = async (lang) => {
      const response = await fetch(`${base}/lang/${lang}.json`, {
        cache: "reload",
      });
      if (!response.ok)
        throw new Error(
          `Cannot load ${MODULE_ID}/lang/${lang}.json (${response.status})`,
        );
      const data = await response.json();
      if (typeof data.SFMTP?.Title !== "string")
        throw new Error(`Invalid ${MODULE_ID} language file: ${lang}`);
      return data.SFMTP;
    };
    const english = await load("en");
    const selected = language === "en" ? english : await load(language);
    dictionary = {
      ...flatten({ SFMTP: english }),
      ...flatten({ SFMTP: selected }),
    };
    // Регистрируем только принадлежащий модулю namespace для @Localize и настроек Foundry.
    // Плоские алиасы поддерживают потребителей, читающих ключ напрямую, без getProperty.
    if (game.i18n.translations && typeof game.i18n.translations === "object") {
      const namespace = structuredClone(english);
      const merge = (target, source) => {
        for (const [key, value] of Object.entries(source)) {
          if (typeof value === "string") target[key] = value;
          else merge((target[key] ??= {}), value);
        }
      };
      merge(namespace, selected);
      Object.assign(game.i18n.translations, { SFMTP: namespace }, dictionary);
    }
  })().catch((error) => {
    loading = undefined;
    console.error(`${MODULE_ID} | Localization could not be loaded`, error);
    throw error;
  });
  return loading;
}
export function t(key) {
  const fullKey = key.startsWith("SFMTP.") ? key : `SFMTP.${key}`;
  const native = game.i18n.localize(fullKey);
  return native !== fullKey
    ? native
    : (dictionary[fullKey] ??
        atPath(game.i18n.translations, fullKey) ??
        fullKey);
}
