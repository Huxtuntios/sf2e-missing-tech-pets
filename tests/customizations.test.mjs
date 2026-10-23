// Документы и реальные LevelDB; выполнение Rule Elements в Foundry здесь не имитируется.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { buildCustomizationSource } from "../scripts/customization-sources.mjs";
const json = async (file) =>
  JSON.parse(await readFile(new URL("../" + file, import.meta.url), "utf8"));
const catalog = await json("data/robot-customizations.json");
const byId = (id) =>
  buildCustomizationSource(catalog.entries.find((e) => e.id === id));
test("36 кастомизаций: фабрика, JSON, JSONL и LevelDB совпадают; стабильные уникальные ID", async () => {
  const snapshot = (
    await readFile(
      new URL("../packs/robot-customizations.db", import.meta.url),
      "utf8",
    )
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  const destination = await mkdtemp(tmpdir() + "/sfmtp-customizations-");
  await extractPack(
    new URL("../packs/robot-customizations", import.meta.url).pathname,
    destination,
    { log: false },
  );
  const extracted = await Promise.all(
    (await readdir(destination))
      .filter((n) => n.endsWith(".json"))
      .map(async (n) =>
        JSON.parse(await readFile(destination + "/" + n, "utf8")),
      ),
  );
  assert.equal(catalog.entries.length, 36);
  assert.equal(snapshot.length, 36);
  assert.equal(extracted.length, 36);
  assert.equal(new Set(catalog.entries.map((e) => e.itemId)).size, 36);
  for (const entry of catalog.entries) {
    const expected = buildCustomizationSource(entry);
    assert.equal(
      entry.itemId,
      createHash("sha256")
        .update(`sf2e-missing-tech-pets:customization:${entry.id}`)
        .digest("hex")
        .slice(0, 16),
    );
    assert.deepEqual(
      await json(`packs/src/robot-customizations/${entry.id}.json`),
      expected,
    );
    assert.deepEqual(
      snapshot.find((e) => e._id === entry.itemId),
      expected,
    );
    const actual = extracted.find((e) => e._id === entry.itemId);
    delete actual._key;
    assert.deepEqual(actual, expected);
    assert.equal(expected.type, "feat");
    assert.equal(expected.system.category, "bonus");
    assert.equal(expected.system.location, null);
    assert.ok(entry.description.length > 20);
    assert.equal(
      expected.flags.core.sourceId,
      `Compendium.sf2e-missing-tech-pets.robot-customizations.Item.${entry.itemId}`,
    );
  }
});
test("Aquatic Adaptation даёт swim 20; Speakers остаётся описанием без выдуманной механики", () => {
  assert.deepEqual(byId("aquatic-adaptation").system.rules, [
    { key: "BaseSpeed", selector: "swim", value: 20 },
  ]);
  assert.deepEqual(byId("speakers").system.rules, []);
  assert.match(byId("speakers").system.description.value, /CustomManualHint/);
  assert.equal(
    catalog.entries.filter((e) => e.automation === "rules").length,
    10,
  );
  assert.equal(
    catalog.entries.filter((e) => e.automation === "manual").length,
    26,
  );
});
test("Armored Plates: нативный выбор +1/+2 и item-бонус AC, не зависящий от лимита каталога", () => {
  const [choice, bonus] = byId("armored-plates").system.rules;
  assert.equal(choice.key, "ChoiceSet");
  assert.deepEqual(
    choice.choices.map((c) => c.value),
    [1, 2],
  );
  assert.equal(bonus.selector, "ac");
  assert.equal(bonus.type, "item");
  assert.equal(bonus.fromEquipment, false);
  assert.equal(
    bonus.value,
    "{item|flags.sf2e.rulesSelections.armoredPlatesBonus}",
  );
});
test("Роботские Climber и Flier используют скорости 20, не одноимённые способности фамильяра", () => {
  assert.deepEqual(byId("climber").system.rules, [
    { key: "BaseSpeed", selector: "climb", value: 20 },
  ]);
  assert.deepEqual(byId("flier").system.rules, [
    { key: "BaseSpeed", selector: "fly", value: 20 },
  ]);
});

test("Каждая кастомизация содержит описание внутри Item, не только ссылку", () => {
  for (const entry of catalog.entries) {
    const source = buildCustomizationSource(entry);
    assert.ok(source.system.description.value.startsWith("<p>"));
    assert.ok(source.system.description.value.indexOf("</p>") > 3, entry.id);
    assert.equal(
      source.system.description.value.split("</p>")[0].slice(3),
      entry.description
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;"),
    );
    assert.ok(entry.description.trim());
  }
});
