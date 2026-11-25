import { mechanicStats, TURRET_ARRAYS } from "./exocortex-rules.mjs";
import { MODULE_ID } from "./item-sources.mjs";

const publication = { title: "Starfinder Tech Core", authors: "", license: "ORC", remaster: true };
const icon = "icons/svg/target.svg";
const defaultMineSlug = "tech-pets-detonate-mine";
const snapshotInt = `@actor.flags.${MODULE_ID}.device.snapshot.int`;
const energyTypes = ["acid", "cold", "electricity", "fire", "sonic"];
const physicalTypes = ["bludgeoning", "piercing", "slashing"];
const expandedArrays = {
  mental: { damage: "mental", dice: 2, range: 60, trait: "tech", group: "mental" },
  poison: { damage: "poison", dice: 2, range: 60, trait: "tech", group: "dart" },
  vitality: { damage: "vitality", dice: 2, range: 60, trait: "tech", group: "laser" },
  void: { damage: "void", dice: 2, range: 60, trait: "tech", group: "void" },
};
const mineFeats = [
  "mine", "critical-explosion", "healing-mines", "impressive-healing-mines",
  "maneuvering-mines", "proximity-alert-mines", "double-detonation",
  "double-deployment", "redeploy-munitions", "shaped-blast", "apocalyptic-explosions",
];
const turretFeats = [
  "turret", "expansive-array", "shielded-turret", "area-denial-turret",
  "self-destruct", "energy-expulsion", "auto-target", "activate-targeting-system",
  "coordinated-fire-mechanic", "tactical-team-up", "deploy-bunker",
];
const sharedFeats = [
  "exocortex", "modify", "mobile-exocortex", "remote-mods", "enduring-mods",
  "manifold-mods", "instant-mods", "damage-customizations", "debilitating-exocortex",
  "foolproof-debilitations", "instant-deployment", "mobile-deployment",
  "parallel-deployment", "automated-exocortex", "multitasker", "hunker-down-mechanic",
  "deploy-motion-dampener",
];
const relevantFeats = new Set([...mineFeats, ...turretFeats, ...sharedFeats]);
const has = (snapshot, slug) => snapshot.feats.includes(slug);
const title = (slug) => slug.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const manualHint = "<p>@Localize[SFMTP.ManualActionHint]</p>";

export function captureDeviceSnapshot(owner, { withoutLevel = false } = {}) {
  const featSources = Array.from(owner.items ?? [])
    .filter((item) => item.type === "feat" && relevantFeats.has(item.system?.slug))
    .map((item) => ({
      slug: item.system.slug,
      name: item.name ?? title(item.system.slug),
      description: item.system.description?.value ?? "",
      actionType: item.system.actionType?.value ?? "passive",
      actions: item.system.actions?.value ?? null,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.name.localeCompare(b.name) || a.description.localeCompare(b.description));
  return structuredClone({
    ...mechanicStats(owner, { withoutLevel }),
    feats: [...new Set(featSources.map((source) => source.slug))].sort(),
    featSources,
  });
}

function assertKind(kind) {
  if (!["mine", "turret"].includes(kind)) throw new Error(`Invalid device kind: ${kind}`);
}
function getArray(snapshot, array) {
  if (typeof array !== "string") throw new Error("Invalid turret array");
  if (Object.hasOwn(TURRET_ARRAYS, array)) return TURRET_ARRAYS[array];
  if (Object.hasOwn(expandedArrays, array) && has(snapshot, "expansive-array")) return expandedArrays[array];
  throw new Error(`Invalid or unavailable turret array: ${array}`);
}
function saveCheck(snapshot, save, { basic = false } = {}) {
  return snapshot.classDC === null
    ? "class DC unavailable; resolve the saving throw manually"
    : `@Check[${save}|dc:${snapshot.classDC}${basic ? "|basic" : ""}|options:area-effect|immutable]`;
}
function actionSource(kind, slug, name, description, { actionType = "action", actions = 1, rules = [], traits = ["mechanic"] } = {}) {
  return {
    name, type: "action", img: icon, effects: [], ownership: { default: 0 },
    system: {
      slug, description: { value: description + manualHint, gm: "" },
      actionType: { value: actionType }, actions: { value: actions },
      category: "offensive", frequency: null, publication: { ...publication },
      traits: { rarity: "common", value: [...traits], otherTags: [] },
      rules: structuredClone(rules),
    },
    flags: { [MODULE_ID]: { moduleProvided: true, deviceAction: true, deviceKey: slug, kind } },
  };
}
function toggle(option, label, suboptions) {
  return {
    key: "RollOption", domain: "all", option, label, toggleable: true, value: false,
    ...(suboptions ? { suboptions: suboptions.map((value) => ({ label: title(value), value })) } : {}),
  };
}
function note(selector, label, text, predicate = []) {
  return { key: "Note", selector, title: label, text, predicate };
}
function debilitatingRules(snapshot, selector) {
  if (!has(snapshot, "debilitating-exocortex")) return [];
  const conditions = ["dazzled", "deafened", "off-guard", "suppressed"];
  const threshold = has(snapshot, "foolproof-debilitations")
    ? "Enemy targets avoid the condition only on a critical success; other targets receive it only on a failure or critical failure."
    : "On a failure or critical failure, apply the condition.";
  return [
    toggle("tech-pets:debilitating-exocortex", "Debilitating Exocortex", conditions),
    ...conditions.map((condition) => note(selector, "Debilitating Exocortex",
      `<p>Creatures damaged by this exocortex attempt a ${saveCheck(snapshot, "fortitude")} save. ${threshold} The chosen condition is ${condition}, until the end of their next turn. Apply it manually.</p>`,
      [`tech-pets:debilitating-exocortex:${condition}`])),
  ];
}
function adaptNativeDescription(description, snapshot) {
  return description
    .replaceAll("@actor.level", String(snapshot.level))
    .replace(/@Check\[([^\]]+)\]/g, (check, params) => {
      if (!/\bagainst:class(?:-spell)?\b/.test(params)) return check;
      if (snapshot.classDC === null) return "class DC unavailable; resolve the saving throw manually";
      return `@Check[${params.replace(/against:class(?:-spell)?\b/, `dc:${snapshot.classDC}`)}]`;
    });
}
function nativeActions(kind, snapshot, excluded = []) {
  const permitted = new Set([...(kind === "mine" ? mineFeats : turretFeats), ...sharedFeats]);
  const seen = new Set();
  return snapshot.featSources
    .filter((source) => permitted.has(source.slug) && !["mine", "turret", "exocortex", ...excluded].includes(source.slug))
    .filter(source => {
      if (seen.has(source.slug)) return false;
      seen.add(source.slug);
      return true;
    })
    .map((source) => actionSource(kind, `tech-pets-${source.slug}`, source.name,
      adaptNativeDescription(source.description, snapshot), {
        actionType: source.actionType, actions: source.actions,
        traits: source.slug === "tactical-team-up" ? ["flourish", "mechanic"]
          : source.slug === "deploy-bunker" ? ["concentrate", "mechanic"]
            : ["modify", "deploy-motion-dampener"].includes(source.slug) ? ["manipulate", "mechanic"]
              : source.slug === "impressive-healing-mines" ? ["healing", "mechanic"]
                : ["mechanic"],
      }));
}
export function getMineDamageTypes(snapshot) {
  return snapshot.level >= 5 && has(snapshot, "damage-customizations") ? [...energyTypes, ...physicalTypes] : ["fire", "piercing"];
}
function mineActions(snapshot, damageType, slug = defaultMineSlug) {
  const selector = `${slug}-inline-damage`;
  const damageTypes = getMineDamageTypes(snapshot);
  const custom = damageTypes.length > 2;
  if (!damageTypes.includes(damageType)) throw new Error(`Invalid or unavailable mine damage type: ${damageType}`);
  const rules = [
    toggle("tech-pets:targeting-mine", "Targeting Mine"),
    { key: "FlatModifier", selector, label: "Targeting Mine", value: snapshotInt, predicate: ["tech-pets:targeting-mine"] },
  ];
  if (custom) {
    rules.push({
      ...toggle("tech-pets:mine-damage-type", "Mine Damage Type", damageTypes),
      value: true, alwaysActive: true, selection: damageType,
    });
    rules.push(...damageTypes.map((type) => ({
      key: "DamageAlteration", selectors: [selector], mode: "override",
      property: "damage-type", value: type, predicate: [`tech-pets:mine-damage-type:${type}`],
    })));
  }
  if (has(snapshot, "critical-explosion")) {
    const types = custom ? damageTypes : [damageType];
    for (const type of types) {
      const persistent = physicalTypes.includes(type) ? "bleed" : type;
      rules.push(note(selector, "Critical Explosion",
        `<p><strong>Failure</strong> 1 persistent ${persistent} damage: @Damage[1[persistent,${persistent}]|immutable]. <strong>Critical failure</strong> ${snapshot.int} persistent ${persistent} damage: @Damage[${snapshot.int}[persistent,${persistent}]|immutable]. Physical damage causes bleed; otherwise use the same damage type dealt by the mine. Apply persistent damage to the target manually.</p>`,
        custom ? [`tech-pets:mine-damage-type:${type}`] : []));
    }
  }
  if (has(snapshot, "maneuvering-mines")) {
    rules.push(toggle("tech-pets:maneuvering-mine", "Maneuvering Mine", ["big-bang", "black-hole"]));
    rules.push(note(selector, "Big Bang",
      "<p>On a failed save, push the creature 5 feet directly away from the mine; on a critical failure, push it 10 feet and knock it prone. Resolve this forced movement manually.</p>",
      ["tech-pets:maneuvering-mine:big-bang"]));
    rules.push(note(selector, "Black Hole",
      "<p>On a failed save, pull the creature 5 feet toward the mine; on a critical failure, pull it 10 feet and make it slowed 1. Resolve this forced movement and condition manually.</p>",
      ["tech-pets:maneuvering-mine:black-hole"]));
  }
  rules.push(...debilitatingRules(snapshot, selector));
  const actions = [actionSource("mine", slug, "Detonate Mine",
    `<p><strong>Requirements</strong> The mine is deployed within 150 feet of its owner.</p><hr /><p>Detonate the mine in a @Template[type:burst|distance:${snapshot.mineRadius}], dealing @Damage[${snapshot.mineDice}d6[${damageType}]|options:area-damage,area-effect] damage with a ${saveCheck(snapshot, "reflex", { basic: true })} save.</p><p>This can also be used as a reaction when a creature enters or leaves a square in the mine's burst area; choose and resolve the trigger manually. Choose fire or piercing damage before rolling, or select a known damage customization. Only the displayed damage pool is rolled.</p>`, { rules, traits: ["concentrate", "mechanic"] })];
  if (has(snapshot, "healing-mines")) {
    const impressive = snapshot.level >= 12 && has(snapshot, "impressive-healing-mines");
    const formula = impressive
      ? `(${snapshot.mineDice}d6 + ${snapshot.int})[healing]`
      : `${snapshot.mineDice + (snapshot.level >= 8 ? snapshot.int : 0)}[healing]`;
    actions.push(actionSource("mine", "tech-pets-healing-mine", "Healing Mine",
      `<p><strong>Requirements</strong> The Healing Mines mod is active.</p><hr /><p>Instead of dealing damage, the mine restores @Damage[${formula}|options:area-effect] Hit Points to creatures in its @Template[type:burst|distance:${snapshot.mineRadius}]. No saving throw is attempted. Resolve targets and any High-Tech Medic mods manually.</p>`, { traits: ["concentrate", "healing", "mechanic"] }));
  }
  actions.push(actionSource("mine", "tech-pets-mine-operation", "Mine Operation",
    `<p>Disable DC: ${snapshot.classDC ?? "unavailable"}. Smart Mine excludes ${snapshot.smartTargets} selected target${snapshot.smartTargets === 1 ? "" : "s"} within 60 feet when that mod is active; choose exclusions manually. Collect all deployed, undetonated mines as a single action. Proximity Alert Mines, if owned and selected at deployment, must be triggered manually; no automatic detection or detonation is performed.</p>`,
    { actionType: "passive", actions: null }));
  return [...actions, ...nativeActions("mine", snapshot)];
}
function turretActions(snapshot) {
  const shielded = has(snapshot, "shielded-turret");
  const actions = [
    actionSource("turret", "tech-pets-turret-strike", "Fire Turret",
      "<p><strong>Requirements</strong> The turret is deployed, not broken, and within 150 feet of its owner.</p><hr /><p>Use the owner's native turret weapon to make a ranged Strike originating from the turret's location. Use the owner's attack modifier and current multiple attack penalty; choose the correct MAP button manually. Its targeting sensors include darkvision and do not rely on the owner's vision. This device has no independent Strike or combat turn.</p>"),
    actionSource("turret", "tech-pets-turret-operation", "Turret Operation",
      `<p>Spend 10 minutes adjusting the turret with the custom rig to change its selected array, or use the Shift Array mod. It occupies one 5-foot square, hovers in place, and provides ${shielded ? "standard cover; Taking Cover behind it provides greater cover" : "lesser cover; Taking Cover behind it provides standard cover"}. Its native Broken Threshold is half its maximum Hit Points, rounded down. A broken turret cannot Strike. Repair it during daily preparations; while stored it regains 5 Hit Points at the end of each of the owner's turns. At 0 Hit Points it collapses and returns to the custom rig rather than being destroyed. Resolve repair and return through the owner's controls, not this reminder.</p>`,
      { actionType: "passive", actions: null, rules: buildTurretWeaponSource(snapshot).system.rules }),
  ];
  if (has(snapshot, "self-destruct")) {
    const dice = 2 + Math.floor((snapshot.level - 4) / 4);
    actions.push(actionSource("turret", "tech-pets-self-destruct", "Self-Destruct",
      `<p><strong>Requirements</strong> Your turret is deployed and within 150 feet.</p><hr /><p>Overload the turret to deal @Damage[${dice}d6[piercing],${dice}d6[fire]|options:area-damage,area-effect] damage to all creatures in a @Template[type:emanation|distance:15], with a ${saveCheck(snapshot, "reflex", { basic: true })} save. After resolving the explosion, manually reduce the turret to 0 Hit Points and recall it to the custom rig. This action does not delete the turret or its token.</p>`, { actions: 2 }));
  }
  return [...actions, ...nativeActions("turret", snapshot, ["self-destruct"])];
}

export function buildDeviceActionSources(kind, snapshot, { damageType = "fire", mineSlug = defaultMineSlug } = {}) {
  assertKind(kind);
  return kind === "mine" ? mineActions(snapshot, damageType, mineSlug) : turretActions(snapshot);
}

export function buildDeviceActorSource(kind, snapshot, { ownerActorId = "", mineId = "", array = "laser", hp } = {}) {
  assertKind(kind);
  if (kind === "turret") getArray(snapshot, array);
  const turret = kind === "turret";
  const max = turret ? snapshot.turretHP : 0;
  const description = turret
    ? `<p>A remotely controlled turret, not an autonomous creature. AC equals the owner's mechanic class DC (${snapshot.classDC ?? "unavailable"}). Use the owner's turret weapon for attacks; darkvision is provided by its targeting sensors. Its native hardness and Broken Threshold apply to damage.</p>`
    : `<p>A deployed mine controlled by its owner. Disable DC: ${snapshot.classDC ?? "unavailable"}. No defenses beyond those specified by the native mine feature are assigned.</p>`;
  return {
    name: turret ? "Exocortex Turret" : "Exocortex Mine",
    type: "hazard", img: icon, effects: [], items: buildDeviceActionSources(kind, snapshot),
    ownership: { default: 0 },
    system: {
      attributes: {
        ac: { value: turret ? snapshot.classDC : null },
        hp: { max, value: turret ? hp ?? max : 0, temp: 0, details: "" },
        hardness: turret ? snapshot.turretHardness : 0,
        stealth: { value: null, details: "" },
        immunities: [], weaknesses: [], resistances: [], emitsSound: false,
      },
      details: {
        description, level: { value: snapshot.level }, isComplex: false,
        disable: turret ? "" : `Disable DC: ${snapshot.classDC ?? "unavailable"}`,
        routine: "", reset: "", publication: { ...publication },
      },
      saves: {
        fortitude: { value: turret ? snapshot.turretSave : null },
        reflex: { value: turret ? snapshot.turretSave : null }, will: { value: null },
      },
      traits: { rarity: "common", size: { value: turret ? "med" : "sm" }, value: [] },
    },
    flags: { [MODULE_ID]: { device: { kind, ownerActorId, mineId, snapshot: structuredClone(snapshot), array } } },
    prototypeToken: {
      name: turret ? "Exocortex Turret" : "Exocortex Mine", actorLink: turret,
      width: 1, height: 1, texture: { src: icon }, disposition: 1,
      sight: { enabled: false },
    },
  };
}

export function buildTurretWeaponSource(snapshot, { array = "laser" } = {}) {
  const config = getArray(snapshot, array);
  const rules = [
    toggle("tech-pets:pinpoint-shot", "Pinpoint Shot"),
    { key: "FlatModifier", selector: "{item|id}-damage", label: "Pinpoint Shot", value: "@actor.system.abilities.int.mod", predicate: ["tech-pets:pinpoint-shot"] },
    ...debilitatingRules(snapshot, "{item|id}-damage"),
  ];
  for (const slug of ["activate-targeting-system", "auto-target", "coordinated-fire-mechanic", "tactical-team-up", "area-denial-turret", "energy-expulsion"]) {
    if (!has(snapshot, slug)) continue;
    const label = title(slug);
    const native = snapshot.featSources.find((source) => source.slug === slug);
    if (!native) continue;
    rules.push(toggle(`tech-pets:${slug}`, label));
    rules.push(note("{item|id}-attack-roll", label,
      adaptNativeDescription(native.description, snapshot) + "<p>Resolve this mode manually and turn off its toggle after use.</p>", [`tech-pets:${slug}`]));
  }
  return {
    name: `Turret Weapon (${title(array)})`, type: "weapon", img: icon, effects: [], ownership: { default: 0 },
    system: {
      slug: "tech-pets-turret-weapon", description: { value: "<p>Native weapon proxy for the owner's turret. Roll from the turret's location, using the owner's proficiency and current multiple attack penalty. No ammunition is required. Upgrade the grade and install upgrades manually on the custom rig; this source grants none.</p>" + manualHint, gm: "" },
      category: "martial", group: config.group, baseItem: null, grade: "commercial",
      damage: { dice: config.dice ?? 1, die: "d8", damageType: config.damage, modifier: 0 },
      bonus: { value: 0 }, splashDamage: { value: 0 }, range: config.range,
      // A non-null reload makes native preparation require ammunition and expend at least 1.
      reload: { value: null }, expend: 0, ammo: null, selectedAmmoId: null,
      usage: { value: "worn" }, equipped: { carryType: "worn", handsHeld: 0, inSlot: false },
      bulk: { value: 0 }, price: { value: {} }, quantity: 1, level: { value: snapshot.level },
      hardness: 0, hp: { max: 0, value: 0 }, containerId: null, size: "med",
      material: { type: null, grade: null }, runes: { potency: 0, striking: 0, property: [] },
      traits: { rarity: "common", value: [config.trait], otherTags: [] },
      publication: { ...publication }, rules,
    },
    flags: { [MODULE_ID]: { moduleProvided: true, turretWeapon: true, array } },
  };
}
