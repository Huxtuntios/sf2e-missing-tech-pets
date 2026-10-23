// Проверки фильтра и профиля; нативный движок Foundry здесь не запускается.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isChassisSource,
  selectedModifications,
  robotController,
  registerSheetIntegration,
} from "../scripts/sheet-integration.mjs";
const ID = "sf2e-missing-tech-pets";
const catalog = JSON.parse(
  await readFile(new URL("../data/robot-customizations.json", import.meta.url)),
).entries;
const id = "armored-plates";
const repeatable = catalog.find((entry) => entry.repeatable);
function setup() {
  globalThis.game = {
    i18n: { localize: (key) => key, translations: {} },
    actors: new Map(),
    items: new Map(),
  };
}
test("Фильтр распознаёт пак, world-копию и родные флаги, но не обычную ancestry", () => {
  assert.equal(
    isChassisSource({
      type: "ancestry",
      uuid: `Compendium.${ID}.robot-chassis.Item.test`,
    }),
    true,
  );
  assert.equal(
    isChassisSource({
      type: "ancestry",
      flags: { core: { sourceId: `Compendium.${ID}.robot-chassis.Item.test` } },
    }),
    true,
  );
  assert.equal(
    isChassisSource({
      type: "ancestry",
      flags: { [ID]: { chassisId: "tank-chassis" } },
    }),
    true,
  );
  assert.equal(
    isChassisSource({ type: "ancestry", system: { slug: "human" } }),
    false,
  );
  assert.equal(
    isChassisSource({
      type: "action",
      flags: { [ID]: { chassisId: "tank-chassis" } },
    }),
    false,
  );
});
test("Смена улучшения сохраняет ручные и неизвестные записи, ID оставшихся не меняются", () => {
  setup();
  const manual = {
    id: "note",
    name: "Моя заметка",
    manual: true,
    catalogId: "cameras",
  };
  const unknown = {
    id: "legacy",
    catalogId: "unknown-future",
    name: "Unknown",
  };
  const existing = { id: "keep", catalogId: id, name: "Custom name", cost: 2 };
  const result = selectedModifications(
    [manual, unknown, existing],
    catalog,
    { [id]: 1 },
    "commercial",
    () => "new",
  );
  assert.equal(
    result.find((item) => item.id === "keep"),
    existing,
  );
  assert.ok(result.includes(manual));
  assert.ok(result.includes(unknown));
  const changed = selectedModifications(
    result,
    catalog,
    { [id]: 0, cameras: 1 },
    "commercial",
    () => "camera",
  );
  assert.equal(
    changed.some((item) => item.id === "keep"),
    false,
  );
  assert.equal(
    changed.find((item) => item.id === "camera").catalogId,
    "cameras",
  );
  assert.ok(changed.includes(manual));
});
test("Повторяемые улучшения меняются по числу копий без перезаписи старых", () => {
  setup();
  const old = { id: "old", catalogId: repeatable.id };
  let n = 0;
  const result = selectedModifications(
    [old],
    catalog,
    { [repeatable.id]: 3 },
    "superior",
    () => `new${++n}`,
  );
  assert.equal(result.length, 3);
  assert.equal(result[0], old);
  assert.equal(new Set(result.map((item) => item.id)).size, 3);
  const smaller = selectedModifications(
    result,
    catalog,
    { [repeatable.id]: 1 },
    "superior",
    () => "unused",
  );
  assert.deepEqual(smaller, [old]);
});
test("Отвергаются дробные, отрицательные и чрезмерные количества", () => {
  setup();
  for (const count of [-1, 0.5, NaN, Infinity, 51])
    assert.throws(() =>
      selectedModifications(
        [],
        catalog,
        { [repeatable.id]: count },
        "superior",
        () => "new",
      ),
    );
  assert.throws(() =>
    selectedModifications([], catalog, { [id]: 2 }, "superior", () => "new"),
  );
});
test("Недоступная ступень не выдаётся, но старую запись можно оставить или снять", () => {
  setup();
  const high = catalog.find((entry) => entry.grade === "superior");
  assert.throws(() =>
    selectedModifications(
      [],
      catalog,
      { [high.id]: 1 },
      "commercial",
      () => "new",
    ),
  );
  const old = { id: "saved", catalogId: high.id };
  assert.deepEqual(
    selectedModifications(
      [old],
      catalog,
      { [high.id]: 1 },
      "commercial",
      () => "new",
    ),
    [old],
  );
  assert.deepEqual(
    selectedModifications(
      [old],
      catalog,
      { [high.id]: 0 },
      "commercial",
      () => "new",
    ),
    [],
  );
});
test("Контроллер: только взаимная связь или самостоятельное шасси, не обычный PC", () => {
  setup();
  const data = new Map();
  const get = (actor) => data.get(actor.id) ?? {};
  const owner = { id: "owner", type: "character", items: [] };
  const companion = { id: "robot", type: "character", items: [] };
  game.actors.set(owner.id, owner);
  data.set(companion.id, { ownerActorId: owner.id });
  assert.equal(robotController(companion, get), null);
  data.set(owner.id, { companionActorId: companion.id });
  assert.equal(
    robotController(companion, get),
    null,
    "Связанное животное не получает улучшения робота",
  );
  data.set(owner.id, {
    companionActorId: companion.id,
    chassisCatalogId: "agile-chassis",
  });
  assert.equal(robotController(companion, get), owner);
  assert.equal(robotController(owner, get), null);
  data.set(companion.id, {});
  companion.items = [
    { type: "ancestry", flags: { [ID]: { chassisId: "agile-chassis" } } },
  ];
  assert.equal(robotController(companion, get), companion);
});
test("ABCPicker скрывает только шасси, восстанавливает переиспользованную строку и отключает observer", () => {
  setup();
  const hooks = new Map();
  globalThis.Hooks = { on: (name, fn) => hooks.set(name, fn) };
  let disconnected = 0;
  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    disconnect() {
      disconnected++;
    }
  };
  registerSheetIntegration({});
  const normal = {
    dataset: { uuid: "Compendium.sf2e.ancestries.Item.human" },
    hidden: false,
  };
  const chassis = {
    dataset: { uuid: `Compendium.${ID}.robot-chassis.Item.test` },
    hidden: false,
  };
  const world = { dataset: { uuid: "Item.copy" }, hidden: false };
  game.items.set("copy", {
    type: "ancestry",
    flags: { [ID]: { chassisId: "agile-chassis" } },
  });
  const root = {
    querySelector: () => null,
    querySelectorAll: () => [normal, chassis, world],
  };
  const app = { options: { itemType: "ancestry" } };
  hooks.get("renderABCPicker")(app, root);
  assert.equal(normal.hidden, false);
  assert.equal(chassis.hidden, true);
  assert.equal(world.hidden, true);
  chassis.dataset.uuid = normal.dataset.uuid;
  hooks.get("renderABCPicker")(app, root);
  assert.equal(chassis.hidden, false);
  hooks.get("closeABCPicker")(app);
  assert.equal(disconnected, 2);
  const feat = { options: { itemType: "feat" } };
  world.hidden = false;
  hooks.get("renderABCPicker")(feat, root);
  assert.equal(world.hidden, false);
});
