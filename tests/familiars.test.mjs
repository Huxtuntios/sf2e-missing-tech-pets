// Проверки документов и mocks. Подготовка актёра и Rule Elements в Foundry не запускается.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { buildFamiliarSource } from "../scripts/familiar-sources.mjs";
import { initializeContentLocalization } from "../scripts/content-localization.mjs";
import {
  linkFamiliar,
  createFamiliar,
  linkedFamiliars,
  familiarAllowance,
  savePetProfile,
  syncFamiliarAbilities,
  setInnateFamiliarItems,
  familiarFingerprint,
  familiarCatalog,
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
      attributes: { familiarAbilities: { value: 2 } },
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
    assert.equal(Object.hasOwn(entry, "sourceUrl"), false);
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
test("Фамильяры доступны без Companion Compendia в обеих системах; права проверяются", async () => {
  const { owner, familiar } = setup();
  game.modules.get("pf2e-animal-companions").active = false;
  await syncFamiliarAbilities(owner, familiar, []);
  game.system.id = "pf2e";
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  assert.match([...familiar.items][0].source.img, /^systems\/pf2e\//);
  assert.match([...familiar.items][0].flags.core.sourceId, /\.pf2e-familiar-abilities\./);
  game.system.id = "other";
  await rejectsKey(syncFamiliarAbilities(owner, familiar, []), "SystemMismatch");
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
test("Без источника и нативного счётчика лимит нулевой, ручной override остаётся доступен", async () => {
  const { owner, familiar } = setup();
  owner.system.attributes.familiarAbilities.value = 0;
  assert.equal(familiarAllowance(owner, familiar), 0);
  await rejectsKey(syncFamiliarAbilities(owner, familiar, ["flier"]), "FamiliarLimit");
  assert.equal(familiar.writes.created, 0);
  const grant = new Item({
    name: "Familiar", type: "feat", system: {},
    flags: { core: { sourceId: "Compendium.sf2e.feats.Item.Lxp9qwru0FVWmoE7" } },
  });
  owner.items.set(grant.id, grant);
  assert.equal(familiarAllowance(owner, familiar), 2);
  await familiar.setFlag(ID, "familiarAllowance", 5);
  assert.equal(familiarAllowance(owner, familiar), 5);
  await familiar.setFlag(ID, "familiarAllowance", 0);
  assert.equal(familiarAllowance(owner, familiar), 0);
});
test("Повторная синхронизация не создаёт копии даже после добавления системных полей", async () => {
  const { owner, familiar } = setup();
  assert.deepEqual(
    await syncFamiliarAbilities(owner, familiar, ["flier", "darkvision"]),
    { created: 2, removed: 0, protected: 0 },
  );
  const ids = [...familiar.items.keys()];
  assert.deepEqual(
    await syncFamiliarAbilities(owner, familiar, [
      "flier",
      "darkvision",
      "flier",
    ]),
    { created: 0, removed: 0, protected: 0 },
  );
  assert.deepEqual([...familiar.items.keys()], ids);
  assert.equal(familiar.writes.created, 2);
  assert.deepEqual(
    await syncFamiliarAbilities(owner, familiar, ["climber", "darkvision"]),
    { created: 1, removed: 1, protected: 0 },
  );
  assert.equal(familiar.items.size, 2);
  assert.equal(familiar.writes.deleted, 1);
  assert.ok([...familiar.items].some((i) => i.system.slug === "climber"));
  assert.deepEqual(await syncFamiliarAbilities(owner, familiar, []), {
    created: 0,
    removed: 2,
    protected: 0,
  });
  assert.deepEqual(familiar.writes, { created: 3, deleted: 3 });
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
for (const count of [0, 1]) {
  test(`Отмена создания после ${count} новых Items сохраняет прежний набор`, async () => {
    const { owner, familiar } = setup();
    await syncFamiliarAbilities(owner, familiar, ["flier"]);
    const original = [...familiar.items][0];
    const snapshot = original.toObject();
    const create = familiar.createEmbeddedDocuments.bind(familiar);
    familiar.createEmbeddedDocuments = (type, sources) =>
      create(type, sources.slice(0, count));
    await rejectsKey(
      syncFamiliarAbilities(owner, familiar, ["darkvision", "climber"]),
      "FamiliarCreateIncomplete",
    );
    assert.deepEqual([...familiar.items.keys()], [original.id]);
    assert.deepEqual(original.toObject(), snapshot);
    familiar.createEmbeddedDocuments = create;
    const result = await syncFamiliarAbilities(owner, familiar, ["darkvision"]);
    assert.deepEqual(result, { created: 1, removed: 1, protected: 0 });
  });
}
test("Ошибка сохранения снимка откатывает только новый набор", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  const original = [...familiar.items][0];
  const create = familiar.createEmbeddedDocuments.bind(familiar);
  familiar.createEmbeddedDocuments = async (type, sources) => {
    const items = await create(type, sources);
    items.at(-1).setFlag = async () => {
      throw new Error("fingerprint write failed");
    };
    return items;
  };
  await assert.rejects(
    syncFamiliarAbilities(owner, familiar, ["darkvision", "climber"]),
    /fingerprint write failed/,
  );
  assert.deepEqual([...familiar.items.keys()], [original.id]);
});
test("Откат сохраняет новый Item, если пользователь успел изменить его", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  const original = [...familiar.items][0];
  const create = familiar.createEmbeddedDocuments.bind(familiar);
  let edited;
  familiar.createEmbeddedDocuments = async (type, sources) => {
    const items = await create(type, sources);
    edited = items[0];
    items.at(-1).setFlag = async () => {
      edited.source.name = "Player edit during replacement";
      throw new Error("fingerprint write failed");
    };
    return items;
  };
  await assert.rejects(
    syncFamiliarAbilities(owner, familiar, ["darkvision", "climber"]),
    /fingerprint write failed/,
  );
  assert.deepEqual([...familiar.items.keys()], [original.id, edited.id]);
  assert.equal(edited.source.name, "Player edit during replacement");
});
test("Частичное создание не удаляет одновременно добавленный вручную Item", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  const original = [...familiar.items][0];
  const create = familiar.createEmbeddedDocuments.bind(familiar);
  let manual;
  familiar.createEmbeddedDocuments = async (type, sources) => {
    const items = await create(type, sources.slice(0, 1));
    [manual] = await create(type, [
      buildFamiliarSource(catalog.entries.find((entry) => entry.id === "tough")),
    ]);
    return items;
  };
  await rejectsKey(
    syncFamiliarAbilities(owner, familiar, ["darkvision", "climber"]),
    "FamiliarCreateIncomplete",
  );
  assert.deepEqual([...familiar.items.keys()], [original.id, manual.id]);
});
test("Ошибка отката сообщает обе причины и не удаляет прежний набор", async () => {
  const { owner, familiar } = setup();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  const original = [...familiar.items][0];
  const create = familiar.createEmbeddedDocuments.bind(familiar);
  familiar.createEmbeddedDocuments = (type, sources) =>
    create(type, sources.slice(0, 1));
  familiar.deleteEmbeddedDocuments = async () => {
    throw new Error("rollback delete failed");
  };
  await assert.rejects(
    syncFamiliarAbilities(owner, familiar, ["darkvision", "climber"]),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /FamiliarRollbackFailed/);
      assert.match(error.errors[0].message, /FamiliarCreateIncomplete/);
      assert.match(error.errors[1].message, /rollback delete failed/);
      return true;
    },
  );
  assert.ok(familiar.items.has(original.id));
  assert.equal(familiar.items.size, 2);
});
test("Каталог фамильяра загружается из фактического пути модуля", async () => {
  setup();
  game.modules.set(ID, { path: "custom/modules/tech-pets" });
  let requested;
  globalThis.fetch = async (url) => {
    requested = url;
    return { ok: true, json: async () => structuredClone(catalog) };
  };
  assert.deepEqual(await familiarCatalog(), catalog.entries);
  assert.equal(requested, "custom/modules/tech-pets/data/familiar-abilities.json");
});
test("RU создаёт переведённый Item без Babele, сохраняя slug, UUID и ручные правки", async () => {
  const { owner, familiar } = setup();
  game.i18n.lang = "ru";
  const translations = JSON.parse(await readFile(path.join(root, "data/ru-content.json"), "utf8"));
  globalThis.fetch = async (url) => ({ ok: true, json: async () => structuredClone(url.endsWith("ru-content.json") ? translations : catalog) });
  await initializeContentLocalization();
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  const item = [...familiar.items][0];
  assert.equal(item.source.name, "Летун");
  assert.match(item.system.description.value, /Скорость полёта 25 футов/);
  assert.equal(item.system.slug, "flier");
  assert.equal(item.flags[ID].catalogId, "flier");
  assert.match(item.flags.core.sourceId, /\.familiar-abilities\.Item\.201b139aa03b9d91$/);
  item.source.name = "Player edited name";
  await syncFamiliarAbilities(owner, familiar, ["flier"]);
  assert.equal(item.source.name, "Player edited name");
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
