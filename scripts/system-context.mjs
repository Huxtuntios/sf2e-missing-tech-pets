export const systemId = () => globalThis.game?.system?.id ?? "sf2e";
export const supportedSystem = () => ["pf2e", "sf2e"].includes(systemId());
export const hasAnachronism = () =>
  Boolean(globalThis.game?.modules?.get("sf2e-anachronism")?.active);
export const ownPackName = (name, system = systemId()) =>
  system === "pf2e" ? `pf2e-${name}` : name;
export const companionPackKey = (key, system = systemId()) =>
  system === "pf2e" ? key.replace(/^sf-/, "") : key;
export const companionClassUuid = (system = systemId()) =>
  `Compendium.pf2e-animal-companions.${system === "pf2e" ? "AC-Features" : "sf-AC-Features"}.Item.KKOgokqHa7RjVDN6`;

export function nativeUuid(uuid) {
  if (systemId() !== "pf2e" || !uuid?.startsWith("Compendium.sf2e."))
    return uuid;
  if (!hasAnachronism()) return null;
  const match = Object.entries(globalThis.CONFIG?.compendium?.uuidRedirects ?? {})
    .filter(([prefix]) => uuid === prefix || uuid.startsWith(`${prefix}.`))
    .sort(([a], [b]) => b.length - a.length)[0];
  return match ? match[1] + uuid.slice(match[0].length) : null;
}

export function matchesNativeUuid(origin, uuid) {
  const resolved = nativeUuid(uuid);
  return Boolean(resolved && (origin === resolved || origin === uuid));
}

// Реестр equipmentTraits SF2e/PF2e не содержит minibot (он зарегистрирован в
// shieldTraits), поэтому схема equipment отфильтровывает его из traits.value.
// Регистрируем признак для equipment, чтобы предметы Minibot сохраняли и
// отображали его. Вызывается в init до загрузки паков; не перезаписывает существующее.
export function registerMinibotEquipmentTrait(config = globalThis.CONFIG) {
  const traits = config?.PF2E?.equipmentTraits;
  if (traits && !("minibot" in traits)) traits.minibot = "PF2E.TraitMinibot";
}

// Признак minibot нужен и как признак существа: актёр-минибот несёт его в
// traits.value, а RE предметов экипировки гейтятся предикатом self:trait:minibot.
// Регистрируем в creatureTraits, чтобы признак отображался с системной меткой.
export function registerMinibotCreatureTrait(config = globalThis.CONFIG) {
  const traits = config?.PF2E?.creatureTraits;
  if (traits && !("minibot" in traits)) traits.minibot = "PF2E.TraitMinibot";
}
