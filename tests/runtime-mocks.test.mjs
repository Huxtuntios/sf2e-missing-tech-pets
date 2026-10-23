// Это mocks, а не запуск Foundry: проверяется реальный код модуля с подменой API документов.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, createContext } from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ID = "sf2e-missing-tech-pets";
const DEP = "pf2e-animal-companions";
const clone = (value) => structuredClone(value);
function merge(a, b) {
  for (const [key, value] of Object.entries(b)) {
    if (value && typeof value === "object" && !Array.isArray(value))
      a[key] = merge(a[key] && typeof a[key] === "object" ? a[key] : {}, value);
    else a[key] = clone(value);
  }
  return a;
}
class Collection extends Map {
  [Symbol.iterator]() {
    return this.values();
  }
  get contents() {
    return [...this.values()];
  }
  filter(fn) {
    return this.contents.filter(fn);
  }
  find(fn) {
    return this.contents.find(fn);
  }
  map(fn) {
    return this.contents.map(fn);
  }
}
let counter = 0;
class Item {
  constructor(source, parent = null, pack = "") {
    this.source = clone(source);
    this.source._id ??= "item" + ++counter;
    this.parent = parent;
    this.pack = pack;
  }
  get id() {
    return this.source._id;
  }
  get name() {
    return this.source.name;
  }
  get type() {
    return this.source.type;
  }
  get img() {
    return this.source.img;
  }
  get system() {
    return this.source.system;
  }
  get flags() {
    return this.source.flags ?? {};
  }
  get uuid() {
    return this.pack
      ? `Compendium.${this.pack}.Item.${this.id}`
      : `Actor.${this.parent?.id}.Item.${this.id}`;
  }
  getFlag(scope, key) {
    return this.flags[scope]?.[key];
  }
  async setFlag(scope, key, value) {
    this.source.flags ??= {};
    this.source.flags[scope] ??= {};
    this.source.flags[scope][key] = clone(value);
    return this;
  }
  toObject() {
    return clone(this.source);
  }
}
class Actor {
  constructor(id, robot = {}) {
    this.id = id;
    this.name = id;
    this.type = "character";
    this.isOwner = true;
    this.flags = { [ID]: { robot: clone(robot) } };
    this.items = new Collection();
    this.writes = { created: 0, updated: 0, deleted: 0 };
  }
  getFlag(scope, key) {
    return this.flags[scope]?.[key];
  }
  async setFlag(scope, key, value) {
    this.flags[scope] ??= {};
    this.flags[scope][key] = clone(value);
    return this;
  }
  async createEmbeddedDocuments(_type, sources) {
    return sources.map((source) => {
      const item = new Item(source, this);
      this.items.set(item.id, item);
      this.writes.created++;
      return item;
    });
  }
  async updateEmbeddedDocuments(_type, sources) {
    return sources.map((source) => {
      const item = this.items.get(source._id);
      merge(item.source, source);
      this.writes.updated++;
      return item;
    });
  }
  async deleteEmbeddedDocuments(_type, ids) {
    for (const id of ids) {
      this.items.delete(id);
      this.writes.deleted++;
    }
    return ids;
  }
}
function pack(collection, sources, system = "sf2e") {
  const docs = sources.map((source) => new Item(source, null, collection));
  return {
    collection,
    documentName: "Item",
    metadata: { system },
    getIndex: async () =>
      docs.map((item) => ({ ...item.toObject(), _id: item.id })),
    getDocument: async (id) => docs.find((item) => item.id === id),
  };
}
async function harness({
  active = true,
  system = "sf2e",
  language = "en",
  nativeLocalization = true,
} = {}) {
  const once = new Map(),
    hooks = new Map(),
    notifications = [];
  const packs = new Collection();
  for (const name of [
    "robot-chassis",
    "robot-advanced-maneuvers",
    "robot-support",
    "robot-customizations",
  ]) {
    const sources = (
      await readFile(path.join(root, "packs", name + ".db"), "utf8")
    )
      .trim()
      .split("\n")
      .map(JSON.parse);
    packs.set(ID + "." + name, pack(ID + "." + name, sources));
  }
  const manifest = JSON.parse(
    await readFile(
      path.join(root, "tests/fixtures/companion-manifest.json"),
      "utf8",
    ),
  );
  for (const data of manifest.packs.filter((p) => p.name.startsWith("sf-AC-")))
    packs.set(DEP + "." + data.name, pack(DEP + "." + data.name, []));
  packs.set(
    DEP + ".sf-AC-Features",
    pack(DEP + ".sf-AC-Features", [
      JSON.parse(
        await readFile(
          path.join(root, "tests/fixtures/companion-class.json"),
          "utf8",
        ),
      ),
    ]),
  );
  const settings = new Map();
  const settingsConfigs = new Map();
  const settingsMenus = new Map();
  const dialogs = [];
  const game = {
    system: { id: system },
    user: { id: "user", isGM: true },
    actors: new Collection(),
    packs,
    modules: new Map([
      [ID, { path: root }],
      [DEP, { active }],
    ]),
    i18n: {
      lang: language,
      translations: {},
      localize(key) {
        return nativeLocalization
          ? (key
              .split(".")
              .reduce((value, part) => value?.[part], this.translations) ?? key)
          : key;
      },
    },
    settings: {
      registerMenu: (_scope, key, config) => settingsMenus.set(key, config),
      register: (_scope, key, config) => {
        settingsConfigs.set(key, config);
        settings.set(key, config.default);
      },
      get: (_scope, key) => settings.get(key),
      set: async (_scope, key, value) => settings.set(key, value),
    },
  };
  class FakeDialog {
    constructor(config) {
      this.config = config;
      dialogs.push(config);
    }
    render() {
      return this;
    }
    _onRender() {}
    async close() {}
  }
  const context = createContext({
    game,
    console: { info() {}, warn() {}, error() {}, debug() {} },
    structuredClone,
    JSON,
    Date,
    Promise,
    Map,
    Set,
    Number,
    String,
    Array,
    Object,
    RegExp,
    Math,
    foundry: {
      utils: {
        deepClone: clone,
        mergeObject: (a, b) => merge(clone(a), b),
        escapeHTML: (s) => String(s),
        randomID: () => `random${++counter}`,
      },
      applications: { api: { DialogV2: FakeDialog } },
    },
    Hooks: {
      once: (key, fn) => once.set(key, fn),
      on: (key, fn) => hooks.set(key, fn),
    },
    ui: {
      notifications: Object.fromEntries(
        ["info", "warn", "error"].map((type) => [
          type,
          (msg) => notifications.push({ type, msg }),
        ]),
      ),
    },
    canvas: { tokens: { controlled: [] } },
    fetch: async (url) => {
      if (url.startsWith(`modules/${ID}/`))
        url = path.join(root, url.slice(`modules/${ID}/`.length));
      try {
        return {
          ok: true,
          json: async () => JSON.parse(await readFile(url, "utf8")),
        };
      } catch {
        return { ok: false, status: 404 };
      }
    },
  });
  const modules = new Map();
  async function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    let code = await readFile(filename, "utf8");
    if (filename.endsWith("/main.mjs"))
      code +=
        "\nglobalThis.subject={isCompatibleItemPack,missingCompanionPacks,handleCompanionBuildItem,syncAutomation,generatedItemsForController,cleanupPreviousCompanion,findSourceItem,itemFingerprint,canReplaceManagedItem,validLink,getRobotData,openCompanionSources,openCuratedCatalog};";
    const module = new SourceTextModule(code, {
      context,
      identifier: filename,
    });
    modules.set(filename, module);
    return module;
  }
  const module = await load(path.join(root, "scripts/main.mjs"));
  // Граф связывает сам vm: вложенный link ломает общие зависимости при новом окне.
  await module.link((specifier, ref) =>
    load(path.resolve(path.dirname(ref.identifier), specifier)),
  );
  await module.evaluate();
  once.get("init")();
  await once.get("ready")();
  return {
    game,
    packs,
    hooks,
    notifications,
    settings,
    settingsConfigs,
    settingsMenus,
    dialogs,
    subject: context.subject,
    api: game.modules.get(ID).api,
  };
}
async function pair(h, extra = {}) {
  const owner = new Actor("owner", {
    companionActorId: "robot",
    chassisCatalogId: "agile-chassis",
    ...extra,
  });
  const robot = new Actor("robot", { ownerActorId: "owner" });
  h.game.actors.set(owner.id, owner);
  h.game.actors.set(robot.id, robot);
  return { owner, robot };
}

test("Без зависимости или в PF2e API и интеграция не запускаются", async () => {
  for (const options of [{ active: false }, { system: "pf2e" }]) {
    const h = await harness(options);
    assert.equal(h.api, undefined);
    assert.equal(h.hooks.has("createItem"), false);
    assert.ok(h.notifications.some((n) => n.type === "error"));
  }
});
test("API сохраняет все исходные методы и добавляет linkActors", async () => {
  const { api } = await harness();
  for (const key of [
    "open",
    "searchFamiliarItems",
    "getRobotData",
    "setRobotData",
    "getModificationSlots",
    "getLinkedCompanion",
    "resolveImportTarget",
    "addCompendiumItem",
    "syncAutomation",
    "registerSlotGrant",
    "openPack",
    "linkActors",
  ])
    assert.equal(typeof api[key], "function");
});
test("Все 11 SF-паков проверяются отдельно", async () => {
  const h = await harness();
  assert.equal(h.subject.missingCompanionPacks().length, 0);
  for (const p of [...h.packs].filter((p) => p.collection.startsWith(DEP))) {
    h.packs.delete(p.collection);
    assert.deepEqual(Array.from(h.subject.missingCompanionPacks()), [
      p.collection.slice(DEP.length + 1),
    ]);
    h.packs.set(p.collection, p);
  }
});
test("PF2e, чужая система и неопределённый сторонний пак исключаются", async () => {
  const h = await harness();
  for (const p of [
    pack("pf2e.feats", []),
    pack(DEP + ".AC-Feats", []),
    pack("unknown.items", [], "pf2e"),
    pack("unknown.items", [], ""),
  ])
    assert.equal(h.subject.isCompatibleItemPack(p), false);
  assert.equal(
    h.subject.isCompatibleItemPack(pack(DEP + ".sf-AC-Feats", [])),
    true,
  );
});
test("Повторная и параллельная синхронизация сохраняют ID без записей Items", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, { gradeLimit: "advanced" });
  await h.api.syncAutomation(owner);
  assert.equal(robot.items.size, 3);
  const ids = robot.items.map((i) => i.id),
    writes = clone(robot.writes);
  await Promise.all([h.api.syncAutomation(owner), h.api.syncAutomation(owner)]);
  assert.deepEqual(
    robot.items.map((i) => i.id),
    ids,
  );
  assert.deepEqual(robot.writes, writes);
});
test("Смена шасси обновляет ancestry на месте, меняет только связанные действия", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, { gradeLimit: "advanced" });
  await h.api.syncAutomation(owner);
  const ancestry = robot.items.find((i) => i.type === "ancestry");
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    chassisCatalogId: "tank-chassis",
    chassis: "",
  });
  await h.api.syncAutomation(owner);
  assert.equal(robot.items.find((i) => i.type === "ancestry").id, ancestry.id);
  assert.equal(robot.items.size, 3);
  assert.ok(robot.items.find((i) => i.system.slug === "ram-slam"));
});
test("Ступень Commercial не выдаёт продвинутый манёвр", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  await h.api.syncAutomation(owner);
  assert.equal(robot.items.size, 2);
  assert.ok(!robot.items.find((i) => i.system.slug === "surgical-strike"));
});
test("Изменённые пользователем и старые предметы не перезаписываются", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, { gradeLimit: "advanced" });
  await h.api.syncAutomation(owner);
  const ancestry = robot.items.find((i) => i.type === "ancestry");
  ancestry.source.name = "Моё шасси";
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    chassisCatalogId: "tank-chassis",
  });
  await h.api.syncAutomation(owner);
  assert.equal(ancestry.name, "Моё шасси");
  assert.equal(robot.items.size, 3);
  assert.ok(
    h.notifications.some(
      (n) => n.msg === h.game.i18n.localize("SFMTP.ProtectedItems"),
    ),
  );
});
test("Конфликтующее ancestry не удаляется и не получает чужие манёвры", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, { gradeLimit: "advanced" });
  await robot.createEmbeddedDocuments("Item", [
    {
      name: "Чужое происхождение",
      type: "ancestry",
      system: { slug: "other" },
    },
  ]);
  await h.api.syncAutomation(owner);
  assert.equal(robot.items.size, 1);
});
test("Ручной манёвр не дублируется и не удаляется при смене шасси", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, { gradeLimit: "advanced" });
  const [manual] = await robot.createEmbeddedDocuments("Item", [
    {
      name: "Surgical Strike",
      type: "action",
      system: { slug: "surgical-strike" },
    },
  ]);
  await h.api.syncAutomation(owner);
  assert.equal(
    robot.items.filter((i) => i.system.slug === "surgical-strike").length,
    1,
  );
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    chassisCatalogId: "tank-chassis",
  });
  await h.api.syncAutomation(owner);
  assert.ok(robot.items.has(manual.id));
});
test("Разорванная/неправильная связь обрабатывает прежнего компаньона и статус", async () => {
  for (const kind of ["missing", "npc"]) {
    const h = await harness(),
      { owner, robot } = await pair(h);
    await h.api.syncAutomation(owner);
    const next = new Actor("next");
    next.type = "npc";
    if (kind === "npc") h.game.actors.set("next", next);
    await owner.setFlag(ID, "robot", {
      ...h.api.getRobotData(owner),
      companionActorId: kind === "npc" ? "next" : "gone",
    });
    const result = await h.api.syncAutomation(owner);
    assert.equal(result.applied, 0);
    assert.equal(robot.items.size, 0);
    assert.equal(owner.getFlag(ID, "lastAutomationSync").companionActorId, "");
  }
});
test("Предметы другого controllerActorId и ручные Items сохраняются при очистке", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  const [other] = await robot.createEmbeddedDocuments("Item", [
    {
      name: "Other",
      type: "action",
      system: {},
      flags: {
        [ID]: {
          automationSource: {
            key: "sfmtp-generated:x",
            controllerActorId: "someone",
            fingerprint: "other",
          },
        },
      },
    },
  ]);
  await h.api.syncAutomation(owner);
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    companionActorId: "",
  });
  await h.api.syncAutomation(owner);
  assert.ok(robot.items.has(other.id));
  assert.equal(robot.items.size, 1);
});
test("Отсутствующий источник кастомизации оставляет запись и старый Item", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [
        { id: "custom", catalogId: "custom", name: "Custom", cost: 1 },
      ],
    });
  const source = {
    _id: "source",
    name: "Custom",
    type: "feat",
    system: { slug: "custom", rules: [] },
  };
  h.packs.set("sf2e.feats", pack("sf2e.feats", [source]));
  await h.api.syncAutomation(owner);
  const old = robot.items.find((i) => i.system.slug === "custom");
  h.packs.delete("sf2e.feats");
  await h.api.syncAutomation(owner);
  assert.ok(robot.items.has(old.id));
  assert.equal(h.api.getRobotData(owner).modifications.length, 1);
});
test("Общий customization не даёт слот; дубли и правило+флаг не суммируются", async () => {
  const h = await harness(),
    { owner } = await pair(h);
  await h.api.registerSlotGrant("customization", 3);
  await h.api.registerSlotGrant("exact-feat", 1);
  await owner.createEmbeddedDocuments("Item", [
    { name: "Generic", type: "feat", system: { slug: "customization" } },
    {
      name: "Grant",
      type: "feat",
      system: { slug: "exact-feat" },
      flags: { core: { sourceId: "same" }, [ID]: { modificationSlots: 1 } },
    },
    {
      name: "Duplicate",
      type: "feat",
      system: { slug: "exact-feat" },
      flags: { core: { sourceId: "same" } },
    },
  ]);
  assert.equal(h.api.getModificationSlots(owner).bonus, 1);
});
test("Ручные записи не превращаются в механику; лишние слоты пропускаются", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [
        { id: "manual", name: "Manual", manual: true, cost: 1 },
        { id: "over", catalogId: "over", name: "Over", cost: 2 },
      ],
    });
  const result = await h.api.syncAutomation(owner);
  assert.equal(result.skipped, 2);
  assert.equal(robot.items.size, 2);
  assert.equal(h.api.getRobotData(owner).modifications.length, 2);
});
test("Нативный drag-and-drop распознаёт sourceId, повтор не дублирует Items", async () => {
  const h = await harness();
  const robot = new Actor("robot");
  h.game.actors.set("robot", robot);
  const document = await h.packs
    .get(ID + ".robot-chassis")
    .getDocument("665ae48461a79f96");
  const source = document.toObject();
  source.flags.core = { sourceId: document.uuid };
  const [item] = await robot.createEmbeddedDocuments("Item", [source]);
  await h.subject.handleCompanionBuildItem(item);
  const ids = robot.items.map((i) => i.id);
  await h.subject.handleCompanionBuildItem(item);
  assert.deepEqual(
    robot.items.map((i) => i.id),
    ids,
  );
  assert.equal(h.api.getRobotData(robot).standaloneCompanion, true);
  assert.equal(h.api.getRobotData(robot).companionActorId, "");
});
test("Связь запрещает self/cycle и занятого компаньона", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  assert.equal(h.subject.validLink(owner, owner), false);
  assert.equal(h.subject.validLink(robot, owner), false);
  const other = new Actor("other");
  h.game.actors.set(other.id, other);
  assert.equal(await h.api.linkActors(other, robot), false);
  assert.equal(h.api.getRobotData(robot).ownerActorId, "owner");
});
test("Импорт ancestry идёт компаньону, повтор и другое ancestry блокируются", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  const source = new Item(
    {
      _id: "ancestry",
      name: "Example",
      type: "ancestry",
      system: { slug: "example" },
    },
    null,
    DEP + ".sf-AC-Ancestries-and-Class",
  );
  await h.api.addCompendiumItem(owner, source);
  assert.equal(owner.items.size, 0);
  assert.equal(robot.items.size, 1);
  assert.equal(robot.items.contents[0].flags.core.sourceId, source.uuid);
  assert.equal(await h.api.addCompendiumItem(owner, source), null);
});
test("Точный slug во втором паке имеет приоритет над именем в первом", async () => {
  const h = await harness();
  h.packs.set(
    "aaa.items",
    pack("aaa.items", [
      {
        _id: "name",
        name: "Chosen",
        type: "feat",
        system: { slug: "different", rules: [] },
      },
    ]),
  );
  h.packs.set(
    "zzz.items",
    pack("zzz.items", [
      {
        _id: "slug",
        name: "Other name",
        type: "feat",
        system: { slug: "chosen", rules: [] },
      },
    ]),
  );
  const result = await h.subject.findSourceItem({
    catalogId: "chosen",
    name: "Chosen",
    expectedType: "feat",
  });
  assert.equal(result.document.id, "slug");
});

test("Шасси другого контроллера не получает второе ancestry", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  await robot.createEmbeddedDocuments("Item", [
    {
      name: "Другой робот",
      type: "ancestry",
      system: { slug: "other" },
      flags: {
        [ID]: {
          automationSource: {
            key: "sfmtp-generated:robot-chassis:other",
            kind: "robot-chassis",
            controllerActorId: "other",
          },
        },
      },
    },
  ]);
  await h.api.syncAutomation(owner);
  assert.equal(robot.items.size, 1);
});
test("Старое шасси без снимка сохраняется при смене выбора", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  await h.api.syncAutomation(owner);
  const chassis = robot.items.find((i) => i.type === "ancestry");
  delete chassis.source.flags[ID].automationSource.fingerprint;
  const before = chassis.toObject();
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    chassisCatalogId: "tank-chassis",
  });
  await h.api.syncAutomation(owner);
  assert.deepEqual(chassis.toObject(), before);
  assert.equal(robot.items.filter((i) => i.type === "ancestry").length, 1);
});
test("Старые записи без controller распознаются лишь при подтверждённом lastAutomationSync", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  const [legacy] = await robot.createEmbeddedDocuments("Item", [
    {
      name: "Legacy",
      type: "action",
      system: {},
      flags: { [ID]: { automationSource: { key: "sfmtp-generated:old" } } },
    },
  ]);
  assert.equal(
    h.subject.generatedItemsForController(robot, owner.id).length,
    0,
  );
  assert.equal(
    h.subject.generatedItemsForController(robot, owner.id, {
      allowLegacy: true,
    }).length,
    1,
  );
  await owner.setFlag(ID, "lastAutomationSync", { companionActorId: robot.id });
  await h.subject.cleanupPreviousCompanion(owner, "");
  assert.ok(robot.items.has(legacy.id));
});
test("Недоступный собственный пак использует локальные источники, но требует зависимость", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, { gradeLimit: "advanced" });
  for (const name of [
    "robot-chassis",
    "robot-advanced-maneuvers",
    "robot-support",
  ])
    h.packs.delete(ID + "." + name);
  await h.api.syncAutomation(owner);
  assert.equal(robot.items.size, 3);
  h.game.modules.get(DEP).active = false;
  const before = clone(robot.writes);
  await h.api.syncAutomation(owner);
  assert.deepEqual(robot.writes, before);
});
test("Сохранённый размер и выбор Imitator сохраняются при повторной синхронизации", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      chassisCatalogId: "tank-chassis",
      chassisSizes: { "tank-chassis": "lg" },
    });
  await h.api.syncAutomation(owner);
  assert.equal(
    robot.items.find((i) => i.type === "ancestry").flags.sf2e.rulesSelections
      .chassisSize,
    "lg",
  );
  const data = h.api.getRobotData(owner);
  data.chassisCatalogId = "imitator-chassis";
  data.imitation = {
    sourceUuid: "Compendium.sf2e.ancestries.Item.example",
    sourceName: "Example",
    size: "sm",
    speeds: { land: 25, climb: 20 },
    attack: { name: "Claw", damageType: "slashing" },
  };
  await owner.setFlag(ID, "robot", data);
  await h.api.syncAutomation(owner);
  const chassis = robot.items.find((i) => i.type === "ancestry"),
    before = chassis.toObject();
  assert.equal(
    chassis.system.rules.find((r) => r.key === "Strike").damage.base.die,
    "d4",
  );
  await h.api.syncAutomation(owner);
  assert.deepEqual(chassis.toObject(), before);
  assert.equal(robot.writes.updated, 1);
  assert.equal(h.api.getRobotData(owner).imitation.sourceName, "Example");
});
test("Импорт отклоняет PF2e UUID и неизвестный Rule Element", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  h.game.pf2e = { RuleElements: { all: { Strike: {} } } };
  for (const rules of [
    [{ key: "GrantItem", uuid: "Compendium.pf2e.feats.Item.bad" }],
    [{ key: "InventedRule" }],
  ]) {
    const item = new Item(
      { _id: "bad", name: "Bad", type: "feat", system: { slug: "bad", rules } },
      null,
      DEP + ".sf-AC-Feats",
    );
    await h.api.addCompendiumItem(owner, item);
  }
  assert.equal(robot.items.size, 0);
  assert.equal(
    h.notifications.filter(
      (n) => n.msg === h.game.i18n.localize("SFMTP.IncompatibleSource"),
    ).length,
    2,
  );
});
test("API setRobotData поддерживает обратную связь и запрещает self-link", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  assert.equal(
    await h.api.setRobotData(owner, {
      ...h.api.getRobotData(owner),
      companionActorId: owner.id,
    }),
    null,
  );
  await h.api.setRobotData(owner, {
    ...h.api.getRobotData(owner),
    companionActorId: "",
  });
  assert.equal(h.api.getRobotData(robot).ownerActorId, "");
  await h.api.setRobotData(owner, {
    ...h.api.getRobotData(owner),
    companionActorId: robot.id,
  });
  assert.equal(h.api.getRobotData(robot).ownerActorId, owner.id);
});
test("Инструменты зарегистрированы в настройках, хедеры листов не расширяются", async () => {
  const h = await harness();
  assert.equal(h.hooks.has("getActorSheetHeaderButtons"), false);
  assert.equal(h.hooks.has("getHeaderControlsActorSheetV2"), false);
  const menu = h.settingsMenus.get("tools");
  assert.equal(menu.restricted, false);
  assert.equal(h.game.i18n.localize(menu.name), "Tech Pets tools");
  assert.equal(typeof menu.type, "function");
  assert.equal(typeof h.hooks.get("renderActorSheetPF2e"), "function");
  assert.equal(typeof h.hooks.get("renderABCPicker"), "function");
});
test("Недоступный базовый класс не создаёт неполное шасси и сохраняет прежние Items", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, { gradeLimit: "advanced" });
  await h.api.syncAutomation(owner);
  const ids = robot.items.map((i) => i.id);
  h.packs.delete(DEP + ".sf-AC-Features");
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    chassisCatalogId: "tank-chassis",
  });
  await h.api.syncAutomation(owner);
  assert.deepEqual(
    robot.items.map((i) => i.id),
    ids,
  );
  assert.ok(
    h.notifications.some(
      (n) => n.msg === h.game.i18n.localize("SFMTP.CompanionClassMissing"),
    ),
  );
});

test("Способности фамильяра импортируются на native familiar, не character-робота", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h);
  const familiar = new Actor("familiar");
  familiar.type = "familiar";
  familiar.system = { master: { id: owner.id } };
  h.game.actors.set(familiar.id, familiar);
  const source = new Item({
    name: "Flier",
    type: "action",
    system: { slug: "flier", category: "familiar", rules: [] },
    flags: { [ID]: { familiarAbility: true } },
  });
  assert.equal(h.api.resolveImportTarget(owner, source).id, familiar.id);
  const result = await h.api.addCompendiumItem(owner, source);
  assert.equal(result.target.id, familiar.id);
  assert.equal(familiar.items.size, 1);
  assert.equal(robot.items.size, 0);
  h.game.actors.delete(familiar.id);
  assert.equal(h.api.resolveImportTarget(owner, source), null);
});

test("Старые familiar-записи не применяются к роботу повторно; прежний Item сохраняется", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      familiarAbilities: [
        { id: "old", catalogId: "tough", name: "Tough", category: "pet" },
      ],
    });
  const source = {
    name: "Tough",
    type: "action",
    system: { slug: "tough", category: "familiar", rules: [] },
    flags: {
      [ID]: {
        automationSource: {
          key: "sfmtp-generated:familiar-ability:tough",
          kind: "familiar-ability",
          catalogId: "tough",
          controllerActorId: owner.id,
        },
      },
    },
  };
  const [old] = await robot.createEmbeddedDocuments("Item", [source]);
  await old.setFlag(ID, "automationSource", {
    ...old.getFlag(ID, "automationSource"),
    fingerprint: h.subject.itemFingerprint(old.toObject()),
  });
  const available = JSON.parse(
    await readFile(
      path.join(root, "packs/src/familiar-abilities/tough.json"),
      "utf8",
    ),
  );
  h.packs.set(
    ID + ".familiar-abilities",
    pack(ID + ".familiar-abilities", [available]),
  );
  const result = await h.api.syncAutomation(owner);
  assert.ok(robot.items.has(old.id));
  assert.equal(robot.items.filter((i) => i.system.slug === "tough").length, 1);
  assert.equal(h.api.getRobotData(owner).familiarAbilities.length, 1);
  assert.ok(result.skipped >= 1);
});
test("RU: заголовки листов и оба менеджера показывают переводы, не SFMTP-ключи", async () => {
  const h = await harness({ language: "ru" });
  const owner = new Actor("owner");
  h.game.actors.set(owner.id, owner);
  assert.equal(h.hooks.has("getHeaderControlsActorSheetV2"), false);
  const menu = new (h.settingsMenus.get("tools").type)();
  assert.equal(h.dialogs.at(-1).window.title, "Инструменты техно-питомцев");
  assert.doesNotMatch(h.dialogs.at(-1).content, /SFMTP\.[A-Za-z]/);
  await h.api.open(owner);
  assert.equal(h.dialogs.at(-1).window.title, "Техно-питомцы");
  assert.doesNotMatch(h.dialogs.at(-1).content, /SFMTP\.[A-Za-z]/);
  assert.match(h.dialogs.at(-1).content, /Настройка робота/);
  await h.api.openFamiliar(owner);
  assert.equal(h.dialogs.at(-1).window.title, "Фамильяры");
  assert.doesNotMatch(h.dialogs.at(-1).content, /SFMTP\.[A-Za-z]/);
  assert.match(h.dialogs.at(-1).content, /Создать/);
  assert.equal(
    h.game.i18n.localize("SFMTP.ManualActionHint"),
    h.game.i18n.translations.SFMTP.ManualActionHint,
  );
});
test("Собственный словарь переводит настройки при недоступном native localize", async () => {
  const h = await harness({ language: "ru", nativeLocalization: false });
  new (h.settingsMenus.get("tools").type)();
  assert.equal(h.dialogs.at(-1).window.title, "Инструменты техно-питомцев");
  assert.doesNotMatch(h.dialogs.at(-1).content, /SFMTP\.[A-Za-z]/);
});
test("Прежние настройки кнопок больше не отображаются, API остаётся доступным", async () => {
  const h = await harness();
  for (const key of ["addActorButton", "addFamiliarButton"])
    assert.equal(h.settingsConfigs.has(key), false);
  for (const key of ["open", "openFamiliar", "openExocortex"])
    assert.equal(typeof h.api[key], "function");
});

test("Экзокортекс: все варианты доступны через Tech Pets, EN/RU без утечек ключей", async () => {
  const fixture = JSON.parse(
    await readFile(
      path.join(root, "tests/fixtures/native-exocortex.json"),
      "utf8",
    ),
  );
  for (const language of ["en", "ru"]) {
    const h = await harness({ language });
    const { owner } = await pair(h);
    owner.system = {
      abilities: { int: { mod: 4 } },
      details: { level: { value: 15 } },
    };
    await owner.createEmbeddedDocuments("Item", [
      { type: "class", system: { slug: "mechanic" } },
      ...fixture.items.filter((i) =>
        ["drone", "mine", "turret"].includes(i.system.slug),
      ),
    ]);
    await h.api.open(owner);
    assert.match(h.dialogs.at(-1).content, /data-open-exocortex/);
    await h.api.openExocortex(owner);
    const panel = h.dialogs.at(-1);
    assert.equal(
      panel.window.title,
      language === "ru" ? "Механик: экзокортекс" : "Mechanic: Exocortex",
    );
    assert.doesNotMatch(panel.content, /SFMTP\.[A-Za-z]/);
    for (const operation of [
      "drone-command",
      "mine-deploy",
      "mine-detonate",
      "turret-deploy",
      "turret-array",
    ]) {
      if (operation === "mine-detonate") continue;
      assert.ok(panel.content.includes(operation), operation);
    }
    assert.match(panel.content, /data-exo-install/);
    assert.equal(typeof h.api.getExocortexData, "function");
    assert.equal(typeof h.api.updateExocortex, "function");
    assert.equal(typeof h.api.installExocortexActions, "function");
    assert.equal(
      h.hooks.has("getHeaderControlsActorSheetV2"),
      false,
      "Панель не создаёт кнопки в хедере",
    );
  }
});
test("Синхронизация дрона применяет +2 только к коммерческим кастомизациям", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      baseSlots: 1,
      modifications: [
        {
          id: "a",
          catalogId: "test-a",
          name: "Test A",
          grade: "advanced",
          cost: 1,
        },
        {
          id: "b",
          catalogId: "test-b",
          name: "Test B",
          grade: "commercial",
          cost: 1,
        },
        {
          id: "c",
          catalogId: "test-c",
          name: "Test C",
          grade: "commercial",
          cost: 1,
        },
        {
          id: "d",
          catalogId: "test-d",
          name: "Test D",
          grade: "advanced",
          cost: 1,
        },
      ],
    });
  await owner.createEmbeddedDocuments("Item", [
    { type: "class", system: { slug: "mechanic" } },
    {
      type: "feat",
      system: { slug: "drone", traits: { otherTags: ["mechanic-exocortex"] } },
    },
  ]);
  const sources = ["a", "b", "c", "d"].map((id) => ({
    _id: id,
    name: "Test " + id.toUpperCase(),
    type: "feat",
    system: { slug: "test-" + id, rules: [] },
  }));
  h.packs.set("sf2e.feats", pack("sf2e.feats", sources));
  const summary = h.api.getModificationSlots(owner);
  assert.equal(summary.total, 3);
  assert.equal(summary.commercialSlots, 2);
  assert.equal(summary.generalTotal, 1);
  await h.api.syncAutomation(owner);
  for (const slug of ["test-a", "test-b", "test-c"])
    assert.ok(
      robot.items.find((i) => i.system.slug === slug),
      slug,
    );
  assert.equal(
    robot.items.find((i) => i.system.slug === "test-d"),
    undefined,
  );
  const count = robot.items.size;
  await h.api.syncAutomation(owner);
  assert.equal(robot.items.size, count);
  assert.equal(
    h.api.getRobotData(owner).modifications.length,
    4,
    "Превышающая лимит запись сохранена",
  );
});

test("Новое окно источников: EN/RU, 13 источников, Pet без familiar/master-способностей", async () => {
  for (const language of ["en", "ru"]) {
    const h = await harness({ language });
    const owner = new Actor("source-owner");
    h.game.actors.set(owner.id, owner);
    const dialog = await h.subject.openCompanionSources(owner);
    assert.ok(dialog);
    const config = h.dialogs.at(-1);
    assert.doesNotMatch(config.content, /SFMTP\.[A-Za-z]/);
    assert.equal((config.content.match(/<tr>/g) ?? []).length, 14);
    assert.match(config.content, /name="pet-ability" value="flier"/);
    assert.doesNotMatch(
      config.content,
      /name="pet-ability" value="accompanist"/,
    );
    assert.match(config.content, /2e.aonsrd.com\/feats\/2692-pet/);
    assert.equal(owner.items.size, 0);
    const handlers = new Map();
    dialog.legacyConfiguration.render({
      find: (selector) => ({
        on: (_event, callback) => handlers.set(selector, callback),
      }),
    });
    assert.ok(handlers.has("[data-source-open]"));
    assert.ok(handlers.has("[data-source-save]"));
    assert.ok(handlers.has("[data-pet-save]"));
  }
});
test("Сводка linked-дрона добавляет целевые слоты и не меняет прежние профили", async () => {
  const h = await harness(),
    { owner } = await pair(h, { baseSlots: 0 });
  const fixture = JSON.parse(
    await readFile(
      path.join(root, "tests/fixtures/native-companion-sources.json"),
      "utf8",
    ),
  );
  const sources = fixture.items
    .filter((row) =>
      ["drone", "tactical-drone", "tactical-customization"].includes(
        row.item.system.slug,
      ),
    )
    .map((row) => ({
      ...row.item,
      flags: { ...row.item.flags, core: { sourceId: row.uuid } },
    }));
  await owner.createEmbeddedDocuments("Item", sources);
  const summary = h.api.getModificationSlots(owner);
  assert.equal(summary.total, 5);
  assert.equal(summary.commercialSlots, 2);
  assert.equal(summary.gradedSlots.tactical, 3);
  assert.equal(summary.sourceGrade, "tactical");
  assert.equal(h.api.getRobotData(owner).gradeLimit, "commercial");
  await owner.setFlag(ID, "sourceCounts", { "tactical-customization": 3 });
  assert.equal(h.api.getModificationSlots(owner).total, 7);
});

// Регрессии собственных источников кастомизаций, без запуска движка RE.
const customizationChoice = (catalogId, id = catalogId) => ({
  id,
  catalogId,
  name: catalogId,
  grade: "commercial",
  cost: 1,
});
test("Aquatic Adaptation, Armored Plates и Speakers получают свои Items без предупреждения missing source", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      baseSlots: 3,
      modifications: ["aquatic-adaptation", "armored-plates", "speakers"].map(
        (id) => customizationChoice(id),
      ),
    });
  const result = await h.api.syncAutomation(owner);
  assert.equal(result.skipped, 0);
  for (const slug of ["aquatic-adaptation", "armored-plates", "speakers"]) {
    const item = robot.items.find((i) => i.system.slug === slug);
    assert.ok(item, slug);
    assert.equal(
      item.flags[ID].automationSource.sourcePack,
      ID + ".robot-customizations",
    );
  }
  assert.ok(
    !h.notifications.some((n) =>
      n.msg.includes(h.game.i18n.localize("SFMTP.AutomationSkipped") + ":"),
    ),
  );
  assert.ok(
    h.notifications.some((n) =>
      n.msg.includes(h.game.i18n.localize("SFMTP.CustomManualSelections")),
    ),
  );
  const previous = clone(robot.writes);
  await h.api.syncAutomation(owner);
  assert.deepEqual(robot.writes, previous);
  assert.equal(
    owner.getFlag(ID, "lastAutomationSync").manualCustomizations.length,
    1,
  );
});
test("Climber игнорирует совпавший familiar Item в чужом паке", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [customizationChoice("climber")],
    });
  h.packs.set(
    "sf2e.familiar-abilities",
    pack("sf2e.familiar-abilities", [
      {
        _id: "wrong",
        name: "Climber",
        type: "action",
        system: {
          slug: "climber",
          category: "familiar",
          rules: [{ key: "BaseSpeed", selector: "climb", value: 5 }],
        },
      },
    ]),
  );
  await h.api.syncAutomation(owner);
  const item = robot.items.find((i) => i.system.slug === "climber");
  assert.equal(item.system.rules[0].value, 20);
  assert.equal(
    item.flags[ID].automationSource.sourcePack,
    ID + ".robot-customizations",
  );
});
test("Смена выбора удаляет только неизменённые собственные кастомизации", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      baseSlots: 2,
      modifications: ["aquatic-adaptation", "speakers"].map((id) =>
        customizationChoice(id),
      ),
    });
  await h.api.syncAutomation(owner);
  const protectedItem = robot.items.find((i) => i.system.slug === "speakers");
  protectedItem.source.name = "Мой динамик";
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    modifications: [],
  });
  await h.api.syncAutomation(owner);
  assert.ok(robot.items.has(protectedItem.id));
  assert.ok(!robot.items.find((i) => i.system.slug === "aquatic-adaptation"));
});
test("Ручной drag-and-drop собственной кастомизации не дублируется и не удаляется", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [customizationChoice("aquatic-adaptation")],
    });
  const source = JSON.parse(
    await readFile(
      path.join(root, "packs/src/robot-customizations/aquatic-adaptation.json"),
      "utf8",
    ),
  );
  const [manual] = await robot.createEmbeddedDocuments("Item", [source]);
  await h.api.syncAutomation(owner);
  assert.equal(
    robot.items.filter((i) => i.system.slug === "aquatic-adaptation").length,
    1,
  );
  await owner.setFlag(ID, "robot", {
    ...h.api.getRobotData(owner),
    modifications: [],
  });
  await h.api.syncAutomation(owner);
  assert.ok(robot.items.has(manual.id));
});
test("Старый неверный источник Climber обновляется на месте, изменённая пользователем копия защищена", async () => {
  for (const edited of [false, true]) {
    const h = await harness(),
      { owner, robot } = await pair(h, {
        modifications: [customizationChoice("climber")],
      });
    await h.api.syncAutomation(owner);
    const item = robot.items.find((i) => i.system.slug === "climber");
    const metadata = item.getFlag(ID, "automationSource");
    item.source.system.rules = [
      { key: "BaseSpeed", selector: "climb", value: 5 },
    ];
    item.source.flags[ID].familiarAbility = true;
    metadata.sourceUuid = "Compendium.sf2e.familiar-abilities.Item.old";
    metadata.sourcePack = "sf2e.familiar-abilities";
    metadata.fingerprint = h.subject.itemFingerprint(item.toObject());
    if (edited) item.source.name = "Моя старая копия";
    const beforeId = item.id;
    await h.api.syncAutomation(owner);
    assert.equal(
      robot.items.filter((i) => i.system.slug === "climber").length,
      1,
    );
    assert.equal(item.id, beforeId);
    assert.equal(item.system.rules[0].value, edited ? 5 : 20);
    assert.equal(item.flags[ID].familiarAbility, edited);
    assert.equal(
      item.flags[ID].automationSource.sourcePack,
      edited ? "sf2e.familiar-abilities" : ID + ".robot-customizations",
    );
  }
});
test("Выбор ChoiceSet Armored Plates сохраняется повторной синхронизацией", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [customizationChoice("armored-plates")],
    });
  await h.api.syncAutomation(owner);
  const item = robot.items.find((i) => i.system.slug === "armored-plates");
  item.source.flags.sf2e = { rulesSelections: { armoredPlatesBonus: 2 } };
  item.getFlag(ID, "automationSource").fingerprint = h.subject.itemFingerprint(
    item.toObject(),
  );
  const writes = clone(robot.writes);
  await h.api.syncAutomation(owner);
  assert.equal(item.flags.sf2e.rulesSelections.armoredPlatesBonus, 2);
  assert.deepEqual(robot.writes, writes);
});

test("Отсутствующий собственный пак кастомизаций использует локальный источник", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [customizationChoice("aquatic-adaptation")],
    });
  h.packs.delete(ID + ".robot-customizations");
  const result = await h.api.syncAutomation(owner);
  assert.equal(result.skipped, 0);
  assert.equal(
    robot.items.find((i) => i.system.slug === "aquatic-adaptation").system
      .rules[0].value,
    20,
  );
});

// Миграция Action -> feat создаёт замену до удаления прежнего предмета.
async function legacyCustomization(
  h,
  owner,
  robot,
  slug,
  { edited = false, manual = false } = {},
) {
  await h.api.syncAutomation(owner);
  const item = robot.items.find((item) => item.system.slug === slug);
  item.source.type = "action";
  item.source.system.category = "interaction";
  delete item.source.system.location;
  delete item.source.system.level;
  if (slug === "armored-plates")
    item.source.flags.sf2e = { rulesSelections: { armoredPlatesBonus: 2 } };
  if (manual) delete item.source.flags[ID].automationSource;
  else
    item.getFlag(ID, "automationSource").fingerprint =
      h.subject.itemFingerprint(item.toObject());
  if (edited) item.source.name = "Мой изменённый предмет";
  return item;
}
test("Выбранная кастомизация мигрирует в бонусный feat без второй копии RE и сохраняет выбор брони", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [customizationChoice("armored-plates")],
    });
  const old = await legacyCustomization(h, owner, robot, "armored-plates");
  await h.api.syncAutomation(owner);
  const items = robot.items.filter(
    (item) => item.system.slug === "armored-plates",
  );
  assert.equal(items.length, 1);
  const item = items[0];
  assert.equal(item.type, "feat");
  assert.equal(item.system.category, "bonus");
  assert.equal(item.system.location, null);
  assert.equal(item.flags.sf2e.rulesSelections.armoredPlatesBonus, 2);
  assert.equal(
    item.system.rules.find((rule) => rule.key === "ChoiceSet").selection,
    2,
  );
  assert.equal(
    item.system.rules.filter((rule) => rule.key === "FlatModifier").length,
    1,
  );
  assert.ok(!robot.items.has(old.id));
  const writes = clone(robot.writes);
  await h.api.syncAutomation(owner);
  assert.deepEqual(robot.writes, writes);
});
test("Ошибка создания бонусного feat не удаляет прежний Action", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [customizationChoice("aquatic-adaptation")],
    });
  const old = await legacyCustomization(h, owner, robot, "aquatic-adaptation");
  robot.createEmbeddedDocuments = async () => {
    throw new Error("Нет записи");
  };
  await assert.rejects(h.api.syncAutomation(owner), /Нет записи/);
  assert.ok(robot.items.has(old.id));
  assert.equal(old.type, "action");
});
test("Изменённый или ручной прежний Action не удаляется и не получает дублирующий feat", async () => {
  for (const manual of [false, true]) {
    const h = await harness(),
      { owner, robot } = await pair(h, {
        modifications: [customizationChoice("aquatic-adaptation")],
      });
    const old = await legacyCustomization(
      h,
      owner,
      robot,
      "aquatic-adaptation",
      { manual, edited: !manual },
    );
    await h.api.syncAutomation(owner);
    assert.ok(robot.items.has(old.id));
    assert.equal(
      robot.items.filter((item) => item.system.slug === "aquatic-adaptation")
        .length,
      1,
    );
    assert.equal(old.type, "action");
  }
});

test("Отмена preCreate без исключения сохраняет прежнюю кастомизацию", async () => {
  const h = await harness(),
    { owner, robot } = await pair(h, {
      modifications: [customizationChoice("aquatic-adaptation")],
    });
  const old = await legacyCustomization(h, owner, robot, "aquatic-adaptation");
  robot.createEmbeddedDocuments = async () => [];
  const result = await h.api.syncAutomation(owner);
  assert.ok(robot.items.has(old.id));
  assert.equal(result.skipped, 1);
  assert.equal(old.type, "action");
});
test("Каталог инструментов содержит раскрываемое описание, а не одну ссылку AON", async () => {
  const h = await harness(),
    { owner } = await pair(h);
  await h.subject.openCuratedCatalog(owner, "robot-customizations");
  const content = h.dialogs.at(-1).content;
  const entries = JSON.parse(
    await readFile(path.join(root, "data/robot-customizations.json"), "utf8"),
  ).entries.filter((e) => e.grade === "commercial");
  assert.match(content, /<details><summary>/);
  for (const entry of entries)
    assert.ok(content.includes(entry.description), entry.id);
});
