// Проверенные источники SF2e: владение чертой не подменяем классом или совпадением имени.
export const SOURCE_FLAG = "sf2e-missing-tech-pets";
export const GRADES = ["commercial", "tactical", "advanced", "superior"];
const rules = "https://2e.aonsrd.com/rules/1311-companions";
const techno = "https://2e.aonsrd.com/classes/8-technomancer";
const mechanic = "https://2e.aonsrd.com/classes/7-mechanic/exocortex";
const source = (slug, id, kind, extra = {}) => ({
  slug,
  kind,
  type: "feat",
  trait: "mechanic",
  url: mechanic,
  uuid: id ? `Compendium.sf2e.feats.Item.${id}` : null,
  ...extra,
});
export const COMPANION_SOURCES = [
  source("familiar", "Lxp9qwru0FVWmoE7", "familiar", {
    trait: "technomancer",
    url: techno,
    allowance: 2,
  }),
  source("enhanced-familiar", "RyTau718PpsZplK8", "familiarUpgrade", {
    trait: "technomancer",
    url: techno,
    allowance: 4,
  }),
  source("incredible-familiar", "SzG4u0KXnQBFQsra", "familiarUpgrade", {
    trait: "technomancer",
    url: techno,
    allowance: 6,
  }),
  source("pet", null, "pet", {
    trait: "general",
    url: "https://2e.aonsrd.com/feats/2692-pet",
  }),
  source("drone", null, "robot", {
    uuid: "Compendium.sf2e.class-features.Item.UCilslXlrd7ihsgY",
  }),
  source("tactical-drone", "MR7HChNvESbbCRQS", "droneUpgrade", {
    grade: "tactical",
  }),
  source("advanced-drone", "AtFbqTGqXKGLhFki", "droneUpgrade", {
    grade: "advanced",
  }),
  source("superior-drone", "RSrfmzN2iO3pJ1EI", "droneUpgrade", {
    grade: "superior",
  }),
  source("commercial-customization", "M4zxIqUevFPOepd2", "customization", {
    grade: "commercial",
    repeat: 3,
  }),
  source("tactical-customization", "QmXQb52CrxLdnnDd", "customization", {
    grade: "tactical",
    repeat: 3,
  }),
  source("advanced-customization", "goQ3sUgedWI9BeLo", "customization", {
    grade: "advanced",
    repeat: 3,
  }),
  source("superior-customization", "97BcEtnPdUk2HzXS", "customization", {
    grade: "superior",
    repeat: 3,
  }),
  source("devoted-pet-owner", "Gs7y92CMsQNVcdtK", "care", {
    trait: "general",
    url: rules,
  }),
];
export function matchesCompanionSource(item, entry) {
  if (item?.type !== entry.type) return false;
  const origin =
    item.flags?.core?.sourceId || item._stats?.compendiumSource || "";
  // Даже совпавший slug из PF2e или PF2e-пака зависимости не является SF2e-источником.
  if (origin && entry.uuid && origin === entry.uuid) return true;
  if (
    origin &&
    !origin.startsWith("Compendium.sf2e.") &&
    !origin.startsWith("Compendium.pf2e-animal-companions.sf-AC-")
  )
    return false;
  const system = item.system ?? {};
  if ((system.slug ?? system.identifier) !== entry.slug) return false;
  return (
    (system.traits?.value ?? []).includes(entry.trait) ||
    /Starfinder/i.test(system.publication?.title ?? "")
  );
}
export function ownedCompanionSources(actor) {
  return COMPANION_SOURCES.flatMap((entry) => {
    const matches = Array.from(actor?.items ?? []).filter((item) =>
      matchesCompanionSource(item, entry),
    );
    return matches.length ? [{ ...entry, items: matches }] : [];
  });
}
export function sourceFamiliarAllowance(actor) {
  return Math.max(
    2,
    ...ownedCompanionSources(actor).map((entry) => entry.allowance ?? 0),
  );
}
export function sourceCustomizationSlots(actor, configuredRules = {}) {
  const owned = ownedCompanionSources(actor);
  const result = Object.fromEntries(GRADES.map((grade) => [grade, 0]));
  const counts = actor?.getFlag?.(SOURCE_FLAG, "sourceCounts") ?? {};
  const drone = owned.some((entry) => entry.kind === "robot");
  if (!drone) return { slots: result, grade: "commercial" };
  let grade = "commercial";
  for (const entry of owned) {
    if (entry.kind === "droneUpgrade") {
      // Один слот от ступени и один от самой черты; повтор Superior Drone не даёт ещё слотов.
      result[entry.grade] += 2;
      if (GRADES.indexOf(entry.grade) > GRADES.indexOf(grade))
        grade = entry.grade;
    }
    if (entry.kind === "customization") {
      // Явное старое правило/флаг сохраняет приоритет, не начисляем второй раз.
      if (
        Number(configuredRules[entry.slug]) > 0 ||
        entry.items.some(
          (item) =>
            Number(
              item.flags?.[SOURCE_FLAG]?.modificationSlots ??
                item.getFlag?.(SOURCE_FLAG, "modificationSlots"),
            ) > 0,
        )
      )
        continue;
      const selected = Number(counts[entry.slug]);
      result[entry.grade] +=
        Number.isInteger(selected) && selected >= 1 && selected <= entry.repeat
          ? selected
          : 1;
    }
  }
  return { slots: result, grade };
}
export function sourceWarnings(actor) {
  const owned = ownedCompanionSources(actor);
  const warnings = [];
  const has = (slug) => owned.some((entry) => entry.slug === slug);
  if (has("pet") && has("familiar")) warnings.push("SourcePetConflict");
  if (has("enhanced-familiar") && !has("familiar"))
    warnings.push("SourceMissingFamiliar");
  if (has("incredible-familiar") && !has("enhanced-familiar"))
    warnings.push("SourceMissingEnhanced");
  if (
    owned.some((entry) =>
      ["droneUpgrade", "customization"].includes(entry.kind),
    ) &&
    !has("drone")
  )
    warnings.push("SourceMissingDrone");
  return warnings;
}
