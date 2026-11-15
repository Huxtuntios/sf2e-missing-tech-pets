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
