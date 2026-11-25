import { t } from "./i18n.mjs";
import { MODULE_ID as ID } from "./item-sources.mjs";
import { systemId } from "./system-context.mjs";
import { mechanicStats, isMechanic, TURRET_ARRAYS } from "./exocortex-rules.mjs";
import { assertExocortexAccess, exocortexState, updateExocortex } from "./exocortex.mjs";
import { captureDeviceSnapshot, buildDeviceActorSource, buildDeviceActionSources, buildTurretWeaponSource, getMineDamageTypes } from "./exocortex-device-sources.mjs";
import { chooseDevicePosition, registerExocortexAuthority, requestExocortexOperation } from "./exocortex-placement.mjs";

const queues = new Map();
const registeredHooks = new WeakSet();
const overrideWarnings = new WeakMap();
const syncingToggles = new Set();
const moduleHPWrites = new Map();
export const EXPANDED_TURRET_ARRAYS = {
  mental: { damage: "mental", dice: 2, range: 60, trait: "tech", group: "mental" },
  poison: { damage: "poison", dice: 2, range: 60, trait: "tech", group: "dart" },
  vitality: { damage: "vitality", dice: 2, range: 60, trait: "tech", group: "laser" },
  void: { damage: "void", dice: 2, range: 60, trait: "tech", group: "void" },
};
const fail = key => { throw new Error(t(key)); };
const numeric = value => typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
const value = (object, path) => path.split(".").reduce((node, key) => node?.[key], object);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const marker = document => document?.flags?.[ID]?.device;
function notifyProtected(actor, slugs) {
  const current = new Set(slugs);
  const previous = overrideWarnings.get(actor) ?? new Set();
  if (current.size) overrideWarnings.set(actor, current);
  else overrideWarnings.delete(actor);
  if ([...current].some(slug => !previous.has(slug))) ui.notifications.warn(t("ExoManualOverrides"));
}
const snapshot = owner => captureDeviceSnapshot(owner, { withoutLevel: !!game.pf2e?.settings?.variants?.pwol?.enabled });
const profile = owner => owner.getFlag(ID, "devices") ?? {};
const actorPaths = ["system.details.level.value", "system.attributes.ac.value", "system.attributes.hp.max", "system.attributes.hardness", "system.saves.fortitude.value", "system.saves.reflex.value"];
const actionSystemKeys = ["slug", "description", "actionType", "actions", "category", "frequency", "publication", "traits", "rules"];
const weaponSystemKeys = ["slug", "description", "category", "group", "baseItem", "damage", "bonus", "splashDamage", "range", "reload", "ammo", "level", "traits", "publication", "rules"];
const controlledSystemKeys = item => item.flags?.[ID]?.turretWeapon ? weaponSystemKeys : actionSystemKeys;
const pick = (object, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(object ?? {}, key)).map(key => [key, object[key]]));
const allTokens = () => [...game.scenes].flatMap(scene => [...scene.tokens]);
const tokenActor = token => token?.actor ?? token?.baseActor;
const worldActor = token => token?.baseActor ?? game.actors.get(token?.actorId);
async function updateActorDocument(actor, changes) {
  const writesHP = value(changes, "system.attributes.hp.value") !== undefined || changes["system.attributes.hp.value"] !== undefined;
  if (writesHP) moduleHPWrites.set(actor.id, (moduleHPWrites.get(actor.id) ?? 0) + 1);
  try { return await actor.update(changes); }
  finally {
    if (writesHP) {
      const remaining = moduleHPWrites.get(actor.id) - 1;
      if (remaining > 0) moduleHPWrites.set(actor.id, remaining);
      else moduleHPWrites.delete(actor.id);
    }
  }
}
const mineUuid = () => `Compendium.pf2e-summons-assistant.${systemId()}-summons-assistant-actors.Actor.sAVuxP25VE126TdZ`;
const MINE_DETONATE = "tech-pets-detonate-mine";
async function saveDeviceArt(owner, kind, key, art) {
  if (typeof art !== "string" || !art) return;
  const devices = profile(owner);
  if (devices.art?.[kind]?.[key] === art) return;
  await owner.setFlag(ID, "devices", { ...devices, art: { ...devices.art, [kind]: { ...devices.art?.[kind], [key]: art } } });
}
async function rememberActorArt(owner, actor) {
  const data = marker(actor);
  if (!data?.kind || typeof actor.img !== "string" || !actor.img) return;
  await saveDeviceArt(owner, data.kind, "actor", actor.img);
  for (const token of allTokens().filter(token => token.actorId === actor.id)) if (token.texture?.src !== actor.img) await token.update({ "texture.src": actor.img });
  if (data.kind === "turret" && actor.prototypeToken?.texture?.src !== actor.img) await actor.update({ "prototypeToken.texture.src": actor.img });
}
async function rememberTokenArt(owner, token) {
  const data = marker(token);
  const art = token.texture?.src;
  if (!data?.kind || typeof art !== "string" || !art) return;
  const actor = game.actors.get(token.actorId);
  if (art === actor?.img) return;
  await saveDeviceArt(owner, data.kind, "token", art);
  if (data.kind === "turret" && actor && actor.prototypeToken?.texture?.src !== art) await actor.update({ "prototypeToken.texture.src": art });
}

export function getTurretActor(owner) {
  const actor = game.actors.get(profile(owner).turretActorId);
  return marker(actor)?.kind === "turret" && marker(actor)?.ownerActorId === owner.id ? actor : null;
}
export function getAvailableTurretArrays(owner) {
  const selected = snapshot(owner).feats.includes("expansive-array") ? profile(owner).arrays ?? [] : [];
  return { ...TURRET_ARRAYS, ...Object.fromEntries(selected.filter(key => Object.hasOwn(EXPANDED_TURRET_ARRAYS, key)).map(key => [key, EXPANDED_TURRET_ARRAYS[key]])) };
}
function turretArray(owner) {
  const configured = profile(owner).array;
  const selected = configured === undefined ? exocortexState(owner).turret.array : configured;
  const arrays = getAvailableTurretArrays(owner);
  return Object.hasOwn(arrays, selected) ? selected : "laser";
}
export function getExocortexDeviceData(owner) {
  const state = exocortexState(owner);
  state.turret.array = turretArray(owner);
  const turret = getTurretActor(owner);
  if (turret) {
    state.turret.hp = turret.system.attributes.hp.value;
    state.turret.maxHP = turret.system.attributes.hp.max;
    state.turret.actorId = turret.id;
    state.turret.lastRecovery = marker(turret)?.lastRecovery ?? state.turret.lastRecovery;
    state.turret.deployed = allTokens().some(token => token.actorId === turret.id && marker(token)?.ownerActorId === owner.id);
  }
  return state;
}
function canonicalRule(rule) {
  const normalized = structuredClone(rule);
  const selectors = normalized.selectors ?? normalized.selector;
  delete normalized.selector;
  delete normalized.selectors;
  if (selectors !== undefined) normalized.selectors = Array.isArray(selectors) ? selectors : [selectors];
  if (normalized.key === "RollOption" && normalized.toggleable) {
    delete normalized.value;
    delete normalized.selection;
  }
  for (const key of ["predicate", "outcome", "suboptions"]) if (Array.isArray(normalized[key]) && !normalized[key].length) delete normalized[key];
  if (normalized.suboptions) normalized.suboptions = normalized.suboptions.map(canonicalRule);
  for (const key of ["ignored", "mergeable", "battleForm", "force", "hideIfDisabled", "removeAfterRoll"]) if (normalized[key] === false) delete normalized[key];
  if (normalized.fromEquipment === true) delete normalized.fromEquipment;
  if (normalized.type === "untyped") delete normalized.type;
  if (normalized.phase === "applyAEs") delete normalized.phase;
  if (normalized.priority === (normalized.key === "RollOption" ? 50 : 100)) delete normalized.priority;
  for (const [key, entry] of Object.entries(normalized)) if (entry === null) delete normalized[key];
  return normalized;
}
function fingerprint(source, item) {
  const system = pick(source.system, controlledSystemKeys(item));
  if (system.rules) system.rules = system.rules.map(canonicalRule);
  return JSON.stringify({ name: source.name, img: source.img, system });
}
function itemFingerprint(item) {
  return fingerprint(item.toObject(), item);
}
function hasControlFingerprint(item) {
  const control = item.flags[ID]?.control;
  if (control === itemFingerprint(item)) return true;
  if (typeof control !== "string") return false;
  try { return fingerprint(JSON.parse(control), item) === itemFingerprint(item); }
  catch { return false; }
}
function controlledItem(source) {
  const copy = structuredClone(source);
  delete copy._id;
  delete copy._key;
  copy.flags ??= {};
  copy.flags[ID] = { ...copy.flags[ID], deviceItem: copy.flags[ID]?.deviceKey ?? copy.system.slug };
  return copy;
}
async function markItems(actor) {
  for (const item of actor.items) if (item.flags[ID]?.deviceItem) await item.setFlag(ID, "control", itemFingerprint(item));
}
async function syncItems(actor, sources, { damageType } = {}) {
  const protectedItems = [];
  const sourceKey = source => source.flags?.[ID]?.deviceKey ?? source.system.slug;
  const wanted = new Set(sources.map(sourceKey));
  for (const source of sources) {
    const key = sourceKey(source);
    let current = [...actor.items].find(item => item.flags[ID]?.deviceItem === key);
    if (!current && key === MINE_DETONATE) current = [...actor.items].find(item => item.system.slug === "detonate-mine" && !item.flags[ID]?.deviceItem);
    if (!current) {
      if ([...actor.items].some(item => item.system.slug === source.system.slug)) { protectedItems.push(key); continue; }
      const created = await actor.createEmbeddedDocuments("Item", [controlledItem(source)]);
      for (const item of created) await item.setFlag(ID, "control", itemFingerprint(item));
      continue;
    }
    if (!current.flags[ID]?.deviceItem) {
      await current.setFlag(ID, "deviceItem", key);
      await current.setFlag(ID, "control", itemFingerprint(current));
    }
    if (!hasControlFingerprint(current)) { protectedItems.push(key); continue; }
    const desired = controlledItem(source);
    if (key === MINE_DETONATE && current.system.slug === "detonate-mine") {
      desired.system.slug = current.system.slug;
      desired.name = current.name;
    }
    for (const rule of desired.system.rules ?? []) {
      const previous = current.system.rules?.find(entry => entry.key === "RollOption" && entry.option === rule.option);
      if (rule.key === "RollOption" && rule.toggleable && previous) {
        rule.value = previous.value;
        const selection = rule.option === "tech-pets:mine-damage-type" && damageType ? damageType : previous.selection;
        if (selection && rule.suboptions?.some(option => option.value === selection)) rule.selection = selection;
      }
    }
    const system = { ...current.toObject().system, ...pick(desired.system, controlledSystemKeys(current)) };
    if (current.flags[ID]?.turretWeapon) system.expend = desired.system.expend;
    await current.update({ name: desired.name, img: desired.img, system });
    await current.setFlag(ID, "control", itemFingerprint(current));
  }
  const removable = [...actor.items].filter(item => item.flags[ID]?.deviceItem && !wanted.has(item.flags[ID].deviceItem) && hasControlFingerprint(item));
  if (removable.length) await actor.deleteEmbeddedDocuments("Item", removable.map(item => item.id));
  return protectedItems;
}
function deviceActionSources(actor, kind, stats, damageType) {
  const nativeSlug = kind === "mine" ? [...actor.items].find(item => item.system.slug === "detonate-mine")?.system.slug : undefined;
  const sources = buildDeviceActionSources(kind, stats, { damageType, mineSlug: nativeSlug ?? MINE_DETONATE });
  if (kind === "mine") sources[0].flags[ID].deviceKey = MINE_DETONATE;
  return sources;
}
const turretWeapon = actor => [...(actor?.items ?? [])].find(item => item.flags[ID]?.turretWeapon);
const turretControls = actor => [...(actor?.items ?? [])].find(item => item.flags[ID]?.deviceItem === "tech-pets-turret-operation");
function toggleState(item) {
  return Object.fromEntries((item?.system.rules ?? []).filter(rule => rule.key === "RollOption" && rule.toggleable).map(rule => [rule.option, { value: rule.value, selection: rule.selection }]));
}
async function applyToggleState(item, state) {
  if (!item || syncingToggles.has(item.id)) return;
  const rules = structuredClone(item.system.rules ?? []);
  let changed = false;
  for (const rule of rules) {
    const next = state[rule.option];
    if (!next) continue;
    if (rule.value !== next.value) { rule.value = next.value; changed = true; }
    if (rule.selection !== next.selection) { rule.selection = next.selection; changed = true; }
  }
  if (!changed) return;
  syncingToggles.add(item.id);
  try { await item.update({ "system.rules": rules }); }
  finally { syncingToggles.delete(item.id); }
}
async function synchronizeTurretToggles(owner) {
  const turret = getTurretActor(owner);
  if (!turret) return;
  await applyToggleState(turretControls(turret), toggleState(turretWeapon(owner)));
}
async function syncActor(actor, owner, damageType) {
  const explicitDamageType = damageType;
  const data = marker(actor);
  const stats = snapshot(owner);
  if (explicitDamageType === undefined) {
    const selected = [...actor.items].find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine")?.system.rules?.find(rule => rule.option === "tech-pets:mine-damage-type")?.selection ?? data.damageType ?? "fire";
    damageType = getMineDamageTypes(stats).includes(selected) ? selected : "fire";
  }
  const array = getExocortexDeviceData(owner).turret.array;
  const desired = buildDeviceActorSource(data.kind, stats, { ownerActorId: owner.id, mineId: data.mineId, array, hp: actor.system.attributes.hp.value });
  const stored = actor.toObject();
  const control = structuredClone(data.control ?? {});
  const patch = {};
  for (const path of actorPaths) {
    if (data.kind === "mine" && path !== "system.details.level.value") continue;
    const next = value(desired, path);
    if (next === undefined) continue;
    if (equal(value(stored, path), value(control, path))) { patch[path] = next; foundry.utils.setProperty(control, path, next); }
  }
  if (data.kind === "turret" && patch["system.attributes.hp.max"] !== undefined) {
    const hp = actor.system.attributes.hp;
    patch["system.attributes.hp.value"] = hp.value <= 0 ? 0 : Math.max(0, Math.min(patch["system.attributes.hp.max"], hp.value + patch["system.attributes.hp.max"] - hp.max));
  }
  const ownershipBaseline = data.ownership ?? stored.ownership;
  const ownerOwnershipBaseline = data.ownerOwnership ?? owner.ownership;
  const ownershipOverrides = { ...(data.ownershipOverrides ?? {}) };
  const users = new Set([...Object.keys(ownershipBaseline), ...Object.keys(stored.ownership), ...Object.keys(owner.ownership), ...Object.keys(ownershipOverrides)]);
  for (const user of users) {
    const baselineHas = Object.hasOwn(ownershipBaseline, user);
    const currentHas = Object.hasOwn(stored.ownership, user);
    const baselineValue = baselineHas ? ownershipBaseline[user] : null;
    const currentValue = currentHas ? stored.ownership[user] : null;
    if (currentValue !== baselineValue) ownershipOverrides[user] = currentValue;
  }
  let ownership;
  if (!equal(ownerOwnershipBaseline, owner.ownership)) {
    const next = { ...stored.ownership };
    for (const user of users) {
      if (Object.hasOwn(ownershipOverrides, user)) continue;
      if (Object.hasOwn(owner.ownership, user)) next[user] = owner.ownership[user];
      else delete next[user];
    }
    if (!equal(next, stored.ownership)) ownership = next;
  }
  const device = {
    ...data,
    snapshot: stats,
    damageType,
    ownership: structuredClone(ownership ?? stored.ownership),
    ownershipOverrides,
    ownerOwnership: structuredClone(owner.ownership),
    control,
  };
  const documentPatch = { ...patch, flags: { [ID]: { device: _replace(device) } } };
  if (ownership) documentPatch.ownership = _replace(ownership);
  await updateActorDocument(actor, documentPatch);
  return await syncItems(actor, deviceActionSources(actor, data.kind, stats, damageType), { damageType: explicitDamageType });
}
async function createDeviceActor(owner, kind, mineId) {
  if (!game.user.isGM) fail("ExoGMRequired");
  const stats = snapshot(owner);
  const state = getExocortexDeviceData(owner);
  let source = buildDeviceActorSource(kind, stats, { ownerActorId: owner.id, mineId, array: state.turret.array, hp: kind === "turret" ? state.turret.hp : undefined });
  if (kind === "mine" && game.modules.get("pf2e-summons-assistant")?.active) {
    const document = await fromUuid(mineUuid());
    if (!document || document.type !== "npc") fail("ExoSourceMissing");
    const external = document.toObject();
    const nativeDetonate = external.items.find(item => item.system.slug === "detonate-mine");
    if (nativeDetonate) {
      nativeDetonate.flags ??= {};
      nativeDetonate.flags[ID] = { ...nativeDetonate.flags[ID], moduleProvided: true, deviceAction: true, kind: "mine", deviceKey: MINE_DETONATE };
      source.items = source.items.filter(item => item.system.slug !== MINE_DETONATE);
    }
    external.items = [...external.items, ...source.items];
    external.system.details.level.value = stats.level;
    external.system.abilities.int.mod = stats.int;
    external.system.traits ??= {};
    external.system.traits.size = { value: "sm" };
    external.system.resources ??= {};
    external.system.resources.dc = { value: stats.classDC };
    external.flags = { ...external.flags, [ID]: source.flags[ID] };
    source = external;
  }
  delete source._id;
  delete source._key;
  delete source.folder;
  source.name = `${owner.name} — ${t(kind === "mine" ? "ExoMine" : "ExoTurret")}`;
  source.ownership = { ...owner.ownership };
  source.flags[ID].device.createdByModule = true;
  source.flags[ID].device.ownership = structuredClone(source.ownership);
  source.flags[ID].device.ownerOwnership = structuredClone(owner.ownership);
  source.flags[ID].device.control = {};
  for (const path of actorPaths) if (value(source, path) !== undefined) foundry.utils.setProperty(source.flags[ID].device.control, path, structuredClone(value(source, path)));
  source.items = source.items.map(item => item.flags?.[ID]?.deviceAction || item.flags?.[ID]?.turretWeapon ? controlledItem(item) : item);
  source.prototypeToken ??= {};
  const art = profile(owner).art?.[kind];
  if (art?.actor) source.img = art.actor;
  if (art?.token || art?.actor) source.prototypeToken.texture = { ...source.prototypeToken.texture, src: art?.token ?? art.actor };
  source.prototypeToken.actorLink = kind === "turret";
  const actor = await CONFIG.Actor.documentClass.create(source);
  try {
    await markItems(actor);
    await syncItems(actor, deviceActionSources(actor, kind, stats));
  } catch (error) { await actor.delete(); throw error; }
  return actor;
}
async function ensureTurret(owner) {
  const existing = getTurretActor(owner);
  if (existing) return existing;
  if (game.actors.get(profile(owner).turretActorId)) fail("ExoAccess");
  const actor = await createDeviceActor(owner, "turret");
  try { await owner.setFlag(ID, "devices", { ...profile(owner), turretActorId: actor.id }); }
  catch (error) { await actor.delete(); throw error; }
  return actor;
}
function sceneFor(point) {
  const scene = game.scenes.get(point?.sceneId);
  if (!scene || !point.level || !scene.levels.get(point.level) || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.y < 0 || point.x >= scene.width || point.y >= scene.height) fail("ExoSceneRequired");
  return scene;
}
async function place(owner, kind, point, label) {
  const state = getExocortexDeviceData(owner);
  if (kind === "mine" && !state.mines.prepared) fail("ExoNoMines");
  if (kind === "turret" && state.turret.deployed) fail("ExoAlreadyDeployed");
  const scene = sceneFor(point);
  const mineId = kind === "mine" ? foundry.utils.randomID() : "";
  const actor = kind === "turret" ? await ensureTurret(owner) : await createDeviceActor(owner, kind, mineId);
  if (kind === "turret" && actor.system.attributes.hp.value <= 0) fail("ExoTurretZero");
  if (kind === "turret") await synchronize(owner);
  let token;
  try {
    const source = await actor.getTokenDocument({ x: point.x, y: point.y, level: point.level, elevation: point.elevation ?? 0, actorLink: kind === "turret", flags: { [ID]: { device: { kind, ownerActorId: owner.id, mineId } } } });
    [token] = await scene.createEmbeddedDocuments("Token", [source.toObject()]);
    if (kind === "mine") {
      state.mines.prepared--;
      state.mines.deployed.push({ id: mineId, label: String(label ?? "").trim().slice(0, 120) || t("ExoMine"), tokenUuid: token.uuid });
    } else state.turret.deployed = true;
    await owner.setFlag(ID, "exocortex", state);
    return state;
  } catch (error) {
    if (token) await token.delete();
    if (kind === "mine") await actor.delete();
    throw error;
  }
}
async function removeToken(owner, uuid) {
  const token = await fromUuid(uuid);
  if (!token) return;
  const actor = tokenActor(token);
  const base = worldActor(token);
  if (!actor || marker(token)?.ownerActorId !== owner.id || marker(actor)?.ownerActorId !== owner.id) fail("ExoAccess");
  await token.delete();
  if (marker(base)?.kind === "mine" && marker(base)?.ownerActorId === owner.id && marker(base)?.createdByModule && !allTokens().some(token => token.actorId === base.id)) await base.delete();
}
async function recall(owner) {
  const state = getExocortexDeviceData(owner);
  const actor = getTurretActor(owner);
  if (actor) for (const token of allTokens().filter(token => token.actorId === actor.id && marker(token)?.ownerActorId === owner.id)) await removeToken(owner, token.uuid);
  state.turret.deployed = false;
  await owner.setFlag(ID, "exocortex", state);
  return state;
}
async function synchronize(owner) {
  const selectedArray = turretArray(owner);
  if (profile(owner).array && profile(owner).array !== selectedArray) await owner.setFlag(ID, "devices", { ...profile(owner), array: selectedArray });
  const turret = getTurretActor(owner);
  if (turret) notifyProtected(turret, await syncActor(turret, owner));
  for (const mine of exocortexState(owner).mines.deployed) {
    const token = mine.tokenUuid && await fromUuid(mine.tokenUuid);
    const actor = tokenActor(token);
    if (actor && marker(actor)?.ownerActorId === owner.id) notifyProtected(actor, await syncActor(actor, owner));
  }
  if (turret) notifyProtected(owner, await syncItems(owner, [buildTurretWeaponSource(snapshot(owner), { array: selectedArray })]));
  await synchronizeTurretToggles(owner);
  return getExocortexDeviceData(owner);
}
async function adoptMine(owner, uuid) {
  const state = exocortexState(owner);
  if (state.mines.deployed.some(mine => mine.tokenUuid === uuid)) return state;
  const token = await fromUuid(uuid);
  const actor = tokenActor(token);
  const base = worldActor(token);
  const source = base?._stats?.compendiumSource ?? base?.flags?.core?.sourceId ?? "";
  const existing = marker(actor) ?? marker(base);
  if (!actor || !base || !source.startsWith("Compendium.pf2e-summons-assistant.") || !source.endsWith(".Actor.sAVuxP25VE126TdZ") || base.flags["pf2e-summons-assistant"]?.summoner?.id !== owner.id || (existing && existing.ownerActorId !== owner.id)) fail("ExoAccess");
  const id = foundry.utils.randomID();
  const stats = snapshot(owner);
  const device = { ...existing, kind: "mine", ownerActorId: owner.id, mineId: id, snapshot: stats, createdByModule: false, ownership: actor.toObject().ownership, ownerOwnership: structuredClone(owner.ownership), control: { system: { details: { level: { value: actor.toObject().system.details.level.value } } } } };
  await base.setFlag(ID, "device", device);
  if (base !== actor) await actor.setFlag(ID, "device", device);
  await token.setFlag(ID, "device", { kind: "mine", ownerActorId: owner.id, mineId: id });
  await syncItems(actor, deviceActionSources(actor, "mine", stats));
  if (!state.mines.prepared) ui.notifications.warn(t("ExoNoMines"));
  state.mines.prepared = Math.max(0, state.mines.prepared - 1);
  state.mines.deployed.push({ id, label: actor.name, tokenUuid: token.uuid });
  await owner.setFlag(ID, "exocortex", state);
  return state;
}
async function rollDeviceAction(actor, slug) {
  const item = [...actor.items].find(item => item.flags[ID]?.deviceItem === slug);
  const editor = game.pf2e?.TextEditor;
  if (!item || !editor?._onClickInlineRoll) fail("ExoDamageUnavailable");
  const wrapper = document.createElement("div");
  wrapper.dataset.itemUuid = item.uuid;
  wrapper.innerHTML = await editor.enrichHTML(item.system.description.value, { rollData: item.getRollData(), relativeTo: item });
  const link = wrapper.querySelector("a[data-damage-roll]");
  if (!link) fail("ExoDamageUnavailable");
  let rolled;
  const domain = `${item.system.slug}-inline-${slug === "tech-pets-healing-mine" ? "healing" : "damage"}`;
  const listener = Hooks.on("createChatMessage", message => {
    if (message.speaker.actor === actor.id && message.flags[systemId()]?.context?.domains?.includes(domain)) rolled = message;
  });
  try { await editor._onClickInlineRoll({ target: link, shiftKey: true, altKey: false, ctrlKey: false, metaKey: false }); }
  finally { Hooks.off("createChatMessage", listener); }
  return rolled;
}
function postedDetonationMessage(mine) {
  return [...game.messages].find(message => message.flags?.[ID]?.detonation?.attemptId === mine.detonationAttemptId && message.flags[ID].detonation.ownerActorId === mine.ownerActorId && message.flags[ID].detonation.mineId === mine.id);
}
async function removeResolvedMineActor(owner, mine) {
  for (const actor of game.actors) {
    const data = marker(actor);
    if (data?.kind === "mine" && data.ownerActorId === owner.id && data.mineId === mine.id && data.createdByModule && !allTokens().some(token => token.actorId === actor.id)) await actor.delete();
  }
}
async function detonateMine(owner, args) {
  const state = exocortexState(owner);
  const index = state.mines.deployed.findIndex(mine => mine.id === args.id);
  if (index < 0) fail("ExoMineMissing");
  const mine = state.mines.deployed[index];
  if (!mine.tokenUuid) return updateExocortex(owner, "mine-detonate", args);
  if (!args.confirmed) fail("ExoConfirmRequired");
  if (!mine.resolvedMessageId && mine.detonationAttemptId) {
    const posted = postedDetonationMessage(mine);
    if (posted) {
      mine.resolvedMessageId = posted.id;
      await owner.setFlag(ID, "exocortex", state);
    }
  }
  if (!mine.resolvedMessageId) {
    const token = await fromUuid(mine.tokenUuid);
    const actor = tokenActor(token);
    if (!actor || marker(actor)?.ownerActorId !== owner.id) fail("ExoMineMissing");
    const healing = args.damageType === "healing";
    const protectedItems = await syncActor(actor, owner, healing || args.damageType === "selected" ? undefined : args.damageType ?? "fire");
    notifyProtected(actor, protectedItems);
    mine.detonationAttemptId = foundry.utils.randomID();
    mine.ownerActorId = owner.id;
    await owner.setFlag(ID, "exocortex", state);
    const message = await rollDeviceAction(actor, healing ? "tech-pets-healing-mine" : "tech-pets-detonate-mine");
    if (!message) return state;
    try {
      await message.setFlag(ID, "detonation", { attemptId: mine.detonationAttemptId, ownerActorId: owner.id, mineId: mine.id });
    } catch (error) {
      mine.resolvedMessageId = message.id;
      await owner.setFlag(ID, "exocortex", state);
      throw error;
    }
    mine.resolvedMessageId = message.id;
    await owner.setFlag(ID, "exocortex", state);
  }
  if (mine.tokenUuid) await removeToken(owner, mine.tokenUuid);
  await removeResolvedMineActor(owner, mine);
  state.mines.deployed.splice(index, 1);
  await owner.setFlag(ID, "exocortex", state);
  return state;
}
async function updateTurretHP(owner, operation, args) {
  const actor = getTurretActor(owner);
  if (!actor) return args.sync ? getExocortexDeviceData(owner) : updateExocortex(owner, operation, args);
  const state = getExocortexDeviceData(owner);
  const max = actor.system.attributes.hp.max;
  let hp = args.sync ? actor.system.attributes.hp.value : numeric(args.hp);
  let recoveryKey;
  if (operation === "turret-repair") {
    if (!args.confirmed) fail("ExoConfirmRequired");
    hp = max;
  } else if (operation === "turret-recover") {
    const combat = game.combat;
    if (state.turret.deployed || !combat?.started || combat.combatant?.actor?.id !== owner.id) fail("ExoRecoveryTurn");
    recoveryKey = `${combat.id}:${combat.round}:${combat.turn}`;
    const lastRecovery = marker(actor)?.lastRecovery ?? state.turret.lastRecovery;
    if (lastRecovery === recoveryKey) fail("ExoRecoveryUsed");
    hp = Math.min(max, state.turret.hp + 5);
  }
  if (!Number.isFinite(hp) || hp < 0 || hp > max) fail("ExoInvalidHP");
  hp = Math.floor(hp);
  if (recoveryKey) {
    await updateActorDocument(actor, {
      "system.attributes.hp.value": hp,
      flags: { [ID]: { device: _replace({ ...marker(actor), lastRecovery: recoveryKey }) } },
    });
    state.turret.lastRecovery = recoveryKey;
  } else if (actor.system.attributes.hp.value !== hp) await updateActorDocument(actor, { "system.attributes.hp.value": hp });
  state.turret.hp = hp;
  await owner.setFlag(ID, "exocortex", state);
  if (!hp) return recall(owner);
  return state;
}
async function execute(owner, operation, args) {
  assertExocortexAccess(owner);
  const variant = operation.startsWith("mine-") ? "mine" : operation.startsWith("turret-") ? "turret" : null;
  if (variant && !mechanicStats(owner).variants.includes(variant)) fail("ExoVariantMissing");
  if (operation === "mine-place" || operation === "turret-place") return place(owner, variant, args.position, args.label);
  if (operation === "turret-create") { await ensureTurret(owner); return synchronize(owner); }
  if (operation === "turret-recall") return recall(owner);
  if (operation === "device-sync") return synchronize(owner);
  if (operation === "turret-arrays") {
    const limit = Math.min(4, 2 * [...owner.items].filter(item => item.type === "feat" && item.system.slug === "expansive-array").length);
    if (!Array.isArray(args.arrays) || args.arrays.length > limit || new Set(args.arrays).size !== args.arrays.length || args.arrays.some(key => !Object.hasOwn(EXPANDED_TURRET_ARRAYS, key))) fail("ExoInvalidArray");
    await owner.setFlag(ID, "devices", { ...profile(owner), arrays: [...args.arrays] });
    if (!getAvailableTurretArrays(owner)[getExocortexDeviceData(owner).turret.array]) await owner.setFlag(ID, "devices", { ...profile(owner), array: "laser" });
    return synchronize(owner);
  }
  if (operation === "turret-array") {
    if (!Object.hasOwn(getAvailableTurretArrays(owner), args.array)) fail("ExoInvalidArray");
    await owner.setFlag(ID, "devices", { ...profile(owner), array: args.array });
    return synchronize(owner);
  }
  if (operation === "mine-forget") {
    const state = exocortexState(owner);
    const mine = state.mines.deployed.find(entry => entry.tokenUuid === args.id);
    if (mine) {
      for (const actor of game.actors) {
        const data = marker(actor);
        if (data?.kind === "mine" && data.ownerActorId === owner.id && data.mineId === mine.id && data.createdByModule && !allTokens().some(token => token.actorId === actor.id)) await actor.delete();
      }
    }
    state.mines.deployed = state.mines.deployed.filter(entry => entry.tokenUuid !== args.id);
    await owner.setFlag(ID, "exocortex", state);
    return state;
  }
  if (operation === "turret-reconcile") {
    const state = getExocortexDeviceData(owner);
    await owner.setFlag(ID, "exocortex", state);
    return state;
  }
  if (operation === "mine-adopt") return adoptMine(owner, args.id);
  if (operation === "mine-detonate") return detonateMine(owner, args);
  if (["turret-hp", "turret-repair", "turret-recover"].includes(operation)) return updateTurretHP(owner, operation, args);
  if (["mine-collect", "mine-daily"].includes(operation)) {
    if (operation === "mine-daily" && !args.confirmed) fail("ExoConfirmRequired");
    for (const mine of exocortexState(owner).mines.deployed) if (mine.tokenUuid) await removeToken(owner, mine.tokenUuid);
  }
  if (operation === "mine-count") {
    const count = numeric(args.count);
    if (!Number.isInteger(count) || count < 0 || count > mechanicStats(owner).mineCapacity) fail("InlineInvalidCount");
    const state = exocortexState(owner);
    if (args.expected !== undefined && args.expected !== state.mines.prepared) fail("InlineStale");
    state.mines.prepared = count;
    await owner.setFlag(ID, "exocortex", state);
    return state;
  }
  await updateExocortex(owner, operation, args);
  return getExocortexDeviceData(owner);
}
function serialized(owner, operation, args) {
  const previous = queues.get(owner.id) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => execute(owner, operation, args));
  queues.set(owner.id, current);
  return current.finally(() => { if (queues.get(owner.id) === current) queues.delete(owner.id); });
}
export async function performExocortexOperation(owner, operation, args = {}) {
  assertExocortexAccess(owner);
  if (["mine-place", "turret-place"].includes(operation)) {
    if (args.position === null) return getExocortexDeviceData(owner);
    if (!args.position) {
      const position = await chooseDevicePosition(owner, operation.startsWith("mine") ? "mine" : "turret");
      if (!position) return getExocortexDeviceData(owner);
      args = { ...args, position };
    }
  }
  return requestExocortexOperation(owner, operation, args);
}
export async function rollTurretStrike(owner, map = 0) {
  assertExocortexAccess(owner);
  const turret = getTurretActor(owner);
  const state = getExocortexDeviceData(owner);
  if (!turret || !state.turret.deployed) fail("ExoTurretStored");
  if (turret.system.attributes.hp.value <= Math.floor(turret.system.attributes.hp.max / 2)) fail("ExoBroken");
  if (![0, 1, 2].includes(map)) fail("ExoInvalidCommand");
  const weapon = [...owner.items].find(item => item.flags[ID]?.turretWeapon);
  const strike = owner.system.actions?.find(action => action.item.id === weapon?.id);
  if (!strike) fail("ExoSourceMissing");
  const target = [...(game.user.targets ?? [])][0];
  const ac = target?.actor?.armorClass?.value;
  return strike.variants[map].roll({ target: false, dc: Number.isFinite(ac) ? { value: ac } : undefined, consumeAmmo: false, options: ["tech-pets:turret-origin"] });
}
export function registerExocortexDevices() {
  registerExocortexAuthority(serialized);
  if (registeredHooks.has(Hooks)) return;
  registeredHooks.add(Hooks);
  const safe = callback => async (...args) => {
    try { await callback(...args); }
    catch (error) { ui.notifications.error(error.message); }
  };
  Hooks.on("updateActor", safe(async (actor, changes, _options, userId) => {
    if (userId && userId !== game.user.id) return;
    const data = marker(actor);
    if (data?.kind && changes.img !== undefined) {
      const owner = game.actors.get(data.ownerActorId);
      if (owner) await rememberActorArt(owner, actor);
    } else if (changes.flags?.["pf2e-summons-assistant"]?.summoner && !data?.createdByModule) {
      const owner = game.actors.get(actor.flags["pf2e-summons-assistant"]?.summoner?.id);
      if (owner && isMechanic(owner)) for (const token of allTokens().filter(token => token.actorId === actor.id && worldActor(token)?.flags["pf2e-summons-assistant"]?.summoner?.id === owner.id)) await performExocortexOperation(owner, "mine-adopt", { id: token.uuid });
    } else if (data?.kind === "turret" && (value(changes, "system.attributes.hp.value") !== undefined || changes["system.attributes.hp.value"] !== undefined)) {
      if (moduleHPWrites.has(actor.id)) return;
      const owner = game.actors.get(data.ownerActorId);
      if (owner) await performExocortexOperation(owner, "turret-hp", { sync: true });
    } else if (isMechanic(actor) && (changes.system || changes.ownership) && (getTurretActor(actor) || exocortexState(actor).mines.deployed.some(mine => mine.tokenUuid))) await performExocortexOperation(actor, "device-sync");
  }));
  for (const hook of ["createItem", "updateItem", "deleteItem"]) Hooks.on(hook, safe(async (item, _changes, _options, userId) => {
    const author = typeof _options === "string" ? _options : userId;
    if (author && author !== game.user.id) return;
    if (syncingToggles.has(item.id)) return;
    const controller = isMechanic(item.actor) ? item.actor : game.actors.get(marker(item.actor)?.ownerActorId);
    const ownerWeapon = item.actor === controller && item.flags[ID]?.turretWeapon;
    const deviceControls = marker(item.actor)?.kind === "turret" && item.flags[ID]?.deviceItem === "tech-pets-turret-operation";
    if ((ownerWeapon || deviceControls) && (_changes?.system?.rules !== undefined || _changes?.["system.rules"] !== undefined)) {
      if (!controller) return;
      const target = ownerWeapon ? turretControls(getTurretActor(controller)) : turretWeapon(controller);
      await applyToggleState(target, toggleState(item));
      return;
    }
    const owner = item.actor;
    if (isMechanic(owner) && !item.flags[ID]?.deviceItem && (getTurretActor(owner) || exocortexState(owner).mines.deployed.some(mine => mine.tokenUuid))) await performExocortexOperation(owner, "device-sync");
  }));
  Hooks.on("updateToken", safe(async (token, changes, _options, userId) => {
    if (userId && userId !== game.user.id) return;
    const art = value(changes, "texture.src") ?? changes["texture.src"];
    if (art === undefined) return;
    const data = marker(token);
    const owner = data && game.actors.get(data.ownerActorId);
    if (owner) await rememberTokenArt(owner, token);
  }));
  Hooks.on("deleteToken", safe(async (token, _options, userId) => {
    if (userId && userId !== game.user.id) return;
    const data = marker(token);
    const owner = data && game.actors.get(data.ownerActorId);
    if (!owner || !isMechanic(owner)) return;
    await rememberTokenArt(owner, token);
    await performExocortexOperation(owner, data.kind === "mine" ? "mine-forget" : "turret-reconcile", { id: token.uuid });
  }));
}
