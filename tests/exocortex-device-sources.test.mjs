import test from "node:test";
import assert from "node:assert/strict";
import {
  captureDeviceSnapshot,
  buildDeviceActionSources,
  buildDeviceActorSource,
  buildTurretWeaponSource,
} from "../scripts/exocortex-device-sources.mjs";

const ID = "sf2e-missing-tech-pets";
const MINE = "tech-pets-detonate-mine";
const INT = `@actor.flags.${ID}.device.snapshot.int`;
const feat = (slug, description = `<p>${slug} native description</p>`, actionType = "passive", actions = null) => ({
  type: "feat",
  name: slug,
  system: { slug, description: { value: description }, actionType: { value: actionType }, actions: { value: actions } },
});
function owner(level = 1, feats = [], int = 4) {
  return {
    level,
    type: "character",
    system: { abilities: { int: { mod: int } } },
    items: [{ type: "class", system: { slug: "mechanic" } }, feat("mine"), feat("turret"), ...feats.map((value) => typeof value === "string" ? feat(value) : value)],
    getStatistic: () => ({ dc: { value: 23 } }),
  };
}
const snapshot = (level = 1, feats = [], int = 4) => captureDeviceSnapshot(owner(level, feats, int));
const main = (sources) => sources.find((source) => source.system.slug === MINE);
const rules = (source, key) => source.system.rules.filter((rule) => rule.key === key);
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

for (let level = 1; level <= 20; level++) {
  test(`device snapshot and native hazard defenses at level ${level}`, () => {
    const s = snapshot(level);
    const rank = level >= 15 ? 3 : level >= 10 ? 2 : 1;
    assert.equal(s.level, level);
    assert.equal(s.mineDice, 2 + Math.floor((level - 1) / 2));
    assert.equal(s.mineRadius, level >= 15 ? 20 : level >= 10 ? 15 : 10);
    assert.equal(s.turretHP, 10 + 6 * level);
    assert.equal(s.turretHardness, level >= 15 ? 20 : level >= 10 ? 15 : level >= 5 ? 10 : 5);
    assert.equal(s.turretSave, level + rank * 2 + 4);
    const turret = buildDeviceActorSource("turret", s);
    assert.equal(turret.type, "hazard");
    assert.deepEqual(turret.system.attributes.ac, { value: 23 });
    assert.equal(turret.system.attributes.hp.max, 10 + 6 * level);
    assert.equal(turret.system.attributes.hp.value, 10 + 6 * level);
    assert.equal(turret.system.attributes.hardness, s.turretHardness);
    assert.equal(turret.system.saves.fortitude.value, s.turretSave);
    assert.equal(turret.system.saves.reflex.value, s.turretSave);
    assert.equal(turret.system.saves.will.value, null);
    assert.equal(turret.system.details.isComplex, false);
    assert.equal(turret.system.details.level.value, level);
    assert.equal(turret.system.attributes.hp.brokenThreshold, undefined);
    assert.deepEqual(turret.system.attributes.resistances, []);
  });
}

test("snapshot records only actual owned relevant feats and clones native values", () => {
  const native = feat("energy-expulsion", "<p>Original energy text</p>", "action", 1);
  const a = owner(20, [native, "unrelated", "damage-customizations", "critical-explosion"]);
  const s = captureDeviceSnapshot(a);
  assert.deepEqual(s.feats, ["critical-explosion", "damage-customizations", "energy-expulsion", "mine", "turret"]);
  assert.ok(!s.feats.includes("healing-mines"));
  assert.ok(!s.feats.includes("self-destruct"));
  assert.deepEqual(s.featSources.find((source) => source.slug === "energy-expulsion"), {
    slug: "energy-expulsion", name: "energy-expulsion", description: "<p>Original energy text</p>", actionType: "action", actions: 1,
  });
  native.system.description.value = "Changed";
  a.items[1].system.actionType.value = "reaction";
  s.featSources[0].description = "Snapshot edit";
  assert.equal(s.featSources.find((source) => source.slug === "energy-expulsion").description, "<p>Original energy text</p>");
  assert.equal(a.items.find((item) => item.system.slug === "critical-explosion").system.description.value, "<p>critical-explosion native description</p>");
});

test("snapshot has stable feat ordering and does not infer ownership from level or item names", () => {
  const a = owner(20, [feat("unrelated")]);
  a.items.push({ type: "action", name: "Healing Mines", system: { slug: "healing-mines" } });
  const before = structuredClone(a.items);
  const first = captureDeviceSnapshot(a);
  a.items.reverse();
  assert.deepEqual(captureDeviceSnapshot(a), first);
  assert.deepEqual(first.feats, ["mine", "turret"]);
  assert.equal(first.featSources.length, 2);
  assert.deepEqual(a.items.toReversed(), before);
});

test("PWOL is explicit, and unavailable class DC is never fabricated", () => {
  const a = owner(15);
  assert.equal(captureDeviceSnapshot(a, { withoutLevel: true }).turretSave, 10);
  assert.equal(captureDeviceSnapshot(a).turretSave, 25);
  a.getStatistic = () => null;
  const s = captureDeviceSnapshot(a);
  const turret = buildDeviceActorSource("turret", s, { hp: 0 });
  assert.equal(turret.system.attributes.ac.value, null);
  assert.equal(turret.system.attributes.hp.value, 0);
  assert.match(turret.system.details.description, /unavailable/i);
  const action = main(buildDeviceActionSources("mine", s));
  assert.doesNotMatch(action.system.description.value, /@Check\[reflex\|dc:0/);
  assert.match(action.system.description.value, /unavailable/i);
});

test("mine source has no invented defenses, no ownership grants or autonomous turns", () => {
  const s = snapshot(8);
  const source = buildDeviceActorSource("mine", s, { ownerActorId: "owner", mineId: "mine-1" });
  assert.equal(source.type, "hazard");
  assert.equal(source.system.traits.size.value, "sm");
  assert.equal(source.system.attributes.hp.max, 0);
  assert.equal(source.system.attributes.hp.value, 0);
  assert.equal(source.system.attributes.ac.value, null);
  assert.equal(source.system.attributes.hardness, 0);
  assert.deepEqual(source.system.saves, { fortitude: { value: null }, reflex: { value: null }, will: { value: null } });
  assert.match(source.system.details.disable, /23/);
  assert.equal(source.system.details.isComplex, false);
  assert.deepEqual(source.ownership, { default: 0 });
  assert.equal(source.prototypeToken.actorLink, false);
  assert.equal(buildDeviceActorSource("turret", s).prototypeToken.actorLink, true);
  assert.equal(source.prototypeToken.sight.enabled, false);
  assert.equal(source.prototypeToken.width, 1);
  assert.equal(source.prototypeToken.height, 1);
  assert.equal(source.prototypeToken.disposition, 1);
  assert.deepEqual(source.flags[ID].device, { kind: "mine", ownerActorId: "owner", mineId: "mine-1", snapshot: s, array: "laser" });
  assert.ok(source.items.every((item) => item.type === "action" && !item._id));
});

test("mine roll uses only its unique selector and Targeting Mine is opt-in with snapshot Int", () => {
  const source = main(buildDeviceActionSources("mine", snapshot(5)));
  assert.match(source.system.description.value, /@Damage\[4d6\[fire\]\|options:area-damage,area-effect\]/);
  assert.match(source.system.description.value, /@Check\[reflex\|dc:23\|basic/);
  assert.match(source.system.description.value, /@Template\[type:burst\|distance:10\]/);
  assert.equal((source.system.description.value.match(/@Damage\[/g) ?? []).length, 1);
  const toggle = rules(source, "RollOption").find((rule) => rule.option === "tech-pets:targeting-mine");
  assert.equal(toggle.toggleable, true);
  assert.equal(toggle.value, false);
  const modifier = rules(source, "FlatModifier")[0];
  assert.equal(modifier.selector, `${MINE}-inline-damage`);
  assert.equal(modifier.value, INT);
  assert.deepEqual(modifier.predicate, ["tech-pets:targeting-mine"]);
  assert.ok(source.system.rules.every((rule) => !JSON.stringify(rule).includes('"detonate-mine-inline-damage"')));
});

test("damage customization requires the owned native feature and never creates two base pools", () => {
  assert.equal(rules(main(buildDeviceActionSources("mine", snapshot(20))), "DamageAlteration").length, 0);
  assert.equal(rules(main(buildDeviceActionSources("mine", snapshot(4, ["damage-customizations"]))), "DamageAlteration").length, 0);
  const source = main(buildDeviceActionSources("mine", snapshot(5, ["damage-customizations"]), { damageType: "acid" }));
  assert.equal((source.system.description.value.match(/@Damage\[/g) ?? []).length, 1);
  assert.match(source.system.description.value, /4d6\[acid\]/);
  const selection = rules(source, "RollOption").find((rule) => rule.option === "tech-pets:mine-damage-type");
  assert.equal(selection.selection, "acid");
  assert.equal(selection.alwaysActive, true);
  assert.deepEqual(selection.suboptions.map((entry) => entry.value).sort(), ["acid", "bludgeoning", "cold", "electricity", "fire", "piercing", "slashing", "sonic"]);
  for (const rule of rules(source, "DamageAlteration")) {
    assert.deepEqual(rule.selectors, [`${MINE}-inline-damage`]);
    assert.equal(rule.mode, "override");
    assert.equal(rule.property, "damage-type");
    assert.deepEqual(rule.predicate, [`tech-pets:mine-damage-type:${rule.value}`]);
  }
  assert.throws(() => buildDeviceActionSources("mine", snapshot(20), { damageType: "acid" }));
  assert.throws(() => buildDeviceActionSources("mine", snapshot(5, ["damage-customizations"]), { damageType: "mental" }));
});

test("Critical Explosion note covers both save outcomes without automatically applying persistent damage", () => {
  const bare = main(buildDeviceActionSources("mine", snapshot(20)));
  assert.ok(!rules(bare, "Note").some((rule) => rule.title === "Critical Explosion"));
  for (const damageType of ["fire", "piercing"]) {
    const source = main(buildDeviceActionSources("mine", snapshot(8, ["critical-explosion"]), { damageType }));
    const note = rules(source, "Note").find((rule) => rule.title === "Critical Explosion");
    assert.equal(note.selector, `${MINE}-inline-damage`);
    assert.equal(note.outcome, undefined);
    assert.match(note.text, /failure.*1 persistent/i);
    assert.match(note.text, /critical failure.*4 persistent/i);
    assert.match(note.text, /bleed/i);
    assert.match(note.text, /same (damage )?type/i);
    assert.equal(rules(source, "DamageDice").length, 0);
  }
});

for (const [level, feats, formula] of [
  [2, ["healing-mines"], "2[healing]"],
  [8, ["healing-mines"], "9[healing]"],
  [12, ["healing-mines"], "11[healing]"],
  [8, ["healing-mines", "impressive-healing-mines"], "9[healing]"],
  [12, ["healing-mines", "impressive-healing-mines"], "(7d6 + 4)[healing]"],
]) {
  test(`healing mine at ${level} with ${feats.join(" + ")} uses ${formula}`, () => {
    const source = buildDeviceActionSources("mine", snapshot(level, feats)).find((item) => item.system.slug === "tech-pets-healing-mine");
    assert.ok(source);
    assert.ok(source.system.description.value.includes(`@Damage[${formula}|options:area-effect]`));
    assert.doesNotMatch(source.system.description.value, /@Check\[/);
    assert.equal(rules(source, "FlatModifier").length, 0);
  });
}

test("healing action is absent without owned Healing Mines, even with Impressive", () => {
  assert.ok(!buildDeviceActionSources("mine", snapshot(20, ["impressive-healing-mines"])).some((item) => item.system.slug === "tech-pets-healing-mine"));
});

test("maneuvering mods are mutually selected, notes do not pretend to move targets", () => {
  const source = main(buildDeviceActionSources("mine", snapshot(6, ["maneuvering-mines"])));
  const toggle = rules(source, "RollOption").find((rule) => rule.option === "tech-pets:maneuvering-mine");
  assert.equal(toggle.value, false);
  assert.deepEqual(toggle.suboptions.map((entry) => entry.value), ["big-bang", "black-hole"]);
  const notes = rules(source, "Note").filter((rule) => rule.predicate?.some((option) => option.startsWith("tech-pets:maneuvering-mine:")));
  assert.equal(notes.length, 2);
  assert.match(notes.find((note) => note.predicate.includes("tech-pets:maneuvering-mine:big-bang")).text, /5 feet.*10 feet.*prone/i);
  assert.match(notes.find((note) => note.predicate.includes("tech-pets:maneuvering-mine:black-hole")).text, /5 feet.*10 feet.*slowed 1/i);
  assert.ok(!rules(main(buildDeviceActionSources("mine", snapshot(20))), "RollOption").some((rule) => rule.option === "tech-pets:maneuvering-mine"));
});

test("Debilitating notes use the owner's Fort DC and the actual Foolproof threshold", () => {
  for (const foolproof of [false, true]) {
    const s = snapshot(16, ["debilitating-exocortex", ...(foolproof ? ["foolproof-debilitations"] : [])]);
    for (const source of [main(buildDeviceActionSources("mine", s)), buildTurretWeaponSource(s)]) {
      const toggle = rules(source, "RollOption").find((rule) => rule.option === "tech-pets:debilitating-exocortex");
      assert.equal(toggle.value, false);
      assert.deepEqual(toggle.suboptions.map((option) => option.value), ["dazzled", "deafened", "off-guard", "suppressed"]);
      const notes = rules(source, "Note").filter((rule) => rule.title === "Debilitating Exocortex");
      assert.equal(notes.length, 4);
      for (const note of notes) {
        assert.match(note.text, /@Check\[fortitude\|dc:23/);
        assert.match(note.text, /end of (?:the target's|their) next turn/);
        assert.match(note.text, foolproof ? /only.*critical success/i : /failure or critical failure/i);
        assert.ok(note.predicate.some((option) => option.startsWith("tech-pets:debilitating-exocortex:")));
      }
    }
  }
});

for (const [level, dice] of [[4, 2], [8, 3], [12, 4], [20, 6]]) {
  test(`Self-Destruct at ${level} rolls ${dice}d6 piercing AND fire`, () => {
    const source = buildDeviceActionSources("turret", snapshot(level, ["self-destruct"])).find((item) => item.system.slug === "tech-pets-self-destruct");
    assert.equal(source.system.actions.value, 2);
    assert.ok(source.system.description.value.includes(`@Damage[${dice}d6[piercing],${dice}d6[fire]|options:area-damage,area-effect]`));
    assert.match(source.system.description.value, /@Template\[type:emanation\|distance:15\]/);
    assert.match(source.system.description.value, /@Check\[reflex\|dc:23\|basic/);
    assert.ok(!source.system.rules.some((rule) => ["GrantItem", "ItemAlteration"].includes(rule.key)));
    assert.match(source.system.description.value, /manual/i);
  });
}

test("turret feat actions retain owned native text and cost, with no phantom actions", () => {
  const native = feat("energy-expulsion", "<p>Native energy burst. @Check[reflex|against:class|basic]</p>", "action", 1);
  const s = captureDeviceSnapshot(owner(20, [native, feat("auto-target", "<p>Native trigger text</p>", "reaction")]));
  const sources = buildDeviceActionSources("turret", s);
  const energy = sources.find((item) => item.system.slug === "tech-pets-energy-expulsion");
  assert.equal(energy.system.actions.value, 1);
  assert.match(energy.system.description.value, /Native energy burst/);
  assert.match(energy.system.description.value, /@Check\[reflex\|dc:23\|basic\]/);
  assert.equal(sources.find((item) => item.system.slug === "tech-pets-auto-target").system.actionType.value, "reaction");
  assert.ok(!sources.some((item) => item.system.slug === "tech-pets-self-destruct"));
  const attack = sources.find((item) => item.system.slug === "tech-pets-turret-strike");
  assert.match(attack.system.description.value, /owner.*weapon/i);
  assert.match(attack.system.description.value, /multiple attack penalty/i);
  assert.match(sources.find((item) => item.system.slug === "tech-pets-turret-operation").system.description.value, /10 minutes.*lesser cover.*standard cover.*broken/is);
});

for (const [array, damage, range, group, trait] of [
  ["chaingun", "piercing", 90, "projectile", "analog"],
  ["disintegrator", "acid", 60, "corrosive", "tech"],
  ["laser", "fire", 60, "laser", "tech"],
  ["thunderclap", "sonic", 60, "sonic", "tech"],
  ["volt", "electricity", 60, "shock", "tech"],
  ["zero", "cold", 60, "cryo", "tech"],
]) {
  test(`native turret weapon array ${array} has correct schema and opt-in Pinpoint`, () => {
    const weapon = buildTurretWeaponSource(snapshot(20), { array });
    assert.equal(weapon.type, "weapon");
    assert.equal(weapon.system.category, "martial");
    assert.equal(weapon.system.grade, "commercial");
    assert.equal(weapon.system.range, range);
    assert.equal(weapon.system.group, group);
    assert.ok(weapon.system.traits.value.includes(trait));
    assert.deepEqual(weapon.system.damage, { dice: 1, die: "d8", damageType: damage, modifier: 0 });
    assert.equal(weapon.system.expend, 0);
    assert.equal(weapon.system.ammo, null);
    assert.equal(weapon.system.reload.value, null);
    assert.equal(weapon.system.usage.value, "worn");
    assert.equal(weapon.system.equipped.carryType, "worn");
    assert.equal(weapon.system.equipped.handsHeld, 0);
    assert.equal(weapon.system.bulk.value, 0);
    assert.deepEqual(weapon.system.price.value, {});
    assert.deepEqual(weapon.system.runes, { potency: 0, striking: 0, property: [] });
    assert.equal(rules(weapon, "RollOption").find((rule) => rule.option === "tech-pets:pinpoint-shot").value, false);
    const modifier = rules(weapon, "FlatModifier")[0];
    assert.equal(modifier.selector, "{item|id}-damage");
    assert.equal(modifier.value, "@actor.system.abilities.int.mod");
    assert.deepEqual(modifier.predicate, ["tech-pets:pinpoint-shot"]);
    assert.ok(!weapon.system.rules.some((rule) => ["Strike", "GrantItem", "MAP"].includes(rule.key)));
  });
}

test("expanded arrays require actual Expansive Array ownership and explicit selection", () => {
  const s = snapshot(20, ["expansive-array"]);
  assert.equal(buildTurretWeaponSource(s).system.damage.damageType, "fire");
  for (const [array, group] of [["mental", "mental"], ["poison", "dart"], ["vitality", "laser"], ["void", "void"]]) {
    assert.throws(() => buildTurretWeaponSource(snapshot(20), { array }));
    const weapon = buildTurretWeaponSource(s, { array });
    assert.equal(weapon.system.damage.damageType, array);
    assert.equal(weapon.system.damage.dice, 2);
    assert.equal(weapon.system.group, group);
    assert.equal(weapon.system.range, 60);
    assert.equal(buildDeviceActorSource("turret", s, { array }).flags[ID].device.array, array);
  }
});

test("native optional action traits are preserved instead of inventing concentration", () => {
  const s = snapshot(16, [
    feat("tactical-team-up", "<p>Native teamwork</p>", "action", 1),
    feat("deploy-bunker", "<p>Native bunker</p>", "action", 1),
    feat("energy-expulsion", "<p>Native expulsion</p>", "action", 1),
    "self-destruct",
  ]);
  const sources = buildDeviceActionSources("turret", s);
  assert.deepEqual(sources.find((source) => source.system.slug === "tech-pets-tactical-team-up").system.traits.value, ["flourish", "mechanic"]);
  assert.deepEqual(sources.find((source) => source.system.slug === "tech-pets-deploy-bunker").system.traits.value, ["concentrate", "mechanic"]);
  assert.deepEqual(sources.find((source) => source.system.slug === "tech-pets-energy-expulsion").system.traits.value, ["mechanic"]);
  assert.deepEqual(sources.find((source) => source.system.slug === "tech-pets-self-destruct").system.traits.value, ["mechanic"]);
  assert.deepEqual(main(buildDeviceActionSources("mine", s)).system.traits.value, ["concentrate", "mechanic"]);
});

test("optional attack modes only add manually enabled contextual Notes", () => {
  const s = snapshot(16, [feat("activate-targeting-system", "<p>Ignore concealment manually.</p>", "action", 1), feat("auto-target", "<p>No MAP on this reaction.</p>", "reaction")]);
  const weapon = buildTurretWeaponSource(s);
  const notes = rules(weapon, "Note").filter((rule) => ["Activate Targeting System", "Auto Target"].includes(rule.title));
  assert.equal(notes.length, 2);
  for (const note of notes) {
    assert.equal(note.selector, "{item|id}-attack-roll");
    assert.equal(note.predicate.length, 1);
    const toggle = rules(weapon, "RollOption").find((rule) => rule.option === note.predicate[0]);
    assert.equal(toggle.value, false);
  }
});

test("all builders are deterministic, clone snapshot flags and never mutate frozen inputs", () => {
  const s = freeze(snapshot(16, ["healing-mines", "critical-explosion", "expansive-array", "debilitating-exocortex"]));
  const options = freeze({ ownerActorId: "owner", array: "mental", hp: 17 });
  const first = buildDeviceActorSource("turret", s, options);
  assert.deepEqual(first, buildDeviceActorSource("turret", s, options));
  first.flags[ID].device.snapshot.feats.push("mutated");
  first.flags[ID].device.snapshot.featSources[0].description = "mutated";
  assert.ok(!s.feats.includes("mutated"));
  assert.notEqual(s.featSources[0].description, "mutated");
  assert.deepEqual(buildTurretWeaponSource(s), buildTurretWeaponSource(s));
  assert.deepEqual(buildDeviceActionSources("mine", s), buildDeviceActionSources("mine", s));
});

test("invalid external kinds and arrays throw instead of silently falling back", () => {
  const s = snapshot();
  for (const kind of ["npc", "drone", "", "__proto__", null]) {
    assert.throws(() => buildDeviceActorSource(kind, s));
    assert.throws(() => buildDeviceActionSources(kind, s));
  }
  for (const array of ["not-an-array", "__proto__", "constructor", "", null, ["laser"], { toString: () => "laser" }]) {
    assert.throws(() => buildTurretWeaponSource(s, { array }));
    assert.throws(() => buildDeviceActorSource("turret", s, { array }));
  }
});
