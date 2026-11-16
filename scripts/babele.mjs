const MODULE_ID = "sf2e-missing-tech-pets";
const registered = new WeakSet();
export function registerBabeleTranslation(api) {
  if (typeof api?.register !== "function" || registered.has(api)) return false;
  try {
    api.register({ module: MODULE_ID, dir: "lang/babele/ru", lang: "ru" });
    registered.add(api);
    return true;
  } catch (error) {
    console.warn(`${MODULE_ID} | Babele registration failed; local content translation remains available.`, error);
    return false;
  }
}
Hooks.once("babele.init", registerBabeleTranslation);
