// Компендиум Minibot (только SF2e): существо, предметы и действие активации.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import {
  buildMinibotCreatureSource,
  buildMinibotEquipmentSource,
  buildMinibotActionSource,
} from "../scripts/minibot-sources.mjs";
import {
  registerMinibotEquipmentTrait,
  registerMinibotCreatureTrait,
} from "../scripts/system-context.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async (file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));
const data = await json("data/minibots.json");
const stableId = (prefix, slug) =>
  createHash("sha256")
    .update(`sf2e-missing-tech-pets:${prefix}:${slug}`)
    .digest("hex")
    .slice(0, 16);

test("Существо Minibot: точный стат-блок Tech Core и нативные поля NPC", () => {
  const c = data.creature;
  assert.equal(c.level, -1);
  assert.equal(c.size, "tiny");
  assert.deepEqual(c.traits, ["construct", "robot", "tech", "minibot"]);
  assert.equal(c.ac, 14);
  assert.equal(c.hp, 4);
  assert.deepEqual(c.saves, { fortitude: 0, reflex: 4, will: 0 });
  assert.deepEqual(c.abilities, { str: -4, dex: 3, con: 0, int: -5, wis: 0, cha: 0 });
  assert.deepEqual(c.skills, { acrobatics: 6 });
  assert.equal(c.perception.mod, 0);
  assert.deepEqual(c.perception.senses, [{ type: "darkvision" }]);
  assert.deepEqual(c.speed, { value: 0, otherSpeeds: [{ type: "fly", value: 30 }] });
  assert.deepEqual(c.weaknesses, [{ type: "electricity", value: 1 }]);
  const immunityTypes = c.immunities.map((i) => i.type);
  for (const type of ["area-damage", "mental", "bleed", "death-effects", "doomed", "drained", "fatigued", "healing", "nonlethal-attacks", "paralyzed", "poison", "sickened", "spirit", "unconscious", "vitality", "void", "disease"])
    assert.ok(immunityTypes.includes(type), type);

  const source = buildMinibotCreatureSource(c);
  assert.equal(source.type, "npc");
  assert.deepEqual(source.items, []);
  assert.equal(source.system.attributes.ac.value, 14);
  assert.equal(source.system.attributes.hp.max, 4);
  assert.deepEqual(source.system.attributes.weaknesses, [{ type: "electricity", value: 1 }]);
  assert.equal(source.system.attributes.speed.otherSpeeds[0].type, "fly");
  assert.equal(source.system.details.level.value, -1);
  assert.equal(source.system.traits.size.value, "tiny");
  assert.deepEqual(source.system.traits.value, ["construct", "robot", "tech", "minibot"]);
  assert.deepEqual(source.system.skills, { acrobatics: { base: 6 } });
  assert.equal(source.system.perception.senses[0].type, "darkvision");
});

test("25 предметов minibot: без Independent Obstructobot, нативная схема и RU", () => {
  assert.equal(data.equipment.length, 25);
  const slugs = new Set();
  for (const item of data.equipment) {
    assert.ok(!item.slug.startsWith("independent-obstructobot"), item.slug);
    assert.ok(!slugs.has(item.slug), item.slug);
    slugs.add(item.slug);
    assert.deepEqual(item.traits, ["minibot", "tech"]);
    assert.equal(item.bulk, 1);
    assert.ok(Number.isInteger(item.level), item.slug);
    assert.ok(item.price > 0, item.slug);
    assert.ok(item.description.length > 0, item.slug);
    assert.ok(item.nameRu && item.descriptionRu, item.slug);

    const source = buildMinibotEquipmentSource(item);
    assert.equal(source.type, "equipment");
    assert.equal(source.system.price.value.sp, item.price);
    assert.equal(source.system.level.value, item.level);
    assert.equal(source.system.bulk.value, 1);
    assert.deepEqual(source.system.traits.value, ["minibot", "tech"]);
    assert.deepEqual(source.system.rules, item.rules ?? []);
    assert.equal(source.system.slug, item.slug);
    assert.equal(source.system.description.value, item.description);
  }
  // Independent Obstructobot уже поставляется системой sf2e — не дублируем.
  assert.ok(!data.equipment.some((i) => i.group === "independent-obstructobot"));
});

test("Свойства бота гейтятся self:trait:minibot; бонусы владельца — без гейта", () => {
  const botFacing = ["firebot-commercial", "firebot-tactical", "firebot-advanced", "bellbot-commercial", "bellbot-tactical", "bellbot-advanced", "bellbot-superior", "bellbot-elite"];
  for (const slug of botFacing) {
    const entry = data.equipment.find((e) => e.slug === slug);
    assert.ok(entry.rules?.length, slug);
    for (const rule of entry.rules) {
      assert.ok(rule.predicate?.includes("self:trait:minibot"), `${slug}/${rule.key}`);
      assert.equal(rule.requiresEquipped, false, slug);
    }
  }
  const firebot = buildMinibotEquipmentSource(data.equipment.find((e) => e.slug === "firebot-tactical"));
  assert.deepEqual(firebot.system.rules, [
    { key: "Resistance", type: ["fire"], value: 24, requiresEquipped: false, predicate: ["self:trait:minibot"] },
  ]);
  // Эффекты владельца («You») дают бонусы по условию/переключателю, без гейта на минибота.
  for (const slug of ["petbot", "beatbot-commercial", "beatbot-tactical"]) {
    const entry = data.equipment.find((e) => e.slug === slug);
    for (const rule of entry.rules ?? []) {
      assert.ok(!rule.predicate?.includes("self:trait:minibot"), slug);
    }
  }
  const petbot = buildMinibotEquipmentSource(data.equipment.find((e) => e.slug === "petbot"));
  assert.deepEqual(petbot.system.rules[0].predicate, ["action:conceal-an-object"]);
});

test("Регистрация признака minibot для equipment и creature не перезаписывает существующее", () => {
  const config = { PF2E: { equipmentTraits: { existing: "X" }, creatureTraits: { existing: "X" } } };
  registerMinibotEquipmentTrait(config);
  registerMinibotCreatureTrait(config);
  assert.equal(config.PF2E.equipmentTraits.minibot, "PF2E.TraitMinibot");
  assert.equal(config.PF2E.creatureTraits.minibot, "PF2E.TraitMinibot");
  assert.equal(config.PF2E.equipmentTraits.existing, "X");
  const preset = { PF2E: { equipmentTraits: { minibot: "Custom" }, creatureTraits: { minibot: "Custom" } } };
  registerMinibotEquipmentTrait(preset);
  registerMinibotCreatureTrait(preset);
  assert.equal(preset.PF2E.equipmentTraits.minibot, "Custom");
  assert.equal(preset.PF2E.creatureTraits.minibot, "Custom");
});

test("Действие Direct Minibot: нативная стоимость/признак, эффект ручной", () => {
  assert.equal(data.actions.length, 1);
  const action = data.actions[0];
  assert.equal(action.slug, "direct-minibot");
  assert.equal(action.actions, 1);
  assert.deepEqual(action.traits, ["manipulate"]);
  assert.ok(action.nameRu && action.descriptionRu);
  const source = buildMinibotActionSource(action);
  assert.equal(source.type, "action");
  assert.equal(source.system.actions.value, 1);
  assert.equal(source.system.actionType.value, "action");
  assert.deepEqual(source.system.traits.value, ["manipulate"]);
  assert.deepEqual(source.system.rules, []);
  assert.deepEqual(source.system.frequency, { max: 1, per: "PT1H" });
  assert.match(source.system.description.value, /SFMTP.ManualActionHint/);
});

test("JSON-источники паков совпадают с фабриками и стабильными ID (SF2e и PF2e)", async () => {
  const creature = buildMinibotCreatureSource(data.creature);
  creature._id = stableId("minibot-creature", data.creature.slug);
  const expectedItems = [
    ...data.equipment.map((e) => {
      const s = buildMinibotEquipmentSource(e);
      s._id = stableId("minibot-equipment", e.slug);
      return s;
    }),
    ...data.actions.map((a) => {
      const s = buildMinibotActionSource(a);
      s._id = stableId("minibot-action", a.slug);
      return s;
    }),
  ];
  for (const prefix of ["", "pf2e-"]) {
    const creatureSource = await json(`packs/src/${prefix}minibot-creature/minibot.json`);
    assert.deepEqual(creatureSource, creature);
    const itemFiles = (await readdir(path.join(root, `packs/src/${prefix}minibots`)))
      .filter((f) => f.endsWith(".json"));
    assert.equal(itemFiles.length, 26);
    const ids = new Set();
    for (const file of itemFiles) {
      const source = await json(`packs/src/${prefix}minibots/${file}`);
      const match = expectedItems.find((e) => e._id === source._id);
      assert.ok(match, file);
      assert.deepEqual(source, match);
      assert.ok(!ids.has(source._id));
      ids.add(source._id);
    }
    assert.equal(ids.size, 26);
  }
});

test("Реальные LevelDB Minibot читаются CLI и совпадают с источниками (SF2e и PF2e)", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "sfmtp-minibot-test-"));
  for (const prefix of ["", "pf2e-"]) {
    for (const [base, count] of [["minibot-creature", 1], ["minibots", 26]]) {
      const name = `${prefix}${base}`;
      const output = path.join(temporary, name);
      await extractPack(path.join(root, "packs", name), output, { log: false });
      const files = (await readdir(output)).filter((f) => f.endsWith(".json"));
      assert.equal(files.length, count);
      const sources = (await readdir(path.join(root, "packs/src", name)))
        .filter((f) => f.endsWith(".json"));
      const expected = await Promise.all(sources.map((f) => json(`packs/src/${name}/${f}`)));
      for (const file of files) {
        const document = JSON.parse(await readFile(path.join(output, file), "utf8"));
        delete document._key;
        assert.deepEqual(document, expected.find((e) => e._id === document._id));
      }
    }
  }
});

test("Babele RU покрывает все документы Minibot (SF2e и PF2e)", async () => {
  for (const prefix of ["", "pf2e-"]) {
    for (const [base, count] of [["minibot-creature", 1], ["minibots", 26]]) {
      const name = `${prefix}${base}`;
      const babele = await json(`lang/babele/ru/sf2e-missing-tech-pets.${name}.json`);
      assert.ok(babele.label && babele.label.length > 0);
      assert.equal(Object.keys(babele.entries).length, count);
      for (const entry of Object.values(babele.entries)) {
        assert.ok(entry.name && entry.name.length > 0);
        assert.ok(entry.description && entry.description.length > 0);
      }
    }
  }
});