// Проверки документов и mocks. Подготовка актёра и Rule Elements в Foundry не запускается.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { buildFamiliarSource } from "../scripts/familiar-sources.mjs";
import {
  linkFamiliar,
  createFamiliar,
  linkedFamiliars,
  familiarAllowance,
  savePetProfile,
  syncFamiliarAbilities,
  setInnateFamiliarItems,
  familiarFingerprint,
} from "../scripts/familiars.mjs";
const ID = "sf2e-missing-tech-pets";
const root = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(
  await readFile(path.join(root, "data/familiar-abilities.json"), "utf8"),
);
class Collection extends Map {
  [Symbol.iterator]() {
    return this.values();
  }
}
let serial = 0;
class Item {
  constructor(source) {
    this.source = structuredClone(source);
    this.id = `item${++serial}`;
    this.source._id = this.id;
    // Имитируем дополнение отсутствующих полей схемой при создании.
    this.source.system._migration = { version: 1 };
    this.source.system.deathNote = "";
  }
  get flags() {
    return this.source.flags ?? {};
  }
  get type() {
    return this.source.type;
  }
  get system() {
    return this.source.system;
  }
  toObject() {
    return structuredClone(this.source);
  }
  async setFlag(scope, key, value) {
    this.source.flags ??= {};
    this.source.flags[scope] ??= {};
    this.source.flags[scope][key] = structuredClone(value);
  }
}
class MockActor {
  constructor(id, type = "character", master = null) {
    this.id = id;
    this.name = id;
    this.type = type;
    this.isOwner = true;
    this.level = 6;
    this.ownership = { default: 0, player: 3 };
    this.system = {
      master: { id: master, ability: "int" },
      attributes: { familiarAbilities: { value: 0 } },
    };
    this.flags = {};
    this.items = new Collection();
    this.writes = { created: 0, deleted: 0 };
  }
  getFlag(scope, key) {
    return this.flags[scope]?.[key];
  }
  async setFlag(scope, key, value) {
    this.flags[scope] ??= {};
    this.flags[scope][key] = structuredClone(value);
  }
  async update(data) {
    for (const [key, value] of Object.entries(data)) {
      const parts = key.split(".");
      let cursor = this;
      for (const part of parts.slice(0, -1)) cursor = cursor[part] ??= {};
      cursor[parts.at(-1)] = value;
    }
    return this;
  }
  async createEmbeddedDocuments(_type, sources) {
    return sources.map((source) => {
      const item = new Item(source);
      this.items.set(item.id, item);
      this.writes.created++;
      return item;
    });
  }
  async deleteEmbeddedDocuments(_type, ids) {
    for (const id of ids) {
      this.items.delete(id);
      this.writes.deleted++;
    }
  }
}
function setup() {
  const owner = new MockActor("owner"),
    familiar = new MockActor("familiar", "familiar", owner.id);
  globalThis.game = {
    system: { id: "sf2e" },
    modules: new Map([["pf2e-animal-companions", { active: true }]]),
    actors: new Collection([
      [owner.id, owner],
      [familiar.id, familiar],
    ]),
    i18n: { localize: (key) => key },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => structuredClone(catalog),
  });
  globalThis.Actor = { create: async (data) => data };
  return { owner, familiar };
}
const rejectsKey = (promise, key) => assert.rejects(promise, new RegExp(key));
test("38 полных SF2e Action Items с неизменяемыми уникальными ID и источниками", () => {
  assert.equal(catalog.entries.length, 38);
  assert.equal(new Set(catalog.entries.map((e) => e.itemId)).size, 38);
  for (const entry of catalog.entries) {
    assert.ok(entry.description.length > 20);
    assert.ok(
      entry.sourceUrl.startsWith("https://2e.aonsrd.com/familiars/abilities/"),
    );
    const source = buildFamiliarSource(entry);
    assert.equal(
      source._id,
      createHash("sha256")
        .update(`${ID}:familiar:${entry.id}`)
        .digest("hex")
        .slice(0, 16),
    );
    assert.equal(source.type, "action");
    assert.equal(source.system.category, "familiar");
    assert.equal(source.system.slug, entry.id);
    assert.equal(
      source.flags.core.sourceId,
      `Compendium.${ID}.familiar-abilities.Item.${entry.itemId}`,
    );
    assert.doesNotMatch(
      JSON.stringify(source),
      /systems\/pf2e|flags\.pf2e|Compendium\.pf2e\./,
    );
    if (entry.automation === "manual")
      assert.deepEqual(source.system.rules, []);
  }
  assert.equal(
    catalog.entries.filter((e) => e.automation === "rules").length,
    10,
  );
});
test("В Rule Elements только сверенные пассивные схемы; стоимость Familiar Focus — 2 действия", () => {
  for (const e of catalog.entries)
    for (const rule of e.rules)
      assert.ok(
        ["BaseSpeed", "Sense", "FlatModifier", "ActorTraits"].includes(
          rule.key,
        ),
      );
  assert.equal(
    buildFamiliarSource(catalog.entries.find((e) => e.id === "familiar-focus"))
      .system.actions.value,
    2,
  );
  assert.match(
    catalog.entries.find((e) => e.id === "vital-bond").description,
    /Transfer Vitality/,
  );
  assert.doesNotMatch(
    catalog.entries.find((e) => e.id === "spell-delivery").description,
    /Vital Bond/,
  );
});
test("38 LevelDB документов совпадают с JSONL, фабрикой и редактируемыми источниками", async () => {
  const output = await mkdtemp(path.join(tmpdir(), "sfmtp-familiars-"));
  await extractPack(path.join(root, "packs/familiar-abilities"), output, {
    log: false,
  });
  const files = (await readdir(output)).filter((file) =>
    file.endsWith(".json"),
  );
  assert.equal(files.length, 38);
  const jsonl = (
    await readFile(path.join(root, "packs/familiar-abilities.db"), "utf8")
  )
    .trim()
    .split("\n")
    .map(JSON.parse);
  for (const file of files) {
    const source = JSON.parse(await readFile(path.join(output, file), "utf8"));
    delete source._key;
    const entry = catalog.entries.find((e) => e.itemId === source._id);
    assert.deepEqual(source, buildFamiliarSource(entry));
    assert.deepEqual(
      source,
      jsonl.find((e) => e._id === source._id),
    );
    assert.deepEqual(
      source,
      JSON.parse(
        await readFile(
          path.join(root, "packs/src/familiar-abilities", entry.id + ".json"),
          "utf8",
        ),
      ),
    );
  }
});
test("Используется нативная связь system.master; роботы и другие владельцы не подменяются", async () => {
  const { owner, familiar } = setup();
  await linkFamiliar(owner, familiar, "wis");
  assert.equal(familiar.system.master.ability, "wis");
  assert.equal(linkedFamiliars(owner).length, 1);
  const other = new MockActor("other");
  game.actors.set(other.id, other);
  await rejectsKey(linkFamiliar(other, familiar), "FamiliarOccupied");
  await rejectsKey(
    linkFamiliar(owner, new MockActor("robot")),
    "FamiliarAccess",
  );
  await rejectsKey(linkFamiliar(owner, familiar, "invalid"), "FamiliarAccess");
});
test("Создаётся Actor familiar с правами владельца, а не character с параллельными формулами", async () => {
  const { owner, familiar } = setup();
  game.actors.delete(familiar.id);
  const source = await createFamiliar(owner, "cha");
  assert.equal(source.type, "familiar");
  assert.deepEqual(source.system, { master: { id: owner.id, ability: "cha" } });
  assert.deepEqual(source.ownership, owner.ownership);
});
test("Нельзя создавать дубликат фамильяра или связывать второго незаметно", async () => {
  const { owner } = setup();
  await rejectsKey(createFamiliar(owner), "FamiliarAmbiguous");
  const other = new MockActor("second", "familiar");
  game.actors.set(other.id, other);
  await rejectsKey(linkFamiliar(owner, other), "FamiliarAmbiguous");
});
test("Обязательная зависимость, система и права проверяются при каждой операции", async () => {
  const { owner, familiar } = setup();
  game.modules.get("pf2e-animal-companions").active = false;
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, []),
    "DependencyMissing",
  );
  game.modules.get("pf2e-animal-companions").active = true;
  game.system.id = "pf2e";
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, []),
    "DependencyMissing",
  );
  game.system.id = "sf2e";
  familiar.isOwner = false;
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, []),
    "FamiliarAccess",
  );
});
test("Лимит 2, нативные дополнительные способности и явный лимит различаются", async () => {
  const { owner, familiar } = setup();
  assert.equal(familiarAllowance(owner, familiar), 2);
  owner.system.attributes.familiarAbilities.value = 4;
  assert.equal(familiarAllowance(owner, familiar), 4);
  await familiar.setFlag(ID, "familiarAllowance", 3);
  assert.equal(familiarAllowance(owner, familiar), 3);
});
test("Повторная синхронизация не создаёт копии даже после добавления системных полей", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier", "darkvision"]);
  const ids = [...familiar.items.keys()];
  await syncFamiliarAbilities(owner, familiar, [
    "flier",
    "darkvision",
    "flier",
  ]);
  assert.deepEqual([...familiar.items.keys()], ids);
  assert.equal(familiar.writes.created, 2);
  await syncFamiliarAbilities(owner, familiar, ["climber", "darkvision"]);
  assert.equal(familiar.items.size, 2);
  assert.equal(familiar.writes.deleted, 1);
  assert.ok([...familiar.items].some((i) => i.system.slug === "climber"));
});
test("Две параллельные записи последовательно меняют набор без дубликатов", async () => {
  const { owner, familiar } = setup();
  await Promise.all([
    syncFamiliarAbilities(owner, familiar, ["flier"]),
    syncFamiliarAbilities(owner, familiar, ["darkvision"]),
  ]);
  assert.equal(familiar.items.size, 1);
  assert.equal([...familiar.items][0].system.slug, "darkvision");
});
test("Превышение лимита и неизвестные записи не изменяют предметы", async () => {
  const { owner, familiar } = setup();
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, ["flier", "darkvision", "tough"]),
    "FamiliarLimit",
  );
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, ["invented"]),
    "FamiliarSelectionInvalid",
  );
  assert.equal(familiar.writes.created, 0);
});
test("Tough/Construct и другие prerequisites проверяются до записи", async () => {
  const { owner, familiar } = setup();
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, ["construct"]),
    "FamiliarPrerequisites",
  );
  await syncFamiliarAbilities(owner, familiar, ["tough", "construct"]);
  assert.equal(familiar.items.size, 2);
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, ["masters-form"]),
    "FamiliarPrerequisites",
  );
});
test("Врождённая способность остаётся и занимает место ежедневного набора", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  const item = [...familiar.items][0];
  await setInnateFamiliarItems(familiar, [item.id]);
  await syncFamiliarAbilities(owner, familiar, ["darkvision"]);
  assert.equal(familiar.items.size, 2);
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, ["darkvision", "tough"]),
    "FamiliarLimit",
  );
  assert.ok(familiar.items.has(item.id));
});
test("Изменённые и вручную добавленные Items не удаляются и не дублируются", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  const edited = [...familiar.items][0];
  edited.source.name = "Player edited Flier";
  await syncFamiliarAbilities(owner, familiar, []);
  assert.ok(familiar.items.has(edited.id));
  const source = buildFamiliarSource(
    catalog.entries.find((e) => e.id === "tough"),
  );
  await familiar.createEmbeddedDocuments("Item", [source]);
  await syncFamiliarAbilities(owner, familiar, ["flier", "tough"]);
  assert.equal(familiar.items.size, 2);
});
test("Отказ загрузки источника и неправильная связь ничего не очищают", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  globalThis.fetch = async () => ({ ok: false });
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, []),
    "FamiliarCatalogMissing",
  );
  assert.equal(familiar.items.size, 1);
  familiar.system.master.id = "someone-else";
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, []),
    "FamiliarAccess",
  );
  assert.equal(familiar.items.size, 1);
});
test("Ошибка создания нового набора не удаляет действовавший", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  familiar.createEmbeddedDocuments = async () => {
    throw new Error("write failed");
  };
  await assert.rejects(
    syncFamiliarAbilities(owner, familiar, ["darkvision"]),
    /write failed/,
  );
  assert.equal(familiar.items.size, 1);
});
test("Старая роботизированная конфигурация не переписывается новой панелью", async () => {
  const { owner, familiar } = setup();
  const old = {
    chassisCatalogId: "tank-chassis",
    familiarAbilities: [{ catalogId: "tough", name: "Old note" }],
  };
  await owner.setFlag(ID, "robot", old);
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  assert.deepEqual(owner.getFlag(ID, "robot"), old);
});
test("Невалидная отметка врождённой способности отклоняется", async () => {
  const { familiar } = setup();
  await rejectsKey(
    setInnateFamiliarItems(familiar, ["unknown"]),
    "FamiliarSelectionInvalid",
  );
});

test("Pet-профиль принимает только две Pet-способности, не создаёт Items и сохраняет неизвестные поля", async () => {
  const { owner, familiar } = setup();
  familiar.system.master.id = null;
  await owner.setFlag(ID, "petProfile", { customNote: "keep" });
  await savePetProfile(owner, {
    enabled: true,
    name: "Pet",
    abilities: ["flier", "darkvision"],
  });
  assert.equal(owner.getFlag(ID, "petProfile").customNote, "keep");
  assert.equal(owner.items.size, 0);
  await assert.rejects(
    savePetProfile(owner, { enabled: true, abilities: ["flier", "flier"] }),
  );
  await assert.rejects(
    savePetProfile(owner, {
      enabled: true,
      abilities: ["flier", "accompanist"],
    }),
  );
  assert.deepEqual(owner.getFlag(ID, "petProfile").abilities, [
    "flier",
    "darkvision",
  ]);
  familiar.system.master.id = owner.id;
  await assert.rejects(
    savePetProfile(owner, {
      enabled: true,
      abilities: ["flier", "darkvision"],
    }),
  );
  await savePetProfile(owner, {
    enabled: false,
    abilities: ["flier", "darkvision"],
  });
  assert.equal(owner.getFlag(ID, "petProfile").enabled, false);
});
