// Присутствие ожидаемых Rule Elements в исходных данных и фабриках (обе системы).
// Выполнение RE в Foundry здесь не имитируется — только структура и адаптация.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildFamiliarSource } from "../scripts/familiar-sources.mjs";
import { buildCustomizationSource } from "../scripts/customization-sources.mjs";
import { buildEffectSource } from "../scripts/effect-sources.mjs";
import { buildMinibotEquipmentSource, buildMinibotActionSource } from "../scripts/minibot-sources.mjs";
import { choiceVariants, preserveRuleChoices } from "../scripts/choice-variants.mjs";
import { choicePredicatePasses, validChoicesFor } from "../scripts/familiars.mjs";

globalThis.foundry = { utils: { deepClone: structuredClone } };

const json = async (file) =>
  JSON.parse(await readFile(new URL("../" + file, import.meta.url), "utf8"));
const familiars = await json("data/familiar-abilities.json");
const customizations = await json("data/robot-customizations.json");
const minibots = await json("data/minibots.json");
const effects = await json("data/item-effects.json");
const familiar = (id, system = "sf2e") =>
  buildFamiliarSource(familiars.entries.find((e) => e.id === id), system);
const customization = (id, system = "sf2e") =>
  buildCustomizationSource(customizations.entries.find((e) => e.id === id), system);
const keys = (source) => source.system.rules.map((r) => r.key);

test("Фамильяры: шесть новых пассивных способностей используют нативные RE", () => {
  assert.deepEqual(keys(familiar("amphibious")), ["BaseSpeed", "BaseSpeed", "ActorTraits"]);
  assert.deepEqual(familiar("amphibious").system.rules[2].add, ["amphibious"]);
  // Обе скорости выводятся из большей (land/swim), а не фиксированных 25:
  // комбинация с Fast Movement должна поднимать обе до 40. land читаем только
  // при наличии swim (иначе null), swim всегда читаем из land (не null).
  const amph = familiar("amphibious").system.rules;
  assert.equal(amph[0].value, "max(25, @actor.system.movement.speeds.swim.value)");
  assert.deepEqual(amph[0].predicate, ["speed:swim"]);
  assert.equal(amph[1].value, "max(25, @actor.system.movement.speeds.land.value)");

  assert.deepEqual(keys(familiar("damage-avoidance")), ["ChoiceSet", "Note"]);
  assert.deepEqual(familiar("damage-avoidance").system.rules[0].choices.map((c) => c.value), ["fortitude", "reflex", "will"]);
  assert.deepEqual(familiar("damage-avoidance").system.rules[1].outcome, ["success", "criticalSuccess"]);

  assert.deepEqual(keys(familiar("elemental")), ["ChoiceSet", "ActorTraits", "Immunity"]);
  assert.deepEqual(familiar("elemental").system.rules[2].type, ["bleed", "paralyzed", "poison", "sleep", "{item|flags.sf2e.rulesSelections.element}"]);

  assert.deepEqual(keys(familiar("fast-movement")), ["ChoiceSet", "BaseSpeed"]);
  assert.equal(familiar("fast-movement").system.rules[1].value, 40);

  assert.deepEqual(keys(familiar("resistance")), ["ChoiceSet", "ChoiceSet", "Resistance", "Resistance"]);
  const [one, two] = familiar("resistance").system.rules;
  assert.equal(one.rollOption, "resistance");
  assert.equal(two.rollOption, "resistance");
  assert.ok(two.choices.every((c) => c.predicate?.[0]?.not?.startsWith("resistance:")));
  assert.equal(familiar("resistance").system.rules[2].value, "max(1, floor(@actor.level / 2))");

  assert.deepEqual(keys(familiar("skilled")), ["ChoiceSet", "FlatModifier"]);
  assert.equal(familiar("skilled").system.rules[1].value, "@actor.masterAttributeModifier");
});

test("Фамильяры: PF2e убирает computers/piloting и переключает namespace флагов", () => {
  const sf = familiar("skilled", "sf2e").system.rules[0].choices.map((c) => c.value);
  const pf = familiar("skilled", "pf2e").system.rules[0].choices.map((c) => c.value);
  assert.ok(sf.includes("computers") && sf.includes("piloting"));
  assert.ok(!pf.includes("computers") && !pf.includes("piloting"));
  assert.equal(sf.length - pf.length, 2);
  assert.equal(familiar("skilled", "pf2e").system.rules[1].selector, "{item|flags.pf2e.rulesSelections.skill}");
  assert.equal(familiar("elemental", "pf2e").system.rules[2].type.at(-1), "{item|flags.pf2e.rulesSelections.element}");
  assert.doesNotMatch(JSON.stringify(familiar("resistance", "pf2e")), /flags\.sf2e/);
});

test("Кастомизации: модули навыка/экспертности/манёвров и уклонение", () => {
  assert.deepEqual(keys(customization("skill-module")), ["ChoiceSet", "ActiveEffectLike"]);
  assert.equal(customization("skill-module").system.rules[1].value, 1);
  assert.ok(customization("skill-module").system.rules[0].choices.every((c) => c.predicate?.[0]?.endsWith(":rank:0")));
  assert.equal(customization("expertise-module").system.rules[1].value, 2);
  assert.ok(customization("expertise-module").system.rules[0].choices.every((c) => c.predicate?.[0]?.gte));

  const maneuver = customization("maneuver-module").system.rules;
  assert.deepEqual(maneuver.map((r) => r.key), ["ChoiceSet", "ChoiceSet", "ChoiceSet", "FlatModifier", "FlatModifier"]);
  assert.equal(maneuver[0].rollOption, "maneuver");
  assert.ok(maneuver[1].choices.every((c) => c.predicate?.[0]?.not?.startsWith("maneuver:")));
  assert.equal(maneuver[3].selector, "athletics");
  assert.equal(maneuver[3].type, "circumstance");
  assert.deepEqual(maneuver[3].predicate, ["action:{item|flags.sf2e.rulesSelections.maneuverOne}"]);
  assert.equal(maneuver[4].predicate[0], "action:{item|flags.sf2e.rulesSelections.maneuverTwo}");

  assert.deepEqual(keys(customization("optimized-avoidance")), ["ChoiceSet", "Note"]);
  assert.deepEqual(keys(customization("high-speed")), ["ChoiceSet", "BaseSpeed"]);
  assert.equal(customization("high-speed").system.rules[1].value, 40);
  assert.ok(customization("high-speed").system.rules[0].choices.some((c) => c.value === "burrow"));
});

test("Кастомизации: свет, языки, условное мастерство и Харизма", () => {
  assert.deepEqual(keys(customization("light-mounts")), ["RollOption", "TokenLight"]);
  assert.equal(customization("light-mounts").system.rules[0].toggleable, true);
  assert.deepEqual(customization("light-mounts").system.rules[1].value, { bright: 20, dim: 40 });
  assert.deepEqual(customization("light-mounts").system.rules[1].predicate, ["light-mounts"]);

  assert.deepEqual(customization("linguistic-upload").system.rules, [
    { key: "ActiveEffectLike", mode: "add", path: "system.build.languages.max", value: 2 },
  ]);

  const resolvable = "min(3, max(2, @actor.system.skills.acrobatics.rank + 1))";
  assert.equal(customization("agility-optimization").system.rules[0].value, resolvable);
  assert.equal(customization("camoflage").system.rules[0].path, "system.skills.stealth.rank");
  const glow = customization("glow-up").system.rules;
  assert.equal(glow[0].path, "system.skills.diplomacy.rank");
  assert.deepEqual(glow[1], { key: "ActiveEffectLike", mode: "override", path: "system.abilities.cha.mod", value: 3 });
});

test("Кастомизации: PF2e адаптация навыков и ссылок манёвров", () => {
  const pf = customization("skill-module", "pf2e").system.rules[0].choices.map((c) => c.value);
  assert.ok(!pf.includes("computers") && !pf.includes("piloting"));
  assert.equal(pf.length, 16);
  assert.equal(customization("skill-module", "sf2e").system.rules[0].choices.length, 18);
  const pfManeuver = customization("maneuver-module", "pf2e").system.rules;
  assert.equal(pfManeuver[3].value, "{item|flags.pf2e.rulesSelections.maneuverBonus}");
  assert.deepEqual(pfManeuver[3].predicate, ["action:{item|flags.pf2e.rulesSelections.maneuverOne}"]);
});

test("Recharge: нативный selfEffect ведёт на Effect Item в паке кастомизаций", () => {
  const recharge = customization("recharge");
  assert.equal(recharge.system.selfEffect.uuid, "Compendium.sf2e-missing-tech-pets.robot-customizations.Item.8a4adcb39a007962");
  assert.match(recharge.system.description.value, /CustomSelfEffectHint/);
  assert.equal(customization("recharge", "pf2e").system.selfEffect.uuid, "Compendium.sf2e-missing-tech-pets.pf2e-robot-customizations.Item.8a4adcb39a007962");
  assert.equal(customization("emergency-repair").system.frequency.per, "PT10M");
});

test("Effect Items: Recharge clumsy, поддержки Tank/Powerful", () => {
  const recharge = buildEffectSource(effects.effects.find((e) => e.slug === "effect-recharge"));
  assert.equal(recharge.type, "effect");
  assert.equal(recharge.system.rules[0].key, "GrantItem");
  assert.equal(recharge.system.rules[0].uuid, "Compendium.sf2e.conditions.Item.i3OJZU2nk64Df3xm");
  assert.deepEqual(recharge.system.rules[0].alterations, [{ mode: "override", property: "badge-value", value: 1 }]);
  assert.deepEqual(recharge.system.rules[0].onDeleteActions, { grantee: "cascade" });
  assert.equal(recharge.system.duration.unit, "rounds");
  const pfRecharge = buildEffectSource(effects.effects.find((e) => e.slug === "effect-recharge"), "pf2e");
  assert.equal(pfRecharge.system.rules[0].uuid, "Compendium.pf2e.conditionitems.Item.i3OJZU2nk64Df3xm");

  const tank = buildEffectSource(effects.effects.find((e) => e.slug === "effect-tank-support"));
  assert.deepEqual(tank.system.rules.map((r) => r.key), ["RollOption", "FlatModifier"]);
  assert.equal(tank.system.rules[1].selector, "strike-attack-roll");
  assert.equal(tank.system.rules[1].type, "circumstance");
  assert.equal(tank.system.duration.expiry, "turn-start");

  const powerful = buildEffectSource(effects.effects.find((e) => e.slug === "effect-powerful-support"));
  const dice = powerful.system.rules.find((r) => r.key === "DamageDice");
  assert.equal(dice.category, "persistent");
  assert.equal(dice.damageType, "bleed");
  assert.equal(dice.dieSize, "d6");
  assert.equal(dice.diceNumber, "{item|flags.sf2e.rulesSelections.bleedDice}");
});

test("Minibot: Petbot бонус Conceal, Beatbot переключатель, частоты нативны", () => {
  const petbot = buildMinibotEquipmentSource(minibots.equipment.find((e) => e.slug === "petbot"));
  assert.deepEqual(petbot.system.rules, [
    { key: "FlatModifier", selector: "stealth", type: "item", value: 1, predicate: ["action:conceal-an-object"] },
  ]);
  const beatbot = buildMinibotEquipmentSource(minibots.equipment.find((e) => e.slug === "beatbot-tactical"));
  assert.deepEqual(beatbot.system.rules.map((r) => r.key), ["RollOption", "FlatModifier", "FlatModifier"]);
  assert.equal(beatbot.system.rules[0].option, "drop-the-beat");
  assert.equal(beatbot.system.rules[0].toggleable, true);
  assert.equal(beatbot.system.rules[1].value, -4);
  assert.deepEqual(beatbot.system.rules[1].predicate, ["drop-the-beat"]);
  assert.equal(beatbot.system.rules[2].selector, "performance");
  assert.deepEqual(beatbot.system.rules[2].predicate, ["drop-the-beat"]);
  // Свойства самого бота гейтятся признаком minibot.
  const firebot = buildMinibotEquipmentSource(minibots.equipment.find((e) => e.slug === "firebot-commercial"));
  assert.deepEqual(firebot.system.rules, [
    { key: "Resistance", type: ["fire"], value: 12, requiresEquipped: false, predicate: ["self:trait:minibot"] },
  ]);
  const bellbot = buildMinibotEquipmentSource(minibots.equipment.find((e) => e.slug === "bellbot-commercial"));
  assert.deepEqual(bellbot.system.rules, [
    { key: "BaseSpeed", selector: "land", value: 25, requiresEquipped: false, predicate: ["self:trait:minibot"] },
  ]);
  const direct = buildMinibotActionSource(minibots.actions[0]);
  assert.deepEqual(direct.system.frequency, { max: 1, per: "PT1H" });
});

test("choiceVariants и preserveRuleChoices сохраняют допустимый выбор", () => {
  const source = customization("armored-plates");
  source.system.rules[0].selection = 2;
  source.flags.sf2e = { rulesSelections: { armoredPlatesBonus: 2 } };
  const variants = choiceVariants(source, "sf2e");
  assert.ok(variants.length > 0);
  assert.ok(variants.some((v) => v.system.rules[0].selection === 2));

  const previous = customization("optimized-avoidance");
  previous.system.rules[0].selection = "reflex";
  previous.flags.sf2e = { rulesSelections: { save: "reflex" } };
  const target = customization("optimized-avoidance");
  preserveRuleChoices(target, previous, "sf2e");
  assert.equal(target.system.rules[0].selection, "reflex");
  assert.equal(target.flags.sf2e.rulesSelections.save, "reflex");

  // Недопустимый выбор не переносится.
  const bad = customization("optimized-avoidance");
  bad.system.rules[0].selection = "invalid";
  const clean = customization("optimized-avoidance");
  preserveRuleChoices(clean, bad, "sf2e");
  assert.equal(clean.system.rules[0].selection, undefined);
});

test("Диалог выборов фамильяра фильтрует варианты по predicate и rollOption-исключению", () => {
  const fast = familiar("fast-movement").system.rules[0];
  const actor = { getRollOptions: () => ["speed:land", "speed:swim"] };
  assert.deepEqual(
    validChoicesFor(fast, actor, [{ rule: fast }], {}).map((c) => c.value),
    ["land", "swim"],
  );
  const [one, two] = familiar("resistance").system.rules;
  const pending = [{ rule: one }, { rule: two }];
  const empty = { getRollOptions: () => [] };
  const allOne = validChoicesFor(one, empty, pending, {}).map((c) => c.value);
  const withAcid = validChoicesFor(two, empty, pending, {
    resistanceOne: "acid",
  }).map((c) => c.value);
  assert.ok(allOne.includes("acid"));
  assert.ok(!withAcid.includes("acid"));
  assert.equal(withAcid.length, allOne.length - 1);
  const opts = new Set(["skill:acrobatics:rank:2"]);
  assert.equal(choicePredicatePasses([{ gte: ["skill:acrobatics:rank", 1] }], opts), true);
  assert.equal(choicePredicatePasses([{ gte: ["skill:acrobatics:rank", 3] }], opts), false);
  assert.equal(choicePredicatePasses(["speed:fly"], opts), false);
  assert.equal(choicePredicatePasses([{ not: "speed:fly" }], opts), true);
});