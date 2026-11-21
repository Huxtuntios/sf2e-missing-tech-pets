import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { localizeCatalog, localizeItemSource, displayField } from "../scripts/content-localization.mjs";
import { buildChassisSource, buildSupportSource, buildManeuverSource } from "../scripts/item-sources.mjs";
import { buildCustomizationSource } from "../scripts/customization-sources.mjs";
import { buildFamiliarSource } from "../scripts/familiar-sources.mjs";
const root = new URL("../", import.meta.url);
const json = async (file) => JSON.parse(await readFile(new URL(file, root), "utf8"));
const translations = await json("data/ru-content.json");
const catalogs = Object.fromEntries(await Promise.all(["robot-chassis", "robot-customizations", "familiar-abilities"].map(async name => [name, await json(`data/${name}.json`)])));
const definitions = [
  ["robot-chassis", buildChassisSource, "robot-chassis"],
  ["robot-support", buildSupportSource, "robot-chassis"],
  ["robot-advanced-maneuvers", buildManeuverSource, "robot-chassis"],
  ["robot-customizations", buildCustomizationSource, "robot-customizations"],
  ["familiar-abilities", buildFamiliarSource, "familiar-abilities"],
];
const technical = source => {
  const result = structuredClone(source);
  delete result.name;
  delete result.system.description.value;
  return result;
};
const uuids = text => [...text.matchAll(/@UUID\[([^\]]+)\]/g)].map(match => match[1]).sort();
test("Russian catalog coverage is exact; display fields do not replace mechanical data", () => {
  for (const [name, catalog] of Object.entries(catalogs)) {
    assert.deepEqual(Object.keys(translations[name].entries).sort(), catalog.entries.map(entry => entry.id).sort());
    const before = structuredClone(catalog);
    const localized = localizeCatalog(catalog, name, { language: "ru", translations });
    assert.notEqual(localized.note, catalog.note);
    for (const [index, entry] of localized.entries.entries()) {
      assert.match(entry.display.name, /[А-Яа-яЁё]/);
      const original = { ...entry }; delete original.display;
      assert.deepEqual(original, catalog.entries[index]);
    }
    assert.deepEqual(catalog, before);
    assert.equal(localizeCatalog(catalog, name, { language: "en", translations }), catalog);
  }
});
test("display.description локализованного каталогов доступен через displayField для строк UI", () => {
  for (const name of ["familiar-abilities", "robot-customizations"]) {
    const localized = localizeCatalog(catalogs[name], name, { language: "ru", translations });
    for (const entry of localized.entries) {
      assert.match(displayField(entry, "description"), /[А-Яа-яЁё]/, `${name}/${entry.id}`);
      assert.equal(displayField(entry, "description"), entry.display.description);
    }
  }
  const flier = localizeCatalog(catalogs["familiar-abilities"], "familiar-abilities", { language: "ru", translations })
    .entries.find((entry) => entry.id === "flier");
  assert.match(displayField(flier, "description"), /Скорость полёта 25 футов/);
  const en = catalogs["familiar-abilities"].entries.find((entry) => entry.id === "flier");
  assert.equal(displayField(en, "description"), "It gains a fly Speed of 25 feet.");
});
for (const system of ["sf2e", "pf2e"]) {
  test(`${system}: all 89 documents translate without changing mechanics, flags or UUIDs`, () => {
    let count = 0;
    for (const [name, builder, family] of definitions) {
      for (const entry of catalogs[family].entries) {
        const source = builder(entry, system);
        source.flags.userData = { note: "preserve unknown flags" };
        const before = structuredClone(source);
        const localized = localizeItemSource(source, name, entry, { language: "ru", translations });
        assert.match(localized.name, /[А-Яа-яЁё]/);
        assert.match(localized.system.description.value, /[А-Яа-яЁё]/);
        assert.deepEqual(technical(localized), technical(source));
        assert.deepEqual(uuids(localized.system.description.value), uuids(source.system.description.value));
        assert.deepEqual(source, before);
        assert.equal(localizeItemSource(source, name, entry, { language: "en", translations }), source);
        count++;
      }
    }
    assert.equal(count, 89);
  });
}
for (const system of ["sf2e", "pf2e"]) {
  test(`${system}: localization of an already-translated pack preserves condition links`, async () => {
    for (const [category, builder, family] of definitions) {
      const pack = system === "pf2e" ? `pf2e-${category}` : category;
      const payload = await json(`lang/babele/ru/sf2e-missing-tech-pets.${pack}.json`);
      const sources = (await readFile(new URL(`packs/${pack}.db`, root), "utf8")).trim().split("\n").map(JSON.parse);
      for (const entry of catalogs[family].entries) {
        const slug = builder(entry, system).system.slug;
        const source = sources.find((item) => item.system.slug === slug);
        const translated = payload.entries[source._id];
        source.name = translated.name;
        source.system.description.value = translated.description;
        const before = structuredClone(source);
        const localized = localizeItemSource(source, category, entry, { language: "ru", translations });
        assert.deepEqual(uuids(localized.system.description.value), uuids(source.system.description.value), `${pack}/${entry.id}`);
        assert.equal(localized.system.description.value, source.system.description.value, `${pack}/${entry.id}`);
        assert.deepEqual(technical(localized), technical(source));
        assert.deepEqual(source, before);
      }
    }
  });
}
test("Fourteen Babele translation files use stable IDs and primitive display-only mappings", async () => {
  const manifest = await json("module.json");
  let count = 0;
  for (const pack of manifest.packs) {
    const isCreature = pack.type === "Actor";
    const descPath = isCreature ? "system.details.publicNotes" : "system.description.value";
    const payload = await json(`lang/babele/ru/${manifest.id}.${pack.name}.json`);
    const rows = (await readFile(new URL(`packs/${pack.name}.db`, root), "utf8")).trim().split("\n").map(JSON.parse);
    assert.deepEqual(payload.mapping, { name: "name", description: descPath });
    assert.deepEqual(Object.keys(payload.entries).sort(), rows.map(item => item._id).sort());
    for (const item of rows) {
      const entry = payload.entries[item._id];
      const description = isCreature ? item.system.details.publicNotes : item.system.description.value;
      assert.deepEqual(Object.keys(entry).sort(), ["description", "name"]);
      assert.match(entry.name, /[А-Яа-яЁё]/);
      assert.match(entry.description, /[А-Яа-яЁё]/);
      assert.deepEqual(uuids(entry.description), uuids(description));
      assert.doesNotMatch(item.name, /[А-Яа-яЁё]/);
      assert.doesNotMatch(description, /[А-Яа-яЁё]/);
      count++;
    }
  }
  assert.equal(count, 238);
});
test("Content translation preserves action costs, manual status and conditional thresholds", () => {
  const focus = translations["familiar-abilities"].entries["familiar-focus"];
  assert.match(focus.description, /2 действия/);
  assert.match(focus.description, /1 Очко Фокуса/);
  const robotFlier = translations["robot-customizations"].entries.flier;
  const familiarFlier = translations["familiar-abilities"].entries.flier;
  assert.match(robotFlier.description, /20 футов/);
  assert.match(familiarFlier.description, /25 футов/);
  assert.match(translations["robot-customizations"].entries["resistant-panels"].description, /округлением вверх/);
  assert.match(translations["robot-customizations"].entries["linguistic-upload"].description, /Искусственная личность.*Разумность/);
});
