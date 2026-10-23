// Чистые расчёты и документные mocks: не игровой запуск Foundry.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  NATIVE_EXOCORTEX,
  TURRET_ARRAYS,
  isMechanic,
  mechanicStats,
  exocortexVariants,
  eligibleExocortexActions,
  customizationCapacity,
} from "../scripts/exocortex-rules.mjs";
import {
  assertExocortexAccess,
  linkedDrone,
  droneCommercialSlots,
  exocortexState,
  updateExocortex,
  rollMineDamage,
  repairDrone,
  installExocortexActions,
} from "../scripts/exocortex.mjs";
const ID = "sf2e-missing-tech-pets";
const fixture = JSON.parse(
  await readFile(
    new URL("fixtures/native-exocortex.json", import.meta.url),
    "utf8",
  ),
);
const clone = (value) => structuredClone(value);
class Actor {
  constructor(
    id = "owner",
    variants = ["mine"],
    level = 1,
    int = 4,
    main = true,
  ) {
    this.id = id;
    this.name = id;
    this.type = "character";
    this.isOwner = true;
    this.flags = {};
    this.items = [];
    this.level = level;
    this.system = {
      abilities: { int: { mod: int } },
      attributes: { hp: { value: 0, max: 30 } },
    };
    if (main) this.items.push({ type: "class", system: { slug: "mechanic" } });
    else
      this.items.push({
        type: "feat",
        system: { slug: "mechanic-dedication" },
      });
    this.items.push(
      ...variants.map((key) =>
        clone(
          fixture.items.find(
            (i) => i.flags.core.sourceId === NATIVE_EXOCORTEX[key],
          ),
        ),
      ),
    );
    this.writes = [];
  }
  getFlag(scope, key) {
    return this.flags[scope]?.[key];
  }
  async setFlag(scope, key, data) {
    await Promise.resolve();
    this.flags[scope] ??= {};
    this.flags[scope][key] = clone(data);
    return this;
  }
  getStatistic(key) {
    return key === "mechanic" ? { dc: { value: 23 } } : null;
  }
  async update(data) {
    this.writes.push(data);
    this.system.attributes.hp.value = data["system.attributes.hp.value"];
    return this;
  }
  async createEmbeddedDocuments(type, sources) {
    assert.equal(type, "Item");
    this.items.push(...clone(sources));
    return sources;
  }
}
let serial, rolls;
beforeEach(() => {
  serial = 0;
  rolls = [];
  globalThis.game = {
    system: { id: "sf2e" },
    modules: new Map([["pf2e-animal-companions", { active: true }]]),
    actors: new Map(),
    i18n: { localize: (key) => key, translations: {} },
  };
  globalThis.foundry = { utils: { randomID: () => "mine-" + ++serial } };
  globalThis.ChatMessage = { getSpeaker: ({ actor }) => ({ actor: actor.id }) };
  globalThis.CONFIG = {
    Dice: {
      rolls: [
        class DamageRoll {
          constructor(formula) {
            this.formula = formula;
          }
          async evaluate() {
            return this;
          }
          async toMessage(data) {
            rolls.push({ formula: this.formula, ...data });
            return this;
          }
        },
      ],
    },
  };
  globalThis.fromUuid = async (uuid) => {
    const source = fixture.items.find((i) => i.flags.core.sourceId === uuid);
    return source ? { ...source, toObject: () => clone(source) } : null;
  };
});
function linked(variants = ["drone"]) {
  const owner = new Actor("owner", variants),
    drone = new Actor("drone", [], 1, 0, false);
  owner.flags[ID] = { robot: { companionActorId: drone.id } };
  drone.flags[ID] = { robot: { ownerActorId: owner.id } };
  game.actors.set(owner.id, owner);
  game.actors.set(drone.id, drone);
  return { owner, drone };
}
function extra(actor, slug) {
  actor.items.push({ type: "feat", system: { slug } });
}
test("Нативные UUID существуют в снимке SF2e 1.6.0; варианты используют правильные tags", () => {
  for (const [key, uuid] of Object.entries(NATIVE_EXOCORTEX)) {
    const source = fixture.items.find((i) => i.flags.core.sourceId === uuid);
    assert.ok(source, key);
    assert.equal(
      source.type,
      ["exocortex", "drone", "mine", "turret"].includes(key)
        ? "feat"
        : "action",
    );
  }
  const owner = new Actor("a", ["drone", "mine", "turret"]);
  assert.deepEqual(exocortexVariants(owner), ["drone", "mine", "turret"]);
  owner.items = [
    { type: "feat", system: { slug: "drone", traits: { otherTags: [] } } },
  ];
  assert.deepEqual(exocortexVariants(owner), []);
});
test("Механик и архетип различаются; совпадение отображаемого имени не даёт доступ", () => {
  assert.equal(isMechanic(new Actor()), true);
  assert.equal(isMechanic(new Actor("a", [], 15, 3, false)), true);
  assert.equal(
    isMechanic({
      type: "character",
      items: [
        { name: "Mechanic", type: "feat", system: { slug: "unrelated" } },
      ],
    }),
    false,
  );
  const archetype = new Actor("a", ["mine"], 15, 3, false);
  let stats = mechanicStats(archetype);
  assert.equal(stats.canModify, false);
  assert.equal(stats.mobile, false);
  extra(archetype, "modify");
  extra(archetype, "remote-mods");
  stats = mechanicStats(archetype);
  assert.equal(stats.canModify, true);
  assert.equal(stats.modifyRange, 60);
  assert.equal(stats.modsPerAction, 1);
  assert.equal(stats.enduring, false);
  assert.equal(stats.instant, false);
});
test("Границы прогрессии механика: Modify, Mobile, Remote, Enduring, Manifold, Instant", () => {
  for (const [level, range, mobile, mods, enduring, instant] of [
    [1, null, false, 1, false, false],
    [3, null, true, 1, false, false],
    [9, 60, true, 1, false, false],
    [13, 60, true, 1, true, false],
    [15, 150, true, 2, true, false],
    [19, 150, true, 2, true, true],
  ]) {
    const s = mechanicStats(new Actor("a", ["mine"], level));
    assert.equal(s.modifyRange, range);
    assert.equal(s.mobile, mobile);
    assert.equal(s.modsPerAction, mods);
    assert.equal(s.enduring, enduring);
    assert.equal(s.instant, instant);
  }
});
test("Мины: лимит, кости урона и радиус на уровнях 1–20", () => {
  for (let level = 1; level <= 20; level++) {
    const s = mechanicStats(new Actor("a", ["mine"], level, 4));
    assert.equal(s.mineCapacity, 8 + 2 * Math.floor(level / 5));
    assert.equal(s.mineDice, 2 + Math.floor((level - 1) / 2));
    assert.equal(s.mineRadius, level >= 15 ? 20 : level >= 10 ? 15 : 10);
    assert.equal(s.smartTargets, level >= 10 ? 6 : level >= 5 ? 3 : 1);
    assert.equal(
      s.repositionDistance,
      level >= 20 ? 60 : level >= 15 ? 50 : level >= 10 ? 40 : 30,
    );
  }
});
test("Турель: ОЗ, твёрдость, ранги спасбросков, PWOL и корректный КС класса", () => {
  for (const [level, hardness, rank] of [
    [1, 5, 1],
    [5, 10, 1],
    [10, 15, 2],
    [15, 20, 3],
    [20, 20, 3],
  ]) {
    const a = new Actor("a", ["turret"], level, 4);
    const s = mechanicStats(a);
    assert.equal(s.turretHP, 10 + 6 * level);
    assert.equal(s.turretHardness, hardness);
    assert.equal(s.turretSaveRank, rank);
    assert.equal(s.turretSave, level + rank * 2 + 4);
    assert.equal(s.classDC, 23);
    assert.equal(
      mechanicStats(a, { withoutLevel: true }).turretSave,
      rank * 2 + 4,
    );
    a.getStatistic = () => null;
    a.system.attributes.classDC = { value: 99 };
    assert.equal(mechanicStats(a).classDC, null);
  }
  assert.equal(Object.keys(TURRET_ARRAYS).length, 6);
  assert.equal(TURRET_ARRAYS.chaingun.range, 90);
  assert.equal(TURRET_ARRAYS.laser.damage, "fire");
});
test("Дополнительные коммерческие слоты нельзя расходовать на advanced и ручные записи", () => {
  const c = (id, grade = "commercial", manual = false) => ({
    catalogId: id,
    grade,
    cost: 1,
    manual,
  });
  const mods = [c("a"), c("b"), c("c")];
  assert.equal(customizationCapacity(mods, 1, 2).accepted.length, 3);
  assert.equal(
    customizationCapacity([c("a", "advanced"), c("b", "advanced")], 1, 2)
      .accepted.length,
    1,
  );
  assert.equal(
    customizationCapacity(
      [c("a", "commercial", true), c("b", "commercial", true)],
      1,
      2,
    ).accepted.length,
    1,
  );
  const mix = [c("a", "advanced"), c("b"), c("c")];
  assert.deepEqual(customizationCapacity(mix, 1, 2).accepted, mix);
  const expensive = { catalogId: "x", grade: "commercial", cost: 4 };
  assert.equal(customizationCapacity([expensive], 1, 2).accepted.length, 0);
});
test("Два слота дрона требуют реальной особенности и взаимной связи character-актора", () => {
  const { owner, drone } = linked();
  assert.equal(linkedDrone(owner), drone);
  assert.equal(droneCommercialSlots(owner), 2);
  drone.flags[ID].robot.ownerActorId = "stranger";
  assert.equal(droneCommercialSlots(owner), 0);
  drone.flags[ID].robot.ownerActorId = owner.id;
  drone.type = "familiar";
  assert.equal(droneCommercialSlots(owner), 0);
  drone.type = "character";
  owner.items = [];
  assert.equal(droneCommercialSlots(owner), 0);
});
test("Подготовка мин требует подтверждения и сохраняет другие данные профиля", async () => {
  const owner = new Actor();
  owner.flags[ID] = { robot: { note: "keep" } };
  await assert.rejects(updateExocortex(owner, "mine-daily"));
  assert.equal(owner.getFlag(ID, "exocortex"), undefined);
  await updateExocortex(owner, "mine-daily", { confirmed: true });
  assert.equal(exocortexState(owner).mines.prepared, 8);
  assert.equal(owner.getFlag(ID, "robot").note, "keep");
  await updateExocortex(owner, "mine-deploy", { label: "A" });
  await updateExocortex(owner, "mine-daily", { confirmed: true });
  assert.equal(exocortexState(owner).mines.deployed.length, 0);
});
test("Параллельные операции мин сериализуются и не тратят последнюю мину дважды", async () => {
  const owner = new Actor();
  await owner.setFlag(ID, "exocortex", { mines: { prepared: 1 } });
  const results = await Promise.allSettled([
    updateExocortex(owner, "mine-deploy"),
    updateExocortex(owner, "mine-deploy"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(exocortexState(owner).mines.prepared, 0);
  assert.equal(exocortexState(owner).mines.deployed.length, 1);
  await updateExocortex(owner, "mine-craft");
  assert.equal(exocortexState(owner).mines.prepared, 2);
});
test("Размещённые мины не занимают переносимый лимит; сбор не уничтожает записи", async () => {
  const owner = new Actor();
  await updateExocortex(owner, "mine-daily", { confirmed: true });
  await updateExocortex(owner, "mine-deploy");
  await updateExocortex(owner, "mine-deploy");
  await updateExocortex(owner, "mine-craft");
  assert.equal(exocortexState(owner).mines.prepared, 8);
  assert.equal(exocortexState(owner).mines.deployed.length, 2);
  await updateExocortex(owner, "mine-craft");
  assert.equal(exocortexState(owner).mines.prepared, 8);
  await updateExocortex(owner, "mine-collect");
  assert.equal(exocortexState(owner).mines.prepared, 10);
  assert.equal(exocortexState(owner).mines.deployed.length, 0);
});
test("Взрыв делает нативный типизированный бросок и удаляет только выбранную мину", async () => {
  const owner = new Actor("owner", ["mine"], 9);
  await updateExocortex(owner, "mine-daily", { confirmed: true });
  await updateExocortex(owner, "mine-deploy");
  await updateExocortex(owner, "mine-deploy");
  const [a, b] = exocortexState(owner).mines.deployed;
  await updateExocortex(owner, "mine-detonate", {
    id: a.id,
    damageType: "piercing",
  });
  assert.equal(rolls[0].formula, "{6d6[piercing]}");
  assert.equal(rolls[0].speaker.actor, owner.id);
  assert.deepEqual(rolls[0].flags.sf2e.context.options, [
    "area-damage",
    "area-effect",
  ]);
  assert.equal(rolls[0].flags.sf2e.context.sourceType, "save");
  assert.equal(exocortexState(owner).mines.deployed[0].id, b.id);
  await assert.rejects(updateExocortex(owner, "mine-detonate", { id: a.id }));
  assert.equal(rolls.length, 1);
});
test("Ошибка броска или тип урона не расходуют мину", async () => {
  const owner = new Actor();
  await updateExocortex(owner, "mine-craft");
  await updateExocortex(owner, "mine-deploy");
  const id = exocortexState(owner).mines.deployed[0].id;
  await assert.rejects(
    updateExocortex(owner, "mine-detonate", { id, damageType: "acid" }),
  );
  CONFIG.Dice.rolls = [];
  await assert.rejects(updateExocortex(owner, "mine-detonate", { id }));
  assert.equal(exocortexState(owner).mines.deployed[0].id, id);
});
test("Турель: сохранение конфигурации, урон до 0 ОЗ и возврат в инструментарий", async () => {
  const owner = new Actor("owner", ["turret"]);
  await updateExocortex(owner, "turret-deploy");
  assert.equal(exocortexState(owner).turret.deployed, true);
  await updateExocortex(owner, "turret-array", { array: "volt" });
  assert.equal(exocortexState(owner).turret.array, "volt");
  await updateExocortex(owner, "turret-hp", { hp: 0 });
  assert.equal(exocortexState(owner).turret.deployed, false);
  await assert.rejects(updateExocortex(owner, "turret-deploy"));
  await assert.rejects(updateExocortex(owner, "turret-hp", { hp: 999 }));
  await assert.rejects(updateExocortex(owner, "turret-repair"));
  await updateExocortex(owner, "turret-repair", { confirmed: true });
  assert.equal(exocortexState(owner).turret.hp, 16);
});
test("Турель: восстановление +5 не повторяется в одном ходе и требует хранения", async () => {
  const owner = new Actor("owner", ["turret"]);
  await updateExocortex(owner, "turret-hp", { hp: 0 });
  await assert.rejects(updateExocortex(owner, "turret-recover"));
  game.combat = {
    id: "combat",
    started: true,
    round: 1,
    turn: 0,
    combatant: { actor: owner },
  };
  await updateExocortex(owner, "turret-recover");
  assert.equal(exocortexState(owner).turret.hp, 5);
  await assert.rejects(updateExocortex(owner, "turret-recover"));
  game.combat.round = 2;
  await updateExocortex(owner, "turret-recover");
  assert.equal(exocortexState(owner).turret.hp, 10);
  await updateExocortex(owner, "turret-deploy");
  game.combat.round = 3;
  await assert.rejects(updateExocortex(owner, "turret-recover"));
  await updateExocortex(owner, "turret-deploy");
  game.combat.combatant.actor = { id: "other" };
  await assert.rejects(updateExocortex(owner, "turret-recover"));
});
test("Дрон: подтверждённая перезагрузка меняет только ОЗ, полный ремонт — до максимума", async () => {
  const { owner, drone } = linked();
  drone.conditions = ["custom"];
  await assert.rejects(repairDrone(owner));
  await repairDrone(owner, { confirmed: true, reboot: true });
  assert.equal(drone.system.attributes.hp.value, 1);
  assert.deepEqual(drone.conditions, ["custom"]);
  await assert.rejects(repairDrone(owner, { confirmed: true, reboot: true }));
  await repairDrone(owner, { confirmed: true });
  assert.equal(drone.system.attributes.hp.value, 30);
  assert.deepEqual(drone.writes[0], { "system.attributes.hp.value": 1 });
  await updateExocortex(owner, "drone-command", { actions: 2 });
  assert.equal(exocortexState(owner).drone.commandActions, 2);
  await assert.rejects(updateExocortex(owner, "drone-command", { actions: 3 }));
});
test("Импорт нативных действий идемпотентен и не удаляет ручные предметы", async () => {
  const owner = new Actor("owner", ["mine", "drone", "turret"], 15);
  const nativeModify = fixture.items.find(
    (i) => i.flags.core.sourceId === NATIVE_EXOCORTEX.modify,
  );
  owner.items.push({
    type: "action",
    system: { slug: nativeModify.system.slug },
    name: "Manual modify",
  });
  const count = owner.items.length;
  const result = await installExocortexActions(owner);
  assert.equal(result.length, 5);
  assert.equal(owner.items.length, count + 5);
  assert.equal((await installExocortexActions(owner)).length, 0);
  assert.ok(owner.items.find((i) => i.name === "Manual modify"));
  for (const source of result)
    assert.ok(
      source.flags.core.sourceId.startsWith("Compendium.sf2e.actions.Item."),
    );
  const archetype = new Actor("archetype", ["mine"], 15, 4, false);
  assert.deepEqual(eligibleExocortexActions(archetype), [
    "deployMine",
    "detonateMine",
  ]);
});
test("Ошибка отсутствующего источника не удаляет и не перезаписывает Items", async () => {
  const owner = new Actor();
  const initial = clone(owner.items);
  globalThis.fromUuid = async () => null;
  await assert.rejects(installExocortexActions(owner));
  assert.deepEqual(owner.items, initial);
});
test("Операции запрещены без зависимости, в PF2e, без прав или нужной особенности", async () => {
  const owner = new Actor();
  owner.isOwner = false;
  await assert.rejects(updateExocortex(owner, "mine-craft"));
  owner.isOwner = true;
  game.modules.get("pf2e-animal-companions").active = false;
  assert.throws(() => assertExocortexAccess(owner));
  game.modules.get("pf2e-animal-companions").active = true;
  game.system.id = "pf2e";
  await assert.rejects(rollMineDamage(owner));
  game.system.id = "sf2e";
  await assert.rejects(updateExocortex(owner, "turret-hp", { hp: 1 }));
  assert.equal(owner.getFlag(ID, "exocortex"), undefined);
});
