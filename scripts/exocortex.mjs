// Учёт устройств экзокортекса. Положение/цели/действия персонажа не изменяются автоматически.
import { t } from "./i18n.mjs";
import { MODULE_ID } from "./item-sources.mjs";
import {
  NATIVE_EXOCORTEX,
  TURRET_ARRAYS,
  itemSource,
  isMechanic,
  mechanicStats,
  eligibleExocortexActions,
} from "./exocortex-rules.mjs";
const queues = new Map();
const fail = (key) => {
  throw new Error(t(key));
};
export function assertExocortexAccess(owner) {
  if (
    game.system.id !== "sf2e" ||
    !game.modules.get("pf2e-animal-companions")?.active
  )
    fail("DependencyMissing");
  if (!isMechanic(owner) || owner.isOwner === false) fail("ExoAccess");
}
function serialized(owner, task) {
  const previous = queues.get(owner.id) ?? Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => {
      assertExocortexAccess(owner);
      return task();
    });
  queues.set(owner.id, current);
  return current.finally(() => {
    if (queues.get(owner.id) === current) queues.delete(owner.id);
  });
}
export function linkedDrone(owner) {
  if (!mechanicStats(owner).variants.includes("drone")) return null;
  const id = owner.getFlag(MODULE_ID, "robot")?.companionActorId;
  const companion = game.actors.get(id);
  return companion?.type === "character" &&
    companion.id !== owner.id &&
    companion.getFlag(MODULE_ID, "robot")?.ownerActorId === owner.id
    ? companion
    : null;
}
export function droneCommercialSlots(owner) {
  return linkedDrone(owner) ? 2 : 0;
}
export function exocortexState(owner) {
  const saved = owner.getFlag(MODULE_ID, "exocortex") ?? {};
  const stats = mechanicStats(owner);
  return {
    schemaVersion: 1,
    mines: {
      prepared: Math.max(0, Math.floor(Number(saved.mines?.prepared) || 0)),
      deployed: structuredClone(saved.mines?.deployed ?? []),
    },
    turret: {
      array: TURRET_ARRAYS[saved.turret?.array] ? saved.turret.array : "laser",
      hp: Number.isFinite(saved.turret?.hp)
        ? Math.max(0, Math.min(stats.turretHP, saved.turret.hp))
        : stats.turretHP,
      deployed: !!saved.turret?.deployed,
      lastRecovery: saved.turret?.lastRecovery ?? "",
    },
    drone: { commandActions: saved.drone?.commandActions === 2 ? 2 : 1 },
  };
}
async function save(owner, state) {
  await owner.setFlag(MODULE_ID, "exocortex", state);
  return state;
}
function requireVariant(owner, variant) {
  if (!mechanicStats(owner).variants.includes(variant))
    fail("ExoVariantMissing");
}
export function updateExocortex(owner, operation, args = {}) {
  return serialized(owner, async () => {
    const stats = mechanicStats(owner),
      state = exocortexState(owner);
    if (operation.startsWith("mine-")) requireVariant(owner, "mine");
    if (operation.startsWith("turret-")) requireVariant(owner, "turret");
    if (operation.startsWith("drone-")) requireVariant(owner, "drone");
    switch (operation) {
      case "mine-daily":
        if (!args.confirmed) fail("ExoConfirmRequired");
        state.mines = { prepared: stats.mineCapacity, deployed: [] };
        break;
      case "mine-craft": {
        const total = state.mines.prepared;
        state.mines.prepared += Math.min(
          2,
          Math.max(0, stats.mineCapacity - total),
        );
        break;
      }
      case "mine-deploy":
        if (!state.mines.prepared) fail("ExoNoMines");
        state.mines.prepared--;
        state.mines.deployed.push({
          id: foundry.utils.randomID(),
          label:
            String(args.label ?? "")
              .trim()
              .slice(0, 120) || t("ExoMine"),
        });
        break;
      case "mine-collect":
        state.mines.prepared += state.mines.deployed.length;
        state.mines.deployed = [];
        break;
      case "mine-detonate": {
        const index = state.mines.deployed.findIndex(
          (mine) => mine.id === args.id,
        );
        if (index < 0) fail("ExoMineMissing");
        // Сначала настоящий типизированный бросок; при ошибке мина остаётся в учёте.
        await rollMineDamage(owner, args.damageType ?? "fire");
        state.mines.deployed.splice(index, 1);
        break;
      }
      case "turret-array":
        if (!TURRET_ARRAYS[args.array]) fail("ExoInvalidArray");
        state.turret.array = args.array;
        break;
      case "turret-deploy":
        if (state.turret.hp <= 0) fail("ExoTurretZero");
        state.turret.deployed = !state.turret.deployed;
        break;
      case "turret-hp": {
        const hp = Number(args.hp);
        if (!Number.isFinite(hp) || hp < 0 || hp > stats.turretHP)
          fail("ExoInvalidHP");
        state.turret.hp = Math.floor(hp);
        if (!state.turret.hp) state.turret.deployed = false;
        break;
      }
      case "turret-repair":
        if (!args.confirmed) fail("ExoConfirmRequired");
        state.turret.hp = stats.turretHP;
        break;
      case "turret-recover": {
        const combat = game.combat;
        if (
          state.turret.deployed ||
          !combat?.started ||
          combat.combatant?.actor?.id !== owner.id
        )
          fail("ExoRecoveryTurn");
        const key = `${combat.id}:${combat.round}:${combat.turn}`;
        if (state.turret.lastRecovery === key) fail("ExoRecoveryUsed");
        state.turret.hp = Math.min(stats.turretHP, state.turret.hp + 5);
        state.turret.lastRecovery = key;
        break;
      }
      case "drone-command":
        if (![1, 2].includes(Number(args.actions))) fail("ExoInvalidCommand");
        state.drone.commandActions = Number(args.actions);
        break;
      default:
        fail("ExoUnknownOperation");
    }
    return save(owner, state);
  });
}
export async function rollMineDamage(owner, damageType = "fire") {
  assertExocortexAccess(owner);
  requireVariant(owner, "mine");
  if (!["fire", "piercing"].includes(damageType)) fail("ExoInvalidDamage");
  const DamageRoll = CONFIG.Dice.rolls.find(
    (roll) => roll.name === "DamageRoll",
  );
  if (!DamageRoll) fail("ExoDamageUnavailable");
  const stats = mechanicStats(owner);
  const roll = new DamageRoll(`{${stats.mineDice}d6[${damageType}]}`);
  await roll.evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: owner }),
    // SF2e читает area-damage из контекста сообщения при ручном применении IWR.
    flags: {
      sf2e: {
        context: {
          type: "damage-roll",
          sourceType: "save",
          options: ["area-damage", "area-effect"],
          domains: [],
          traits: [],
        },
      },
    },
    flavor: `${t("ExoDetonate")} · ${stats.mineRadius} ${t("ExoFeet")} · ${t("ExoClassDC")}: ${stats.classDC ?? "—"} · ${t("ExoBasicReflex")}`,
  });
  return roll;
}
export function repairDrone(owner, { reboot = false, confirmed = false } = {}) {
  return serialized(owner, async () => {
    if (!confirmed) fail("ExoConfirmRequired");
    const drone = linkedDrone(owner);
    if (!drone || drone.isOwner === false) fail("ExoDroneMissing");
    const hp = drone.system?.attributes?.hp;
    if (!Number.isFinite(hp?.max) || !Number.isFinite(hp?.value))
      fail("ExoInvalidHP");
    if (reboot && hp.value !== 0) fail("ExoDroneNotShutdown");
    await drone.update({
      "system.attributes.hp.value": reboot ? Math.min(1, hp.max) : hp.max,
    });
    return drone;
  });
}
export function installExocortexActions(owner) {
  return serialized(owner, async () => {
    const created = [];
    for (const key of eligibleExocortexActions(owner)) {
      const uuid = NATIVE_EXOCORTEX[key];
      if (Array.from(owner.items).some((item) => itemSource(item) === uuid))
        continue;
      const document = await fromUuid(uuid);
      if (!document || document.type !== "action") fail("ExoSourceMissing");
      const source = document.toObject();
      // Идемпотентность для старых ручных импортов без sourceId; сами Items не изменяются.
      if (
        Array.from(owner.items).some(
          (item) =>
            item.type === "action" && item.system?.slug === source.system.slug,
        )
      )
        continue;
      delete source._id;
      delete source._key;
      delete source.folder;
      source.flags ??= {};
      source.flags.core ??= {};
      source.flags.core.sourceId = uuid;
      source.flags[MODULE_ID] = {
        ...(source.flags[MODULE_ID] ?? {}),
        exocortexAction: true,
      };
      created.push(...(await owner.createEmbeddedDocuments("Item", [source])));
    }
    return created;
  });
}
export async function showExocortexSource(owner, key, { chat = false } = {}) {
  assertExocortexAccess(owner);
  if (!Object.hasOwn(NATIVE_EXOCORTEX, key)) fail("ExoSourceMissing");
  if (
    ["drone", "mine", "turret"].includes(key) &&
    !mechanicStats(owner).variants.includes(key)
  )
    fail("ExoVariantMissing");
  const document =
    Array.from(owner.items).find(
      (item) => itemSource(item) === NATIVE_EXOCORTEX[key],
    ) ?? (await fromUuid(NATIVE_EXOCORTEX[key]));
  if (!document) fail("ExoSourceMissing");
  if (chat) return document.toMessage();
  return document.sheet.render(true);
}
