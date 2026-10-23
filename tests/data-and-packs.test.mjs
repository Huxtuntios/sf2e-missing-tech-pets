// Чистые функции и реальные файлы LevelDB; подготовка актёра/RE здесь не запускается.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import {
  buildChassisSource,
  buildManeuverSource,
  buildSupportSource,
  imitationOptions,
  validImitationChoice,
  applyChassisChoices,
  COMPANION_CLASS_UUID,
} from "../scripts/item-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = async (file) =>
  JSON.parse(await readFile(path.join(root, file), "utf8"));
const catalog = await json("data/robot-chassis.json");
const definitions = [
  ["robot-chassis", "chassis", buildChassisSource, "ancestry"],
  ["robot-advanced-maneuvers", "maneuver", buildManeuverSource, "action"],
  ["robot-support", "support", buildSupportSource, "action"],
];
async function packSources(name) {
  const names = (await readdir(path.join(root, "packs/src", name)))
    .filter((name) => name.endsWith(".json"))
    .sort();
  return Promise.all(names.map((file) => json(`packs/src/${name}/${file}`)));
}
test("Манифест v14/SF2e, обязательная зависимость 7.6.3 и четыре собственных пака", async () => {
  const manifest = await json("module.json");
  assert.equal(manifest.id, "sf2e-missing-tech-pets");
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.deepEqual(manifest.compatibility, {
    minimum: "14.361",
    verified: "14",
    maximum: "14",
  });
  assert.equal(manifest.relationships.systems[0].id, "sf2e");
  assert.equal(
    manifest.relationships.systems[0].compatibility.minimum,
    "1.6.0",
  );
  assert.equal(manifest.relationships.requires[0].id, "pf2e-animal-companions");
  assert.equal(
    manifest.relationships.requires[0].compatibility.minimum,
    "7.6.3",
  );
  assert.equal(manifest.packs.length, 4);
  for (const pack of manifest.packs) {
    assert.equal(pack.system, "sf2e");
    assert.equal(pack.type, "Item");
    assert.equal(pack.path, `packs/${pack.name}`);
    assert.equal(pack.ownership.PLAYER, "OBSERVER");
  }
  assert.equal((await json("package.json")).version, manifest.version);
});
test("Точные 11 SF-ключей существуют в проверенном манифесте зависимости", async () => {
  const manifest = await json("tests/fixtures/companion-manifest.json");
  const source = await readFile(path.join(root, "scripts/main.mjs"), "utf8");
  const keys = [...source.matchAll(/\{ key: "(sf-AC-[^"]+)", label:/g)].map(
    (match) => match[1],
  );
  assert.equal(keys.length, 11);
  for (const key of keys)
    assert.ok(
      manifest.packs.some(
        (pack) =>
          pack.name === key && pack.system === "sf2e" && pack.type === "Item",
      ),
      key,
    );
  assert.equal(
    COMPANION_CLASS_UUID,
    "Compendium.pf2e-animal-companions.sf-AC-Features.Item.KKOgokqHa7RjVDN6",
  );
  const sourceClass = await json("tests/fixtures/companion-class.json");
  assert.equal(sourceClass.type, "class");
  assert.equal(sourceClass._id, COMPANION_CLASS_UUID.split(".").pop());
});
test("15 Items совпадают с фабриками, каталогом, JSONL; стабильные ID и типы", async () => {
  assert.equal(catalog.entries.length, 5);
  const globalIds = new Set();
  for (const [name, prefix, builder, type] of definitions) {
    const sources = await packSources(name);
    const legacy = (
      await readFile(path.join(root, "packs", name + ".db"), "utf8")
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(sources.length, 5);
    for (const entry of catalog.entries) {
      const expected = builder(entry);
      const stableKey =
        prefix === "maneuver" ? entry.advancedManeuverId : entry.id;
      expected._id = createHash("sha256")
        .update(`sf2e-missing-tech-pets:${prefix}:${stableKey}`)
        .digest("hex")
        .slice(0, 16);
      const source = sources.find(
        (item) => item.system.slug === expected.system.slug,
      );
      assert.deepEqual(source, expected);
      assert.equal(source.type, type);
      assert.deepEqual(
        legacy.find((item) => item._id === source._id),
        source,
      );
      assert.ok(!globalIds.has(source._id));
      globalIds.add(source._id);
    }
  }
  assert.equal(globalIds.size, 15);
});
test("Нативные поля шасси: size/speed/vision, полные пути навыков, способности без override", () => {
  for (const entry of catalog.entries) {
    const source = buildChassisSource(entry);
    assert.equal(typeof source.system.size, "string");
    assert.equal(typeof source.system.speed, "number");
    assert.equal(typeof source.system.vision, "string");
    assert.ok(
      source.system.rules.some(
        (rule) =>
          rule.key === "GrantItem" &&
          rule.uuid === COMPANION_CLASS_UUID &&
          rule.allowDuplicate === false,
      ),
    );
    for (const rule of source.system.rules.filter(
      (rule) => rule.key === "ActiveEffectLike",
    )) {
      assert.ok(rule.mode === "add" || rule.mode === "upgrade");
      assert.match(
        rule.path,
        /^system\.(abilities\.[a-z]+\.mod|skills\.[a-z]+\.rank)$/,
      );
    }
    for (const rule of source.system.rules.filter(
      (rule) => rule.key === "Strike",
    )) {
      assert.equal(rule.damage.base.dice, 1);
      assert.equal(rule.ability, undefined);
    }
  }
});
test("Imitator принимает реальные Bird/Ape и создаёт только выбранную атаку 1d4", async () => {
  const entry = catalog.entries.find(
    (entry) => entry.id === "imitator-chassis",
  );
  const base = buildChassisSource(entry);
  assert.ok(!base.system.rules.some((rule) => rule.key === "Strike"));
  for (const file of ["bird", "ape"]) {
    const document = await json(`tests/fixtures/${file}.json`);
    const options = imitationOptions(document);
    assert.ok(options?.attacks.length);
    const choice = {
      sourceUuid: document._stats.compendiumSource,
      size: options.size,
      speeds: options.speeds,
      attack: options.attacks[0],
    };
    assert.equal(validImitationChoice(choice), true);
    const source = applyChassisChoices(base, entry, { imitation: choice });
    assert.equal(source.system.size, options.size);
    assert.equal(source.system.speed, options.speeds.land);
    const attacks = source.system.rules.filter((rule) => rule.key === "Strike");
    assert.equal(attacks.length, 1);
    assert.deepEqual(attacks[0].damage.base, {
      dice: 1,
      die: "d4",
      damageType: choice.attack.damageType,
    });
    assert.deepEqual(attacks[0].traits, ["unarmed", "agile", "finesse"]);
    assert.deepEqual(base, buildChassisSource(entry));
  }
});
test("Imitator отклоняет construct, условные скорости, ranged и отсутствующую атаку", async () => {
  const base = await json("tests/fixtures/bird.json");
  for (const change of [
    (source) => source.system.traits.value.push("construct"),
    (source) =>
      source.system.rules.push({
        key: "BaseSpeed",
        selector: "fly",
        value: "@actor.level",
      }),
    (source) => source.system.rules.push({ key: "CreatureSize", value: "lg" }),
    (source) => {
      source.system.rules = source.system.rules.filter(
        (rule) => rule.key !== "Strike",
      );
    },
    (source) => {
      for (const rule of source.system.rules.filter(
        (rule) => rule.key === "Strike",
      ))
        rule.range = { increment: 30 };
    },
  ]) {
    const source = structuredClone(base);
    change(source);
    assert.equal(imitationOptions(source), null);
  }
  assert.equal(
    validImitationChoice({
      sourceUuid: "Actor.x",
      size: "med",
      speeds: { land: 30 },
      attack: { name: "X", damageType: "fire" },
    }),
    false,
  );
});
test("Выбор размера не мутирует исходник и не принимает произвольные значения", () => {
  const entry = catalog.entries.find((entry) => entry.id === "tank-chassis");
  const source = buildChassisSource(entry);
  const selected = applyChassisChoices(source, entry, {
    chassisSizes: { [entry.id]: "lg" },
  });
  assert.equal(selected.flags.sf2e.rulesSelections.chassisSize, "lg");
  assert.equal(
    selected.system.rules.find((rule) => rule.key === "ChoiceSet").selection,
    "lg",
  );
  assert.notEqual(source.system.size, "lg");
  assert.equal(
    selected.system.rules.find((rule) => rule.key === "ChoiceSet").adjustName,
    false,
  );
  assert.equal(
    selected.system.rules.find((rule) => rule.key === "CreatureSize").value,
    "{item|flags.sf2e.rulesSelections.chassisSize}",
  );
  assert.deepEqual(
    applyChassisChoices(source, entry, {
      chassisSizes: { [entry.id]: "tiny" },
    }),
    source,
  );
});
test("Манёвры и поддержка не маскируют описания под автоматические эффекты", () => {
  for (const entry of catalog.entries)
    for (const builder of [buildManeuverSource, buildSupportSource]) {
      const source = builder(entry);
      assert.deepEqual(source.system.rules, []);
      assert.match(source.system.description.value, /SFMTP.ManualActionHint/);
    }
});
test("Реальные LevelDB читаются CLI: все документы совпадают с JSON-источниками", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "sfmtp-extract-"));
  for (const [name] of definitions) {
    const output = path.join(temporary, name);
    await extractPack(path.join(root, "packs", name), output, { log: false });
    const sources = await packSources(name);
    const files = (await readdir(output)).filter((file) =>
      file.endsWith(".json"),
    );
    assert.equal(files.length, 5);
    for (const file of files) {
      const document = JSON.parse(
        await readFile(path.join(output, file), "utf8"),
      );
      delete document._key;
      assert.deepEqual(
        document,
        sources.find((source) => source._id === document._id),
      );
    }
  }
});
test("Повторная сборка сохраняет JSON, JSONL и ID; двоичный LevelDB не сравнивается", async () => {
  const before = new Map();
  const names = [...definitions.map(([name]) => name), "familiar-abilities"];
  for (const name of names)
    before.set(name, {
      sources: await packSources(name),
      legacy: await readFile(path.join(root, "packs", name + ".db"), "utf8"),
    });
  execFileSync(process.execPath, ["scripts/build-chassis-pack.mjs"], {
    cwd: root,
    stdio: "pipe",
  });
  for (const name of names) {
    assert.deepEqual(await packSources(name), before.get(name).sources);
    assert.equal(
      await readFile(path.join(root, "packs", name + ".db"), "utf8"),
      before.get(name).legacy,
    );
  }
});
test("Ключи локализации разрешаются по пути Foundry, включая @Localize в Items", async () => {
  const lookup = (object, key) =>
    key.split(".").reduce((value, part) => value?.[part], object);
  for (const language of ["en", "ru"]) {
    const translations = await json(`lang/${language}.json`);
    assert.equal(Object.keys(translations).length, 1);
    const leaves = (value, prefix = "") =>
      Object.entries(value).flatMap(([key, entry]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        return typeof entry === "string"
          ? [[fullKey, entry]]
          : leaves(entry, fullKey);
      });
    const entries = leaves(translations.SFMTP);
    assert.equal(entries.length, 355);
    for (const [key, value] of entries) {
      assert.equal(typeof value, "string");
      assert.ok(lookup(translations, `SFMTP.${key}`));
    }
    for (const entry of catalog.entries) {
      for (const build of [buildSupportSource, buildManeuverSource]) {
        const description = build(entry).system.description.value;
        for (const match of description.matchAll(/@Localize\[([^\]]+)\]/g)) {
          assert.equal(typeof lookup(translations, match[1]), "string");
          assert.ok(lookup(translations, match[1]).length > 0);
        }
      }
    }
  }
});
test("Иконки всех пяти шасси поставляются вместе с модулем", async () => {
  for (const entry of catalog.entries) {
    const item = buildChassisSource(entry);
    const prefix = "modules/sf2e-missing-tech-pets/";
    assert.ok(item.img.startsWith(prefix));
    const svg = await readFile(
      path.join(root, item.img.slice(prefix.length)),
      "utf8",
    );
    assert.match(svg, /<svg /);
    assert.match(svg, /viewBox="0 0 128 128"/);
    assert.doesNotMatch(svg, /(?:href=|<script)/);
  }
});
