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
      const leaf = parts.at(-1);
      if (leaf.startsWith("-=")) delete cursor[leaf.slice(2)];
      else cursor[leaf] = value;
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

import {
  initializeDailiesIntegration,
  dailiesState,
  connectDailies,
  openDailies,
  dailiesControls,
} from "../scripts/dailies.mjs";
const D = "pf2e-dailies";
function integration({ version = "4.23.1", active = true } = {}) {
  const pair = setup();
  const registered = [];
  let opens = 0;
  const api = Object.freeze({
    registerCustomDailies(dailies) {
      registered.push(...dailies);
    },
    getDisabledDailies(actor) {
      return {
        "dailies.familiar": actor.getFlag(D, "disabled")?.dailies?.familiar,
      };
    },
    canPrepareDailies(actor) {
      return actor.getFlag(D, "rested") !== false;
    },
    openDailiesInterface() {
      opens++;
    },
  });
  // Реальная форма публичного API: read-only game.dailies.api, а не подмена контекста.
  Object.defineProperty(game, "dailies", {
    value: Object.freeze({ api }),
    writable: false,
  });
  game.modules.set(D, { active, version });
  globalThis.ui = { notifications: { warn() {} } };
  return {
    ...pair,
    api,
    registered,
    get opens() {
      return opens;
    },
  };
}
async function connected() {
  const context = integration();
  await connectDailies(context.owner, context.familiar, true);
  return { ...context, daily: context.registered[0] };
}
function options(owner, rows, custom) {
  const messages = {
    groups: [],
    entries: [],
    addGroup(...args) {
      this.groups.push(args);
    },
    add(...args) {
      this.entries.push(args);
    },
  };
  return { actor: owner, rows, custom, messages };
}
function manual(familiar, slug = "flier", flags = {}) {
  const item = new Item({
    name: slug,
    type: "action",
    system: { category: "familiar", slug, rules: [] },
    flags,
  });
  familiar.items.set(item.id, item);
  return item;
}
test("Отсутствующий, выключенный и старый Dailies не блокируют локальный выбор", () => {
  const { owner, familiar } = setup();
  assert.equal(initializeDailiesIntegration(), false);
  assert.equal(dailiesState(owner, familiar).using, false);
  assert.equal(dailiesControls(owner, familiar), "");
  for (const args of [
    { active: false },
    { version: "4.22.0" },
    { version: "invalid" },
  ]) {
    const { owner, familiar, registered } = integration(args);
    assert.equal(initializeDailiesIntegration(), false);
    assert.equal(dailiesState(owner, familiar).available, false);
    assert.equal(registered.length, 0);
  }
});
test("Регистрация через замороженный публичный API выполняется один раз", () => {
  const { api, registered, owner, familiar } = integration();
  assert.equal(initializeDailiesIntegration(), true);
  initializeDailiesIntegration();
  assert.equal(registered.length, 1);
  assert.equal(registered[0].key, "sfmtp-familiar");
  assert.equal(game.dailies.api, api);
  assert.ok(Object.isFrozen(api));
  assert.equal(dailiesState(owner, familiar).using, false);
});
test("Неполный API не регистрируется", () => {
  const { owner, familiar } = setup();
  game.modules.set(D, { active: true, version: "4.23.1" });
  game.dailies = {
    api: Object.freeze({
      registerCustomDailies() {
        throw Error("must not run");
      },
    }),
  };
  assert.equal(initializeDailiesIntegration(), false);
  assert.equal(dailiesState(owner, familiar).using, false);
});
test("Подключение изолировано по владельцу; прочие наборы и флаги не меняются", async () => {
  const { owner, familiar, daily } = await connected();
  assert.equal(dailiesState(owner, familiar).using, true);
  assert.equal(owner.flags[D].disabled.dailies.familiar, true);
  assert.equal(daily.condition(owner), true);
  const other = new MockActor("other"),
    otherFamiliar = new MockActor("other-familiar", "familiar", other.id);
  game.actors.set(other.id, other);
  game.actors.set(otherFamiliar.id, otherFamiliar);
  assert.equal(daily.condition(other), false);
  assert.equal(other.flags[D], undefined);
  assert.match(dailiesControls(owner, familiar), /data-sfmtp-dailies="open"/);
  assert.doesNotMatch(
    dailiesControls(owner, familiar),
    /data-sfmtp-dailies="connect"/,
  );
});
test("Отключение восстанавливает unset, false и true только стандартного набора", async () => {
  for (const previous of [undefined, false, true]) {
    const { owner, familiar } = integration();
    owner.flags[D] = {
      disabled: {
        dailies: {
          other: true,
          ...(previous === undefined ? {} : { familiar: previous }),
        },
        module: { another: true },
      },
      custom: "keep",
    };
    await connectDailies(owner, familiar, true);
    await connectDailies(owner, familiar, false);
    assert.equal(owner.flags[D].disabled.dailies.familiar, previous);
    assert.equal(owner.flags[D].disabled.dailies.other, true);
    assert.equal(owner.flags[D].disabled.module.another, true);
    assert.equal(owner.flags[D].custom, "keep");
    assert.equal(dailiesState(owner, familiar).using, false);
  }
});
test("Более новая ручная настройка Dailies не перезаписывается", async () => {
  const { owner, familiar } = await connected();
  owner.flags[D].disabled.dailies.familiar = false;
  assert.equal(dailiesState(owner, familiar).conflict, true);
  assert.equal(dailiesState(owner, familiar).delegated, true);
  assert.equal(dailiesState(owner, familiar).using, false);
  await rejectsKey(connectDailies(owner, familiar, true), "DailiesConflict");
  await connectDailies(owner, familiar, false);
  assert.equal(owner.flags[D].disabled.dailies.familiar, false);
});
test("Права, неоднозначная связь и временные способности Dailies блокируют подключение", async () => {
  let { owner, familiar } = integration();
  familiar.isOwner = false;
  await rejectsKey(connectDailies(owner, familiar, true), "FamiliarAccess");
  ({ owner, familiar } = integration());
  game.actors.set("second", new MockActor("second", "familiar", owner.id));
  await rejectsKey(connectDailies(owner, familiar, true), "FamiliarAmbiguous");
  ({ owner, familiar } = integration());
  const old = manual(familiar, "flier", { [D]: { temporary: true } });
  await rejectsKey(connectDailies(owner, familiar, true), "DailiesTemporary");
  assert.equal(familiar.items.get(old.id), old);
  assert.equal(owner.flags[ID], undefined);
});
test("Строки Dailies учитывают защищённые предметы и не предлагают их повторно", async () => {
  const { owner, familiar, daily } = await connected();
  manual(familiar);
  const custom = daily.prepare(owner),
    rows = await daily.rows(owner, {}, custom);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, "notify");
  assert.equal(rows[1].type, "select");
  assert.equal(rows[1].options.length, 38);
  assert.ok(!rows[1].options.some((o) => o.value === "flier"));
  assert.equal(rows[1].empty, true);
  assert.equal(rows[1].save, true);
});
test("Защищённые предметы сверх лимита дают блокирующее предупреждение без удаления", async () => {
  const { owner, familiar, daily } = await connected();
  manual(familiar, "flier");
  manual(familiar, "darkvision");
  manual(familiar, "climber");
  const rows = await daily.rows(owner, {}, daily.prepare(owner));
  assert.equal(rows[0].type, "alert");
  assert.equal(rows[0].resolve(), false);
  assert.equal(familiar.items.size, 3);
});
test("Подготовка использует старую безопасную синхронизацию и стабильные UUID", async () => {
  const { owner, familiar, daily } = await connected();
  const old = manual(familiar);
  const opts = options(
    owner,
    { protected: true, ability1: "darkvision" },
    daily.prepare(owner),
  );
  await daily.process(opts);
  assert.equal(familiar.items.size, 2);
  assert.equal(familiar.items.get(old.id), old);
  const created = [...familiar.items].find(
    (i) => i.system.slug === "darkvision",
  );
  assert.ok(created.flags[ID].familiarManaged);
  assert.equal(created.flags[D], undefined);
  assert.match(
    opts.messages.entries[0][1].uuid,
    /Compendium.sf2e-missing-tech-pets.familiar-abilities.Item./,
  );
  await daily.process(
    options(owner, { ability1: "darkvision" }, daily.prepare(owner)),
  );
  assert.equal(familiar.items.size, 2);
  assert.equal(familiar.writes.created, 1);
});
test("Неверные, повторные и зависимые способности отвергаются до изменения Items", async () => {
  const { owner, familiar, daily } = await connected();
  for (const rows of [
    { ability1: "bad" },
    { ability1: "darkvision", ability2: "darkvision" },
    { ability3: "flier" },
    { ability1: 2 },
    { unknown: "flier" },
    { ability1: "masters-form" },
  ]) {
    await assert.rejects(
      daily.process(options(owner, rows, daily.prepare(owner))),
    );
    assert.equal(familiar.items.size, 0);
  }
});
test("Изменившиеся предметы, связь и лимит блокируют устаревшую подготовку", async () => {
  const { owner, familiar, daily } = await connected();
  const custom = daily.prepare(owner);
  manual(familiar);
  await rejectsKey(
    daily.process(options(owner, { ability1: "darkvision" }, custom)),
    "InlineStale",
  );
  const next = daily.prepare(owner);
  await familiar.setFlag(ID, "familiarAllowance", 4);
  await rejectsKey(
    daily.process(options(owner, { ability1: "darkvision" }, next)),
    "InlineStale",
  );
  familiar.system.master.id = "missing";
  await assert.rejects(
    daily.process(options(owner, { ability1: "darkvision" }, next)),
  );
  assert.equal(familiar.writes.created, 0);
});
test("Отдых снимает только неизменённые собственные ежедневные Items", async () => {
  const { owner, familiar, daily } = await connected();
  await familiar.setFlag(ID, "familiarAllowance", 5);
  await syncFamiliarAbilities(owner, familiar, [
    "darkvision",
    "flier",
    "climber",
  ]);
  const items = [...familiar.items];
  await setInnateFamiliarItems(familiar, [
    items.find((i) => i.system.slug === "flier").id,
  ]);
  items.find((i) => i.system.slug === "climber").source.name = "Edited";
  const external = manual(familiar, "burrower", { foreign: { keep: true } });
  await daily.rest({ actor: owner });
  assert.equal(familiar.items.size, 3);
  assert.ok(![...familiar.items].some((i) => i.system.slug === "darkvision"));
  assert.ok(familiar.items.has(external.id));
  assert.ok([...familiar.items].some((i) => i.system.slug === "flier"));
  assert.ok([...familiar.items].some((i) => i.source.name === "Edited"));
});
test("Открытие Dailies проверяет отдых, а исчезновение модуля возвращает локальный выбор", async () => {
  const context = integration();
  const { owner, familiar } = context;
  await connectDailies(owner, familiar, true);
  openDailies(owner, familiar);
  assert.equal(context.opens, 1);
  owner.flags[D].rested = false;
  assert.throws(() => openDailies(owner, familiar), /DailiesRestFirst/);
  game.modules.get(D).active = false;
  assert.equal(dailiesState(owner, familiar).using, false);
  assert.equal(dailiesState(owner, familiar).enabled, true);
  await connectDailies(owner, familiar, false);
  assert.equal(owner.flags[D].disabled.dailies.familiar, undefined);
});
