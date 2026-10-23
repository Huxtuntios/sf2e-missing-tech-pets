// Сверено с Tech Core/AON и исходными Items SF2e 1.6.0. Чистые расчёты без записи в актёров.
export const EXOCORTEX_SOURCE =
  "https://2e.aonsrd.com/classes/7-mechanic/exocortex";
export const MECHANIC_SOURCE = "https://2e.aonsrd.com/classes/7-mechanic";
export const NATIVE_EXOCORTEX = {
  exocortex: "Compendium.sf2e.class-features.Item.23Km290iJ9SNG7w1",
  drone: "Compendium.sf2e.class-features.Item.UCilslXlrd7ihsgY",
  mine: "Compendium.sf2e.class-features.Item.peXRQKUzkAGqduHP",
  turret: "Compendium.sf2e.class-features.Item.V7LMvEnxI7hN1n8Z",
  modify: "Compendium.sf2e.actions.Item.uVDYsnxq3hNNtYB2",
  deployMine: "Compendium.sf2e.actions.Item.ljJlGPTH8ZNH6DZj",
  detonateMine: "Compendium.sf2e.actions.Item.x1XORr76jCEEDJJV",
  deployTurret: "Compendium.sf2e.actions.Item.i2EksIx4It5FW2NM",
  reposition: "Compendium.sf2e.actions.Item.36WO6WJzTz2Qsm16",
  synchronized: "Compendium.sf2e.actions.Item.CZ3o2xTAZ4hlISya",
};
export const TURRET_ARRAYS = {
  chaingun: {
    damage: "piercing",
    range: 90,
    trait: "analog",
    group: "projectile",
  },
  disintegrator: {
    damage: "acid",
    range: 60,
    trait: "tech",
    group: "corrosive",
  },
  laser: { damage: "fire", range: 60, trait: "tech", group: "laser" },
  thunderclap: { damage: "sonic", range: 60, trait: "tech", group: "sonic" },
  volt: { damage: "electricity", range: 60, trait: "tech", group: "shock" },
  zero: { damage: "cold", range: 60, trait: "tech", group: "cryo" },
};
export const itemSource = (item) =>
  item.flags?.core?.sourceId ??
  item._stats?.compendiumSource ??
  item.toObject?.()._stats?.compendiumSource ??
  "";
const items = (actor) => Array.from(actor?.items ?? []);
const slug = (item) => item.system?.slug;
const has = (actor, value) =>
  items(actor).some(
    (item) => ["feat", "class"].includes(item.type) && slug(item) === value,
  );
export function isMechanic(actor) {
  return (
    actor?.type === "character" &&
    (items(actor).some(
      (item) => item.type === "class" && slug(item) === "mechanic",
    ) ||
      has(actor, "mechanic-dedication") ||
      items(actor).some(
        (item) => itemSource(item) === NATIVE_EXOCORTEX.exocortex,
      ))
  );
}
export function exocortexVariants(actor) {
  return ["drone", "mine", "turret"].filter((variant) =>
    items(actor).some(
      (item) =>
        item.type === "feat" &&
        (itemSource(item) === NATIVE_EXOCORTEX[variant] ||
          (slug(item) === variant &&
            item.system?.traits?.otherTags?.includes("mechanic-exocortex"))),
    ),
  );
}
export function mechanicStats(actor, { withoutLevel = false } = {}) {
  const level = Math.max(
    1,
    Math.min(
      20,
      Math.floor(
        Number(actor.level ?? actor.system?.details?.level?.value) || 1,
      ),
    ),
  );
  const int = Number(actor.system?.abilities?.int?.mod) || 0;
  const mainClass = items(actor).some(
    (item) => item.type === "class" && slug(item) === "mechanic",
  );
  const canModify = mainClass || has(actor, "modify");
  const remote = (mainClass && level >= 9) || has(actor, "remote-mods");
  const dc = Number(
    actor.getStatistic?.("mechanic")?.dc?.value ??
      actor.classDCs?.mechanic?.dc?.value ??
      actor.system?.proficiencies?.classDCs?.mechanic?.value,
  );
  const rank = level >= 15 ? 3 : level >= 10 ? 2 : 1;
  return {
    level,
    int,
    mainClass,
    canModify,
    classDC: Number.isFinite(dc) ? dc : null,
    variants: exocortexVariants(actor),
    mobile: (mainClass && level >= 3) || has(actor, "mobile-exocortex"),
    modifyRange: !canModify
      ? null
      : remote
        ? mainClass && level >= 15
          ? 150
          : 60
        : null,
    modsPerAction:
      (mainClass && level >= 15) || has(actor, "manifold-mods") ? 2 : 1,
    enduring: (mainClass && level >= 13) || has(actor, "enduring-mods"),
    instant: (mainClass && level >= 19) || has(actor, "instant-mods"),
    mineCapacity: Math.max(0, 4 + int + 2 * Math.floor(level / 5)),
    mineDice: 2 + Math.floor((level - 1) / 2),
    mineRadius: level >= 15 ? 20 : level >= 10 ? 15 : 10,
    smartTargets: level >= 10 ? 6 : level >= 5 ? 3 : 1,
    repositionDistance:
      30 + (level >= 10 ? (1 + Math.floor((level - 10) / 5)) * 10 : 0),
    turretHP: Math.max(0, 10 + level * (2 + int)),
    turretHardness: level >= 15 ? 20 : level >= 10 ? 15 : level >= 5 ? 10 : 5,
    turretSaveRank: rank,
    turretSave: (withoutLevel ? 0 : level) + rank * 2 + int,
    desperateRepairHP: Math.max(0, level + int),
    droneCriticalSpecialization: mainClass && level >= 5,
  };
}
export function eligibleExocortexActions(actor) {
  const stats = mechanicStats(actor),
    result = [];
  if (stats.canModify && stats.variants.length) result.push("modify");
  if (stats.variants.includes("mine"))
    result.push("deployMine", "detonateMine");
  if (stats.variants.includes("turret")) result.push("deployTurret");
  if (stats.mobile && stats.variants.includes("drone"))
    result.push("synchronized");
  if (stats.mobile && stats.variants.some((variant) => variant !== "drone"))
    result.push("reposition");
  return result;
}
// Ограниченные слоты оплачивают только записи каталога своей ступени; ручные записи — общими слотами.
export function customizationCapacity(
  modifications,
  generalSlots,
  commercialSlots = 0,
  gradedSlots = {},
) {
  let remainingGeneral = Math.max(0, Number(generalSlots) || 0);
  const remainingByGrade = Object.fromEntries(
    ["commercial", "tactical", "advanced", "superior"].map((grade) => [
      grade,
      Math.max(0, Number(gradedSlots[grade]) || 0) +
        (grade === "commercial"
          ? Math.max(0, Number(commercialSlots) || 0)
          : 0),
    ]),
  );
  const accepted = [],
    rejected = [];
  for (const entry of modifications) {
    const cost = Math.max(1, Number(entry.cost) || 1);
    const restricted =
      !entry.manual && !!entry.catalogId
        ? Math.min(cost, remainingByGrade[entry.grade] ?? 0)
        : 0;
    if (cost - restricted > remainingGeneral) {
      rejected.push(entry);
      continue;
    }
    if (restricted) remainingByGrade[entry.grade] -= restricted;
    remainingGeneral -= cost - restricted;
    accepted.push(entry);
  }
  return {
    accepted,
    rejected,
    remainingGeneral,
    remainingCommercial: remainingByGrade.commercial,
    remainingByGrade,
    free:
      remainingGeneral +
      Object.values(remainingByGrade).reduce((sum, value) => sum + value, 0),
  };
}
