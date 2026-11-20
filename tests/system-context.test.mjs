import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ownPackName, companionPackKey, companionClassUuid, nativeUuid, matchesNativeUuid,
  registerMinibotEquipmentTrait,
} from "../scripts/system-context.mjs";
import { buildChassisSource, buildSupportSource, buildManeuverSource, applyChassisChoices } from "../scripts/item-sources.mjs";
import { buildCustomizationSource, preserveCustomizationChoices } from "../scripts/customization-sources.mjs";
import { buildFamiliarSource } from "../scripts/familiar-sources.mjs";
import { matchesCompanionSource, COMPANION_SOURCES } from "../scripts/companion-sources.mjs";
import { NATIVE_EXOCORTEX, isMechanic, exocortexVariants } from "../scripts/exocortex-rules.mjs";

const root = new URL("../", import.meta.url);
const json = async (name) => JSON.parse(await readFile(new URL(name, root), "utf8"));
function setup(active = false) {
  globalThis.game = { system: { id: "pf2e" }, modules: new Map([["sf2e-anachronism", { active }]]) };
  globalThis.CONFIG = { compendium: { uuidRedirects: {
    "Compendium.sf2e.class-features": "Compendium.sf2e-anachronism.class-features",
    "Compendium.sf2e.feats": "Compendium.sf2e-anachronism.feats",
    "Compendium.sf2e.actions": "Compendium.sf2e-anachronism.actions",
    "Compendium.sf2e.actions.Item.exact": "Compendium.pf2e.actionspf2e.Item.replacement",
  } } };
}
test("PF2e имеет собственные коллекции; прежние SF2e коллекции и class ID сохранены", () => {
  setup();
  assert.equal(ownPackName("robot-chassis"), "pf2e-robot-chassis");
  assert.equal(ownPackName("robot-chassis", "sf2e"), "robot-chassis");
  assert.equal(companionPackKey("sf-AC-Features"), "AC-Features");
  assert.equal(companionClassUuid(), "Compendium.pf2e-animal-companions.AC-Features.Item.KKOgokqHa7RjVDN6");
});
test("Все PF2e фабрики используют PF2e namespace и нативные condition UUID", async () => {
  setup();
  const chassis = await json("data/robot-chassis.json");
  const custom = await json("data/robot-customizations.json");
  const familiar = await json("data/familiar-abilities.json");
  const sources = [
    ...chassis.entries.flatMap((entry) => [buildChassisSource(entry, "pf2e"), buildSupportSource(entry, "pf2e"), buildManeuverSource(entry, "pf2e")]),
    ...custom.entries.map((entry) => buildCustomizationSource(entry, "pf2e")),
    ...familiar.entries.map((entry) => buildFamiliarSource(entry, "pf2e")),
  ];
  assert.equal(sources.length, 89);
  for (const source of sources) assert.doesNotMatch(JSON.stringify(source), /flags\.sf2e\.|Compendium\.sf2e\.|systems\/sf2e\//);
  assert.ok(sources.some((source) => source.system.description.value.includes("Compendium.pf2e.conditionitems.Item.AJh5ex99aV6VTggg")));
});
test("ChoiceSet размера и брони сохраняется в flags.pf2e без изменения SF2e флагов", async () => {
  setup();
  const chassis = (await json("data/robot-chassis.json")).entries[0];
  const source = buildChassisSource(chassis, "pf2e");
  source.flags.sf2e = { userNote: "keep" };
  const result = applyChassisChoices(source, chassis, { chassisSizes: { [chassis.id]: "sm" } });
  assert.equal(result.flags.pf2e.rulesSelections.chassisSize, "sm");
  assert.deepEqual(result.flags.sf2e, { userNote: "keep" });
  assert.equal(source.flags.pf2e.rulesSelections.chassisSize, null);
  const plates = (await json("data/robot-customizations.json")).entries.find((entry) => entry.id === "armored-plates");
  const armor = preserveCustomizationChoices(buildCustomizationSource(plates, "pf2e"), { flags: { pf2e: { rulesSelections: { armoredPlatesBonus: 2 } } } });
  assert.equal(armor.flags.pf2e.rulesSelections.armoredPlatesBonus, 2);
  assert.equal(armor.system.rules.find((rule) => rule.key === "ChoiceSet").selection, 2);
});
test("Устаревший источник без ChoiceSet не вызывает TypeError и не получает выдуманный выбор", async () => {
  setup();
  const entry = (await json("data/robot-chassis.json")).entries[0];
  const source = buildChassisSource(entry, "pf2e");
  source.system.rules = source.system.rules.filter((rule) => rule.key !== "ChoiceSet");
  const result = applyChassisChoices(source, entry, { chassisSizes: { [entry.id]: "sm" } });
  assert.equal(result.system.size, source.system.size);
  assert.equal(result.flags.pf2e.rulesSelections.chassisSize, null);
});
test("Redirect Anachronism учитывает точный UUID перед общим префиксом и отсутствие интеграции", () => {
  setup();
  assert.equal(nativeUuid(NATIVE_EXOCORTEX.mine), null);
  game.modules.get("sf2e-anachronism").active = true;
  assert.equal(nativeUuid("Compendium.sf2e.actions.Item.exact"), "Compendium.pf2e.actionspf2e.Item.replacement");
  assert.equal(nativeUuid(NATIVE_EXOCORTEX.mine), "Compendium.sf2e-anachronism.class-features.Item.peXRQKUzkAGqduHP");
  assert.equal(nativeUuid("Compendium.sf2e.unknown.Item.missing"), null);
  assert.ok(matchesNativeUuid(nativeUuid(NATIVE_EXOCORTEX.mine), NATIVE_EXOCORTEX.mine));
  assert.equal(matchesNativeUuid("Compendium.pf2e.feats-srd.Item.peXRQKUzkAGqduHP", NATIVE_EXOCORTEX.mine), false);
});
test("Конвертированные источники Familiar и Exocortex распознаются только с Anachronism", () => {
  setup(true);
  const entry = COMPANION_SOURCES.find((entry) => entry.slug === "familiar");
  const familiar = { type: "feat", flags: { core: { sourceId: nativeUuid(entry.uuid) } }, system: {} };
  assert.equal(matchesCompanionSource(familiar, entry), true);
  const actor = { type: "character", items: [
    { type: "feat", flags: { core: { sourceId: nativeUuid(NATIVE_EXOCORTEX.exocortex) } }, system: {} },
    { type: "feat", flags: { core: { sourceId: nativeUuid(NATIVE_EXOCORTEX.mine) } }, system: {} },
  ] };
  assert.equal(isMechanic(actor), true);
  assert.deepEqual(exocortexVariants(actor), ["mine"]);
  game.modules.get("sf2e-anachronism").active = false;
  assert.equal(matchesCompanionSource(familiar, entry), false);
  assert.equal(isMechanic(actor), false);
});
test("SF2e и PF2e packs содержат те же стабильные ID, типы и slug", async () => {
  for (const pack of ["robot-chassis", "robot-support", "robot-advanced-maneuvers", "robot-customizations", "familiar-abilities"]) {
    const rows = async (name) => (await readFile(new URL(`packs/${name}.db`, root), "utf8")).trim().split("\n").map(JSON.parse);
    const sf = await rows(pack), pf = await rows("pf2e-" + pack);
    const identity = (item) => [item._id, item.type, item.system.slug];
    assert.deepEqual(pf.map(identity), sf.map(identity));
  }
});
test("Повреждённые данные атаки шасси дают понятную ошибку, а не TypeError", async () => {
  const { buildChassisSource } = await import("../scripts/item-sources.mjs");
  const entry = structuredClone((await json("data/robot-chassis.json")).entries[0]);
  entry.attacks = [{ name: "Broken", damage: "lots of damage" }];
  assert.throws(() => buildChassisSource(entry), /Invalid chassis attack data/);
});
test("registerMinibotEquipmentTrait добавляет minibot в equipmentTraits и не перезаписывает", () => {
  const config = { PF2E: { equipmentTraits: { tech: "PF2E.TraitTech" } } };
  registerMinibotEquipmentTrait(config);
  assert.equal(config.PF2E.equipmentTraits.minibot, "PF2E.TraitMinibot");
  assert.equal(config.PF2E.equipmentTraits.tech, "PF2E.TraitTech");
  config.PF2E.equipmentTraits.minibot = "Custom.Label";
  registerMinibotEquipmentTrait(config);
  assert.equal(config.PF2E.equipmentTraits.minibot, "Custom.Label");
  registerMinibotEquipmentTrait({ PF2E: {} });
  registerMinibotEquipmentTrait(undefined);
});
