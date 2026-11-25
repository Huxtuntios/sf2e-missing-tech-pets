import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { registerExocortexDevices, performExocortexOperation, getTurretActor, getExocortexDeviceData, getAvailableTurretArrays, rollTurretStrike } from "../scripts/exocortex-devices.mjs";

const ID = "sf2e-missing-tech-pets";
let serial, owner, scene, documents, events, psaSource, warnings;
function clone(value) {
  if (value === globalThis._del || value?.__replace) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  return value;
}
class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
  find(fn) { return [...this.values()].find(fn); }
  filter(fn) { return [...this.values()].filter(fn); }
  get contents() { return [...this.values()]; }
}
function patch(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split(".");
    let node = target;
    while (parts.length > 1) { const part = parts.shift(); node = node[part] ??= {}; }
    node[parts[0]] = clone(value);
  }
}
function mergePatch(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split(".");
    let node = target;
    while (parts.length > 1) { const part = parts.shift(); node = node[part] ??= {}; }
    const last = parts[0];
    if (value === globalThis._del) { delete node[last]; continue; }
    if (value?.__replace) { node[last] = clone(value.__replace); continue; }
    if (node[last] && typeof node[last] === "object" && !Array.isArray(node[last]) && value && typeof value === "object" && !Array.isArray(value)) mergePatch(node[last], value);
    else node[last] = clone(value);
  }
}
class Item {
  constructor(source, actor) { this.data = clone(source); this.id = this.data._id = `item${++serial}`; this.parent = actor; this.actor = actor; this.uuid = `${actor.uuid}.Item.${this.id}`; this.type = source.type; documents.set(this.uuid, this); }
  get flags() { return this.data.flags ?? {}; }
  get system() { return this.data.system; }
  get name() { return this.data.name; }
  get img() { return this.data.img; }
  toObject() { return clone(this.data); }
  async update(changes) { patch(this.data, changes); return this; }
  async setFlag(scope, key, value) { this.data.flags ??= {}; this.data.flags[scope] ??= {}; this.data.flags[scope][key] = clone(value); return this; }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  getRollData() { return { actor: this.actor, item: this }; }
}
class Actor {
  constructor(source) {
    this.data = clone(source); this.id = this.data._id ?? `actor${++serial}`; this.uuid = `Actor.${this.id}`; this.isOwner = true; this.items = new Collection();
    for (const item of source.items ?? []) { const doc = new Item(item, this); this.items.set(doc.id, doc); }
    documents.set(this.uuid, this);
  }
  static async create(source) { const actor = new Actor(source); game.actors.set(actor.id, actor); return actor; }
  get name() { return this.data.name; }
  get img() { return this.data.img; }
  get type() { return this.data.type; }
  get system() { return this.data.system; }
  get flags() { return this.data.flags ?? {}; }
  get ownership() { return this.data.ownership ?? {}; }
  get level() { return this.data.system.details.level.value; }
  get _stats() { return this.data._stats ?? {}; }
  toObject() { return { ...clone(this.data), items: [...this.items].map(item => item.toObject()) }; }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  async setFlag(scope, key, value) {
    if (scope === ID && key === "exocortex") {
      this.ledgerWrites = (this.ledgerWrites ?? 0) + 1;
      if (this.failLedger || this.failLedgerAt === this.ledgerWrites) throw new Error("ledger write failed");
    }
    this.data.flags ??= {}; this.data.flags[scope] ??= {}; this.data.flags[scope][key] = clone(value); return this;
  }
  async update(changes) { patch(this.data, changes); return this; }
  getStatistic(key) { return key === "mechanic" ? { dc: { value: this.dc ?? 23 } } : null; }
  testUserPermission(user) { return user?.isGM || this.ownership[user?.id] === 3; }
  getActiveTokens() { return []; }
  async getTokenDocument(data) { return { toObject: () => ({ ...clone(this.data.prototypeToken ?? {}), actorId: this.id, ...clone(data) }) }; }
  async createEmbeddedDocuments(type, sources) { assert.equal(type, "Item"); const allowed = this.type === "hazard" ? ["condition", "effect", "action", "melee"] : null; return sources.map(source => { if (allowed) assert.ok(allowed.includes(source.type), `hazard cannot own ${source.type}`); const item = new Item(source, this); this.items.set(item.id, item); return item; }); }
  async updateEmbeddedDocuments(type, changes) { return Promise.all(changes.map(change => this.items.get(change._id).update(change))); }
  async deleteEmbeddedDocuments(type, ids) { for (const id of ids) this.items.delete(id); }
  async update(changes, options = {}) {
    const next = clone(changes);
    if (next.ownership && options.recursive !== false && !next.ownership.__replace) next.ownership = { ...clone(this.data.ownership ?? {}), ...next.ownership };
    if (options.recursive === false) {
      if (Object.keys(next).some(key => key.startsWith("flags."))) {
        const flags = {};
        const rest = {};
        for (const [key, entry] of Object.entries(next)) {
          if (key.startsWith("flags.")) patch(flags, { [key.slice(6)]: entry });
          else rest[key] = entry;
        }
        patch(this.data, rest);
        this.data.flags = flags;
      } else patch(this.data, next);
    } else mergePatch(this.data, next);
    return this;
  }
  async delete() { game.actors.delete(this.id); documents.delete(this.uuid); }
}
class Token {
  constructor(source, parent) { this.data = clone(source); this.id = `token${++serial}`; this.parent = parent; this.uuid = `Scene.${parent.id}.Token.${this.id}`; documents.set(this.uuid, this); }
  get actor() { return game.actors.get(this.data.actorId); }
  get baseActor() { return game.actors.get(this.data.actorId); }
  get actorId() { return this.data.actorId; }
  get flags() { return this.data.flags ?? {}; }
  get texture() { return this.data.texture ?? {}; }
  getFlag(scope, key) { return this.flags[scope]?.[key]; }
  async setFlag(scope, key, value) { this.data.flags ??= {}; this.data.flags[scope] ??= {}; this.data.flags[scope][key] = clone(value); return this; }
  async update(changes) { patch(this.data, changes); return this; }
  async delete() { this.parent.tokens.delete(this.id); documents.delete(this.uuid); }
}
beforeEach(async () => {
  serial = 0; documents = new Map(); events = new Map(); warnings = [];
  globalThis.CONFIG = { Actor: { documentClass: Actor }, queries: {} };
  globalThis.Actor = Actor;
  globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  globalThis._del = { forcedDeletion: true };
  globalThis._replace = value => ({ __replace: value });
  globalThis.Hooks = { on: (name, fn) => { events.set(name, [...(events.get(name) ?? []), fn]); return fn; }, off: (name, fn) => events.set(name, (events.get(name) ?? []).filter(item => item !== fn)) };
  globalThis.foundry = { utils: { randomID: () => `id${++serial}`, getProperty: (object, path) => path.split(".").reduce((node, key) => node?.[key], object), setProperty: (object, path, value) => patch(object, { [path]: value }) } };
  globalThis.ui = { notifications: { warn: key => warnings.push(key), error: () => {}, info: () => {} } };
  const gm = { id: "gm", isGM: true };
  globalThis.game = { system: { id: "sf2e" }, actors: new Collection(), scenes: new Collection(), messages: new Collection(), modules: new Map(), user: gm, users: { activeGM: gm }, i18n: { localize: key => key } };
  owner = await Actor.create({ name: "Mechanic", type: "character", system: { details: { level: { value: 5 } }, abilities: { int: { mod: 4 } } }, items: [{ name: "Mechanic", type: "class", system: { slug: "mechanic" } }, ...["mine", "turret"].map(slug => ({ name: slug, type: "feat", system: { slug, traits: { otherTags: ["mechanic-exocortex"] } } }))], ownership: { default: 0, player: 3 }, flags: { [ID]: { exocortex: { mines: { prepared: 4, deployed: [] }, turret: { hp: 40, array: "laser", deployed: false } } } } });
  scene = { id: "scene", active: true, width: 1000, height: 1000, levels: new Collection([["level", { id: "level" }]]), tokens: new Collection(), async createEmbeddedDocuments(type, sources) { assert.equal(type, "Token"); if (this.failCreate) throw new Error("token creation failed"); return sources.map(source => { const token = new Token(source, this); this.tokens.set(token.id, token); return token; }); } };
  game.scenes.set(scene.id, scene);
  globalThis.canvas = { ready: true, scene, level: { id: "level" } };
  psaSource = { name: "PSA Mine", type: "npc", img: "mine.webp", system: { details: { level: { value: 1 } }, abilities: { int: { mod: 0 } }, attributes: { hp: { max: 10, value: 10 }, ac: { value: 10 } }, resources: {} }, items: [{ name: "External Detonate", type: "action", system: { slug: "detonate-mine", rules: [] } }], flags: {}, _stats: { compendiumSource: "Compendium.pf2e-summons-assistant.sf2e-summons-assistant-actors.Actor.sAVuxP25VE126TdZ" } };
  globalThis.fromUuid = async uuid => documents.get(uuid) ?? (uuid === psaSource._stats.compendiumSource ? { type: "npc", toObject: () => clone(psaSource) } : null);
  registerExocortexDevices();
});
const point = () => ({ sceneId: "scene", x: 200, y: 300, level: "level", elevation: 0 });
const chatMessage = (id, actor, domain, options = []) => ({
  id, speaker: { actor }, data: { flags: {} },
  flags: { sf2e: { context: { domains: [domain], options } } },
  async setFlag(scope, key, entry) { this.data.flags ??= {}; this.data.flags[scope] ??= {}; this.data.flags[scope][key] = clone(entry); this.flags = this.data.flags; },
});
const detonationOption = () => `tech-pets:detonation:${owner.getFlag(ID, "exocortex").mines.deployed[0].detonationAttemptId}`;

test("mine placement spends one mine only after its actor and token exist", async () => {
  const state = await performExocortexOperation(owner, "mine-place", { position: point(), label: "Alpha" });
  assert.equal(state.mines.prepared, 3);
  assert.equal(state.mines.deployed.length, 1);
  assert.equal(state.mines.deployed[0].label, "Alpha");
  assert.equal(scene.tokens.contents[0].actor.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine").name, "Detonate Mine");
  assert.ok(documents.has(state.mines.deployed[0].tokenUuid));
  assert.equal(scene.tokens.size, 1);
});
test("failed token creation rolls back its new actor without spending a mine", async () => {
  scene.failCreate = true;
  await assert.rejects(performExocortexOperation(owner, "mine-place", { position: point() }), /token creation failed/);
  assert.equal(game.actors.size, 1);
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 4);
});
test("failed ledger write removes newly created mine actor and token", async () => {
  owner.failLedger = true;
  await assert.rejects(performExocortexOperation(owner, "mine-place", { position: point() }), /ledger write failed/);
  assert.equal(scene.tokens.size, 0);
  assert.equal(game.actors.size, 1);
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 4);
});
test("simultaneous placements are serialized per mechanic", async () => {
  await Promise.all([performExocortexOperation(owner, "mine-place", { position: point() }), performExocortexOperation(owner, "mine-place", { position: point() })]);
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 2);
  assert.equal(owner.getFlag(ID, "exocortex").mines.deployed.length, 2);
});
test("PSA integration keeps its original action and never mutates pack source", async () => {
  game.modules.set("pf2e-summons-assistant", { active: true });
  const original = clone(psaSource);
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const mine = scene.tokens.contents[0].actor;
  assert.equal(mine.type, "npc");
  assert.equal(mine.system.traits.size.value, "sm");
  const detonate = mine.items.find(item => item.system.slug === "detonate-mine");
  assert.ok(detonate);
  assert.equal(detonate.name, "External Detonate");
  assert.equal(detonate.flags[ID].deviceItem, "tech-pets-detonate-mine");
  assert.ok(detonate.system.rules.some(rule => rule.option === "tech-pets:targeting-mine"));
  assert.equal(mine.items.filter(item => ["detonate-mine", "tech-pets-detonate-mine"].includes(item.system.slug)).length, 1);
  assert.equal(psaSource.items[0].name, "External Detonate");
  assert.deepEqual(psaSource.items[0].system.rules, []);
  assert.equal(mine.flags[ID].device.snapshot.int, 4);
  assert.deepEqual(psaSource, original);
});
test("PSA detonation uses the native item slug for rules and message completion", async () => {
  game.modules.set("pf2e-summons-assistant", { active: true });
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const action = actor.items.find(item => item.system.slug === "detonate-mine");
  assert.equal(action.system.rules.find(rule => rule.key === "FlatModifier").selector, "detonate-mine-inline-damage");
  const message = chatMessage("psa-message", actor.id, "detonate-mine-inline-damage");
  game.messages.set(message.id, message);
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {
    message.flags.sf2e.context.options = [detonationOption()];
    for (const callback of events.get("createChatMessage") ?? []) await callback(message);
  } } };
  const result = await performExocortexOperation(owner, "mine-detonate", { id: owner.getFlag(ID, "exocortex").mines.deployed[0].id, damageType: "fire", confirmed: true });
  assert.equal(result.mines.deployed.length, 0);
  assert.equal(scene.tokens.size, 0);
});

test("recalling turret preserves the same owned actor and its damage", async () => {
  await performExocortexOperation(owner, "turret-place", { position: point() });
  const actor = getTurretActor(owner);
  assert.equal(actor.type, "hazard");
  assert.equal(actor.ownership.player, 3);
  await actor.update({ "system.attributes.hp.value": 22 });
  await performExocortexOperation(owner, "turret-recall");
  assert.equal(scene.tokens.size, 0);
  assert.equal(game.actors.get(actor.id), actor);
  await performExocortexOperation(owner, "turret-place", { position: point() });
  assert.equal(getTurretActor(owner).id, actor.id);
  assert.equal(getExocortexDeviceData(owner).turret.hp, 22);
});

test("synchronization recalls a deployed turret when its synchronized HP reaches zero", async () => {
  await owner.update({ "system.details.level.value": 20 });
  await performExocortexOperation(owner, "turret-place", { position: point() });
  const actor = getTurretActor(owner);
  await actor.update({ "system.attributes.hp.value": 1 });
  await owner.update({ "system.details.level.value": 1 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.system.attributes.hp.value, 0);
  assert.equal(scene.tokens.size, 0);
  assert.equal(getExocortexDeviceData(owner).turret.deployed, false);
});

test("turret placement rechecks HP after synchronization before creating a token", async () => {
  await owner.update({ "system.details.level.value": 20 });
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ "system.attributes.hp.value": 1 });
  await owner.update({ "system.details.level.value": 1 });
  await assert.rejects(performExocortexOperation(owner, "turret-place", { position: point() }), /ExoTurretZero/);
  assert.equal(actor.system.attributes.hp.value, 0);
  assert.equal(scene.tokens.size, 0);
  assert.equal(getExocortexDeviceData(owner).turret.deployed, false);
});

test("device synchronization preserves identity metadata", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await performExocortexOperation(owner, "device-sync");
  assert.equal(getTurretActor(owner)?.id, actor.id);
  assert.equal(actor.flags[ID].device.kind, "turret");
  assert.equal(actor.flags[ID].device.ownerActorId, owner.id);
});

test("device synchronization preserves flags added during the stat update", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  const update = actor.update.bind(actor);
  actor.update = async (changes, options) => {
    if (changes["system.details.level.value"] !== undefined) actor.data.flags.external = { keep: true };
    return update(changes, options);
  };
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.deepEqual(actor.flags.external, { keep: true });
});
test("device synchronization preserves an external flag written before its final update", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  const update = actor.update.bind(actor);
  const setFlag = actor.setFlag.bind(actor);
  let armed = false;
  let written = false;
  const writeExternal = () => {
    if (!armed || written) return;
    actor.data.flags.external = { keep: true };
    written = true;
  };
  actor.update = async (changes, options) => {
    if (changes["system.details.level.value"] !== undefined) armed = true;
    if (changes.flags) writeExternal();
    return update(changes, options);
  };
  actor.setFlag = async (scope, key, entry) => {
    if (scope === ID && key === "device") writeExternal();
    return setFlag(scope, key, entry);
  };
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(written, true);
  assert.deepEqual(actor.flags.external, { keep: true });
});
test("a rejected device commit leaves synchronized stats and control baseline unchanged", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  const update = actor.update.bind(actor);
  let fail = true;
  actor.update = async (changes, options) => {
    if (fail && changes.flags) { fail = false; throw new Error("device commit failed"); }
    return update(changes, options);
  };
  await owner.update({ "system.details.level.value": 10 });
  await assert.rejects(performExocortexOperation(owner, "device-sync"), /device commit failed/);
  assert.equal(actor.system.details.level.value, 5);
  assert.equal(actor.flags[ID].device.control.system.details.level.value, 5);
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.system.details.level.value, 10);
  assert.equal(actor.flags[ID].device.control.system.details.level.value, 10);
});

test("second turret placement is refused instead of duplicating the device", async () => {
  await performExocortexOperation(owner, "turret-place", { position: point() });
  await assert.rejects(performExocortexOperation(owner, "turret-place", { position: point() }));
  assert.equal(scene.tokens.size, 1);
});
test("stat synchronization updates level but preserves GM-edited AC", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ "system.attributes.ac.value": 42 });
  owner.dc = 30;
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.system.details.level.value, 10);
  assert.equal(actor.system.attributes.ac.value, 42);
  assert.equal(actor.system.attributes.hardness, 15);
});
test("Foundry-expanded control paths still allow native statistic synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  const old = actor.flags[ID].device.control;
  const normalized = {};
  for (const [path, value] of Object.entries(old)) patch(normalized, { [path]: value });
  await actor.setFlag(ID, "device", { ...actor.flags[ID].device, control: normalized });
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.system.attributes.hp.max, 70);
  assert.equal(actor.system.attributes.hardness, 15);
});
test("level synchronization preserves damage rather than the old current HP value", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ "system.attributes.hp.value": 22 });
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.system.attributes.hp.max, 70);
  assert.equal(actor.system.attributes.hp.value, 52);
});
test("collecting mines deletes only token-backed entries managed for this mechanic", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const [manual] = await scene.createEmbeddedDocuments("Token", [{ actorId: owner.id, x: 0, y: 0 }]);
  const state = await performExocortexOperation(owner, "mine-collect");
  assert.equal(state.mines.prepared, 4);
  assert.equal(state.mines.deployed.length, 0);
  assert.equal(scene.tokens.size, 1);
  assert.ok(scene.tokens.get(manual.id));
});
test("explicitly cancelled placement creates no documents or resource changes", async () => {
  const state = await performExocortexOperation(owner, "mine-place", { position: null });
  assert.equal(state.mines.prepared, 4);
  assert.equal(scene.tokens.size, 0);
  assert.equal(game.actors.size, 1);
});
test("adopting a native PSA mine counts its token once", async () => {
  const external = await Actor.create({ ...clone(psaSource), flags: { "pf2e-summons-assistant": { summoner: { id: owner.id } } } });
  const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: external.id, actorLink: false }]);
  await performExocortexOperation(owner, "mine-adopt", { id: token.uuid });
  const state = await performExocortexOperation(owner, "mine-adopt", { id: token.uuid });
  assert.equal(state.mines.prepared, 3);
  assert.equal(state.mines.deployed.length, 1);
  assert.equal(external.flags[ID].device.createdByModule, false);
  const detonate = external.items.find(item => item.system.slug === "detonate-mine");
  assert.equal(detonate.flags[ID].deviceItem, "tech-pets-detonate-mine");
  assert.equal(external.items.filter(item => ["detonate-mine", "tech-pets-detonate-mine"].includes(item.system.slug)).length, 1);
});
test("collecting an adopted unlinked mine authorizes its synthetic actor", async () => {
  const external = await Actor.create({ ...clone(psaSource), flags: { "pf2e-summons-assistant": { summoner: { id: owner.id } } } });
  const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: external.id, actorLink: false }]);
  const synthetic = new Actor(external.toObject());
  Object.defineProperty(token, "actor", { configurable: true, get: () => synthetic });
  await performExocortexOperation(owner, "mine-adopt", { id: token.uuid });
  assert.equal(external.flags[ID]?.device?.ownerActorId, owner.id);
  assert.equal(synthetic.flags[ID]?.device?.ownerActorId, owner.id);
  const state = await performExocortexOperation(owner, "mine-collect");
  assert.equal(state.mines.deployed.length, 0);
  assert.equal(scene.tokens.size, 0);
  assert.equal(game.actors.has(external.id), true);
});
test("edited native PSAs belonging to another mechanic cannot be adopted", async () => {
  const external = await Actor.create({ ...clone(psaSource), flags: { "pf2e-summons-assistant": { summoner: { id: "another-owner" } } } });
  const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: external.id }]);
  await assert.rejects(performExocortexOperation(owner, "mine-adopt", { id: token.uuid }));
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 4);
});
test("GM-edited action text remains untouched by device synchronization", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const mine = scene.tokens.contents[0].actor;
  const action = mine.items.find(item => item.system.slug === "tech-pets-detonate-mine");
  await action.update({ "system.description.value": "GM CUSTOM DAMAGE" });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(action.system.description.value, "GM CUSTOM DAMAGE");
});
test("item synchronization commits changes and control fingerprint without a separate flag write", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const action = actor.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine");
  action.setFlag = async () => { throw new Error("fingerprint write failed"); };
  await owner.update({ "system.details.level.value": 10 });
  await assert.doesNotReject(performExocortexOperation(owner, "device-sync"));
  assert.match(action.system.description.value, /6d6/);
  assert.equal(typeof action.flags[ID].control, "string");
});

test("a newly created synchronized item includes its retry fingerprint at creation", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const action = actor.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine");
  await actor.deleteEmbeddedDocuments("Item", [action.id]);
  const create = actor.createEmbeddedDocuments.bind(actor);
  actor.createEmbeddedDocuments = async (type, sources) => {
    const created = await create(type, sources);
    for (const item of created) item.setFlag = async () => { throw new Error("fingerprint write failed"); };
    return created;
  };
  await assert.doesNotReject(performExocortexOperation(owner, "device-sync"));
  const recreated = actor.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine");
  assert.ok(recreated);
  assert.equal(typeof recreated.flags[ID].control, "string");
  await owner.update({ "system.details.level.value": 10 });
  await assert.doesNotReject(performExocortexOperation(owner, "device-sync"));
  assert.match(recreated.system.description.value, /6d6/);
});

test("detonation cancels without deleting its token when native roll is cancelled", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const state = owner.getFlag(ID, "exocortex");
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {} } };
  const result = await performExocortexOperation(owner, "mine-detonate", { id: state.mines.deployed[0].id, damageType: "fire", confirmed: true });
  assert.equal(result.mines.deployed.length, 1);
  assert.equal(scene.tokens.size, 1);
});
test("detonation correlates the posted roll by invocation option instead of domain", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const record = owner.getFlag(ID, "exocortex").mines.deployed[0];
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {
    const attemptId = owner.getFlag(ID, "exocortex").mines.deployed[0].detonationAttemptId;
    const message = chatMessage("option-message", actor.id, "unrelated-domain", [`tech-pets:detonation:${attemptId}`]);
    game.messages.set(message.id, message);
    for (const callback of events.get("createChatMessage") ?? []) await callback(message);
  } } };
  const result = await performExocortexOperation(owner, "mine-detonate", { id: record.id, damageType: "fire", confirmed: true });
  assert.equal(result.mines.deployed.length, 0);
  assert.equal(scene.tokens.size, 0);
});

test("an unrelated same-domain message does not detonate the mine", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const record = owner.getFlag(ID, "exocortex").mines.deployed[0];
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {
    const message = chatMessage("unrelated-message", actor.id, "tech-pets-detonate-mine-inline-damage");
    game.messages.set(message.id, message);
    for (const callback of events.get("createChatMessage") ?? []) await callback(message);
  } } };
  const result = await performExocortexOperation(owner, "mine-detonate", { id: record.id, damageType: "fire", confirmed: true });
  assert.equal(result.mines.deployed.length, 1);
  assert.equal(scene.tokens.size, 1);
});

test("a cancelled detonation persists its attempt identity and can retry", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const record = owner.getFlag(ID, "exocortex").mines.deployed[0];
  let rolls = 0;
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {
    rolls++;
    if (rolls === 1) return;
    const message = chatMessage("retry-message", actor.id, "tech-pets-detonate-mine-inline-damage", [detonationOption()]);
    game.messages.set(message.id, message);
    for (const callback of events.get("createChatMessage") ?? []) await callback(message);
  } } };
  const cancelled = await performExocortexOperation(owner, "mine-detonate", { id: record.id, damageType: "fire", confirmed: true });
  assert.equal(cancelled.mines.deployed.length, 1);
  assert.ok(cancelled.mines.deployed[0].detonationAttemptId);
  const result = await performExocortexOperation(owner, "mine-detonate", { id: record.id, damageType: "fire", confirmed: true });
  assert.equal(rolls, 2);
  assert.equal(result.mines.deployed.length, 0);
});

test("detonation retry resumes a tagged message instead of rolling twice", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const record = owner.getFlag(ID, "exocortex").mines.deployed[0];
  const message = chatMessage("posted-message", actor.id, "tech-pets-detonate-mine-inline-damage");
  game.messages.set(message.id, message);
  const setFlag = owner.setFlag.bind(owner);
  let failResolved = true;
  owner.setFlag = async (scope, key, entry) => {
    if (scope === ID && key === "exocortex" && failResolved && entry.mines?.deployed?.[0]?.resolvedMessageId) {
      failResolved = false;
      throw new Error("resolved ledger write failed");
    }
    return setFlag(scope, key, entry);
  };
  let rolls = 0;
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {
    rolls++;
    message.flags.sf2e.context.options = [detonationOption()];
    for (const callback of events.get("createChatMessage") ?? []) await callback(message);
  } } };
  await assert.rejects(performExocortexOperation(owner, "mine-detonate", { id: record.id, damageType: "fire", confirmed: true }), /resolved ledger write failed/);
  assert.equal(rolls, 1);
  assert.equal(owner.getFlag(ID, "exocortex").mines.deployed[0].resolvedMessageId, undefined);
  assert.ok(owner.getFlag(ID, "exocortex").mines.deployed[0].detonationAttemptId);
  const result = await performExocortexOperation(owner, "mine-detonate", { id: record.id, damageType: "fire", confirmed: true });
  assert.equal(rolls, 1);
  assert.equal(result.mines.deployed.length, 0);
  assert.equal(scene.tokens.size, 0);
});

test("a resolved detonation cleans up when its token is already missing", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const token = scene.tokens.contents[0];
  const actor = token.baseActor;
  const state = owner.getFlag(ID, "exocortex");
  state.mines.deployed[0].resolvedMessageId = "already-rolled";
  await owner.setFlag(ID, "exocortex", state);
  await token.delete();
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => { throw new Error("must not roll again"); } } };
  const result = await performExocortexOperation(owner, "mine-detonate", { id: state.mines.deployed[0].id, damageType: "fire", confirmed: true });
  assert.equal(result.mines.deployed.length, 0);
  assert.equal(game.actors.has(actor.id), false);
});

test("native inline healing spends the mine after the healing message exists", async () => {
  await owner.createEmbeddedDocuments("Item", [{ name: "Healing Mines", type: "feat", system: { slug: "healing-mines" } }]);
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const actor = scene.tokens.contents[0].actor;
  const record = owner.getFlag(ID, "exocortex").mines.deployed[0];
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {
    const message = chatMessage("healing-message", actor.id, "tech-pets-healing-mine-inline-healing", [detonationOption()]);
    game.messages.set(message.id, message);
    for (const callback of events.get("createChatMessage") ?? []) await callback(message);
  } } };
  const result = await performExocortexOperation(owner, "mine-detonate", { id: record.id, damageType: "healing", confirmed: true });
  assert.equal(result.mines.deployed.length, 0);
  assert.equal(scene.tokens.size, 0);
  assert.equal(game.actors.size, 1);
});
test("mine damage selection survives synchronization and explicit damage overrides it", async () => {
  await owner.createEmbeddedDocuments("Item", [{ name: "Damage Customizations", type: "feat", system: { slug: "damage-customizations" } }]);
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const mine = scene.tokens.contents[0].actor;
  const action = mine.items.find(item => item.system.slug === "tech-pets-detonate-mine");
  const rules = clone(action.system.rules);
  rules.find(rule => rule.option === "tech-pets:mine-damage-type").selection = "cold";
  await action.update({ "system.rules": rules });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(action.system.rules.find(rule => rule.option === "tech-pets:mine-damage-type").selection, "cold");
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {} } };
  await performExocortexOperation(owner, "mine-detonate", { id: owner.getFlag(ID, "exocortex").mines.deployed[0].id, damageType: "piercing", confirmed: true });
  assert.equal(action.system.rules.find(rule => rule.option === "tech-pets:mine-damage-type").selection, "piercing");
});

test("losing Damage Customizations falls back to a basic mine damage type", async () => {
  const feat = await owner.createEmbeddedDocuments("Item", [{ name: "Damage Customizations", type: "feat", system: { slug: "damage-customizations" } }]);
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const mine = scene.tokens.contents[0].actor;
  const action = mine.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine");
  const rules = clone(action.system.rules);
  rules.find(rule => rule.option === "tech-pets:mine-damage-type").selection = "cold";
  await action.update({ "system.rules": rules });
  await owner.deleteEmbeddedDocuments("Item", [feat[0].id]);
  await assert.doesNotReject(performExocortexOperation(owner, "device-sync"));
  assert.equal(mine.flags[ID].device.damageType, "fire");
  assert.equal(action.system.rules.some(rule => rule.option === "tech-pets:mine-damage-type"), false);
  assert.match(action.system.description.value, /@Damage\[\d+d6\[fire\]/);
});
test("unlinked mine synchronization updates the token synthetic actor", async () => {
  const feat = await owner.createEmbeddedDocuments("Item", [{ name: "Damage Customizations", type: "feat", system: { slug: "damage-customizations" } }]);
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const token = scene.tokens.contents[0];
  const mine = token.baseActor;
  const synthetic = new Actor(mine.toObject());
  Object.defineProperty(token, "actor", { configurable: true, get: () => synthetic });
  const action = synthetic.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine");
  const rules = clone(action.system.rules);
  rules.find(rule => rule.option === "tech-pets:mine-damage-type").selection = "cold";
  await action.update({ "system.rules": rules });
  await owner.deleteEmbeddedDocuments("Item", [feat[0].id]);
  await performExocortexOperation(owner, "device-sync");
  assert.equal(synthetic.flags[ID].device.damageType, "fire");
  assert.equal(action.system.rules.some(rule => rule.option === "tech-pets:mine-damage-type"), false);
  assert.match(action.system.description.value, /@Damage\[\d+d6\[fire\]/);
  assert.ok(mine.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine").system.rules.some(rule => rule.option === "tech-pets:mine-damage-type"));
});
test("collecting an unlinked mine deletes its created world actor, not the synthetic actor", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const token = scene.tokens.contents[0];
  const base = token.actor;
  Object.defineProperty(token, "actor", { get: () => ({ id: base.id, flags: base.flags, delete: async () => { throw new Error("cannot delete synthetic actor"); } }) });
  await performExocortexOperation(owner, "mine-collect");
  assert.equal(game.actors.size, 1);
});
test("turret repair uses a GM-edited maximum rather than recalculated base HP", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ "system.attributes.hp.max": 100, "system.attributes.hp.value": 10 });
  await performExocortexOperation(owner, "turret-repair", { confirmed: true });
  assert.equal(actor.system.attributes.hp.value, 100);
});
test("turret recovery commits its marker with HP and survives a later ledger failure", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ "system.attributes.hp.value": 10 });
  game.combat = { id: "combat", started: true, round: 1, turn: 1, combatant: { actor: owner } };
  owner.failLedgerAt = 1;
  await assert.rejects(performExocortexOperation(owner, "turret-recover", { confirmed: true }), /ledger write failed/);
  assert.equal(actor.system.attributes.hp.value, 15);
  assert.equal(actor.flags[ID].device.lastRecovery, "combat:1:1");
  await assert.rejects(performExocortexOperation(owner, "turret-recover", { confirmed: true }), /ExoRecoveryUsed/);
  assert.equal(actor.system.attributes.hp.value, 15);
});

test("native PSA summon hook adopts the actual token after summoner is assigned", async () => {
  const external = await Actor.create({ ...clone(psaSource), flags: { "pf2e-summons-assistant": { summoner: { id: owner.id } } } });
  await scene.createEmbeddedDocuments("Token", [{ actorId: external.id }]);
  for (const callback of events.get("updateActor") ?? []) await callback(external, { flags: { "pf2e-summons-assistant": { summoner: { id: owner.id } } } }, {}, game.user.id);
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 3);
  assert.equal(owner.getFlag(ID, "exocortex").mines.deployed.length, 1);
});
test("native PSA summon hook reads summoner metadata from the world actor", async () => {
  const external = await Actor.create(clone(psaSource));
  const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: external.id }]);
  const synthetic = new Actor(external.toObject());
  Object.defineProperty(token, "actor", { configurable: true, get: () => synthetic });
  await external.setFlag("pf2e-summons-assistant", "summoner", { id: owner.id });
  for (const callback of events.get("updateActor") ?? []) await callback(external, { flags: { "pf2e-summons-assistant": { summoner: { id: owner.id } } } }, {}, game.user.id);
  assert.equal(owner.getFlag(ID, "exocortex").mines.deployed.length, 1);
});

test("expansive arrays require an owned feat and explicit two selections", async () => {
  assert.equal(Object.keys(getAvailableTurretArrays(owner)).length, 6);
  await assert.rejects(performExocortexOperation(owner, "turret-arrays", { arrays: ["mental", "poison"] }));
  await owner.createEmbeddedDocuments("Item", [{ name: "Expansive Array", type: "feat", system: { slug: "expansive-array" } }]);
  await owner.update({ "system.details.level.value": 8 });
  await performExocortexOperation(owner, "turret-arrays", { arrays: ["mental", "poison"] });
  assert.ok(getAvailableTurretArrays(owner).mental);
  assert.ok(getAvailableTurretArrays(owner).poison);
  assert.equal(getAvailableTurretArrays(owner).void, undefined);
  await assert.rejects(performExocortexOperation(owner, "turret-arrays", { arrays: ["mental", "poison", "void"] }));
});

test("a valid legacy turret array is used when the devices profile has no selection", async () => {
  const state = owner.getFlag(ID, "exocortex");
  state.turret.array = "volt";
  await owner.setFlag(ID, "exocortex", state);
  assert.equal(getExocortexDeviceData(owner).turret.array, "volt");
  await owner.setFlag(ID, "devices", { array: "laser" });
  assert.equal(getExocortexDeviceData(owner).turret.array, "laser");
  await owner.setFlag(ID, "devices", { array: "not-an-array" });
  assert.equal(getExocortexDeviceData(owner).turret.array, "laser");
});

test("duplicate Expansive Array records still increase the selection limit", async () => {
  await owner.createEmbeddedDocuments("Item", [
    { name: "Expansive Array", type: "feat", system: { slug: "expansive-array" } },
    { name: "Expansive Array", type: "feat", system: { slug: "expansive-array" } },
  ]);
  await performExocortexOperation(owner, "turret-arrays", { arrays: ["mental", "poison", "vitality", "void"] });
  assert.deepEqual(owner.getFlag(ID, "devices").arrays, ["mental", "poison", "vitality", "void"]);
});

test("inherited object keys are not accepted as turret arrays", async () => {
  await owner.setFlag(ID, "devices", { ...(owner.getFlag(ID, "devices") ?? {}), array: "__proto__" });
  assert.equal(getExocortexDeviceData(owner).turret.array, "laser");
  await assert.rejects(performExocortexOperation(owner, "turret-array", { array: "constructor" }), /ExoInvalidArray/);
  await owner.createEmbeddedDocuments("Item", [{ name: "Expansive Array", type: "feat", system: { slug: "expansive-array" } }]);
  await assert.rejects(performExocortexOperation(owner, "turret-arrays", { arrays: ["__proto__"] }), /ExoInvalidArray/);
  await assert.rejects(performExocortexOperation(owner, "turret-arrays", { arrays: ["constructor"] }), /ExoInvalidArray/);
});
test("turret roll uses mechanic MAP and avoids measuring range from mechanic token", async () => {
  await performExocortexOperation(owner, "turret-place", { position: point() });
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  let selected;
  owner.system.actions = [{ item: weapon, variants: [0, 1, 2].map(map => ({ roll: async args => { selected = { map, args }; return "rolled"; } })) }];
  game.user.targets = new Set([{ actor: { armorClass: { value: 24 } } }]);
  assert.equal(await rollTurretStrike(owner, 1), "rolled");
  assert.equal(selected.map, 1);
  assert.equal(selected.args.target, false);
  assert.deepEqual(selected.args.dc, { value: 24 });
  assert.equal(selected.args.consumeAmmo, false);
});

test("manual token deletion removes the unlinked module-created mine actor", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const token = scene.tokens.contents[0];
  const actor = token.actor;
  await token.delete();
  for (const callback of events.get("deleteToken") ?? []) await callback(token, {}, game.user.id);
  assert.equal(game.actors.has(actor.id), false);
  assert.equal(owner.getFlag(ID, "exocortex").mines.deployed.length, 0);
});

test("manual token deletion preserves an adopted third-party mine actor", async () => {
  const external = await Actor.create({ ...clone(psaSource), flags: { "pf2e-summons-assistant": { summoner: { id: owner.id } } } });
  const [token] = await scene.createEmbeddedDocuments("Token", [{ actorId: external.id }]);
  await performExocortexOperation(owner, "mine-adopt", { id: token.uuid });
  await token.delete();
  for (const callback of events.get("deleteToken") ?? []) await callback(token, {}, game.user.id);
  assert.equal(game.actors.has(external.id), true);
  assert.equal(owner.getFlag(ID, "exocortex").mines.deployed.length, 0);
});

test("losing Expansive Array falls back to Laser instead of breaking synchronization", async () => {
  await owner.createEmbeddedDocuments("Item", [{ name: "Expansive Array", type: "feat", system: { slug: "expansive-array" } }]);
  await owner.update({ "system.details.level.value": 8 });
  await performExocortexOperation(owner, "turret-create");
  await performExocortexOperation(owner, "turret-arrays", { arrays: ["mental", "poison"] });
  await performExocortexOperation(owner, "turret-array", { array: "mental" });
  const feat = owner.items.find(item => item.system.slug === "expansive-array");
  await owner.deleteEmbeddedDocuments("Item", [feat.id]);
  assert.equal(getExocortexDeviceData(owner).turret.array, "laser");
  await assert.doesNotReject(performExocortexOperation(owner, "device-sync"));
  assert.equal(owner.getFlag(ID, "devices").array, "laser");
  assert.equal(owner.items.find(item => item.flags[ID]?.turretWeapon).system.damage.damageType, "fire");
});

test("weapon runes and equipped state survive without blocking array or level synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  const runes = { potency: 1, striking: 1, property: [] };
  await weapon.update({ "system.grade": "advanced", "system.runes": runes, "system.equipped": { carryType: "held", handsHeld: 1, inSlot: true } });
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "turret-array", { array: "volt" });
  assert.equal(weapon.system.damage.damageType, "electricity");
  assert.equal(weapon.system.level.value, 10);
  assert.equal(weapon.system.grade, "advanced");
  assert.deepEqual(weapon.system.runes, runes);
  assert.deepEqual(weapon.system.equipped, { carryType: "held", handsHeld: 1, inSlot: true });
});

test("native expend normalization does not block array synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  await weapon.update({ "system.expend": null });
  await performExocortexOperation(owner, "turret-array", { array: "volt" });
  assert.equal(weapon.system.damage.damageType, "electricity");
  assert.equal(weapon.system.expend, 0);
});

test("native rule schema normalization does not block array synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  const rules = clone(weapon.system.rules);
  for (const rule of rules) {
    rule.slug = null;
    rule.priority = rule.key === "RollOption" ? 50 : 100;
    rule.ignored = false;
    if (rule.selector) rule.selector = [rule.selector];
    if (rule.key === "RollOption") rule.suboptions = (rule.suboptions ?? []).map(option => ({ ...option, predicate: [] }));
  }
  await weapon.update({ "system.rules": rules });
  await performExocortexOperation(owner, "turret-array", { array: "volt" });
  assert.equal(weapon.system.damage.damageType, "electricity");
});

test("manual rule edits remain protected from device synchronization", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const action = scene.tokens.contents[0].actor.items.find(item => item.flags[ID]?.deviceItem === "tech-pets-detonate-mine");
  const rules = clone(action.system.rules);
  rules.find(rule => rule.key === "FlatModifier").value = 99;
  await action.update({ "system.rules": rules });
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(action.system.rules.find(rule => rule.key === "FlatModifier").value, 99);
});

test("manual rule settings remain protected from device synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  const rules = clone(weapon.system.rules);
  rules.find(rule => rule.option === "tech-pets:pinpoint-shot").alwaysActive = false;
  await weapon.update({ "system.rules": rules });
  await performExocortexOperation(owner, "turret-array", { array: "volt" });
  assert.equal(weapon.system.damage.damageType, "fire");
  assert.equal(weapon.system.rules.find(rule => rule.option === "tech-pets:pinpoint-shot").alwaysActive, false);
});

test("system migration metadata does not freeze generated mine damage", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const action = scene.tokens.contents[0].actor.items.find(item => item.system.slug === "tech-pets-detonate-mine");
  await action.update({ "system._migration": { version: 1 } });
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.ok(action.system.description.value.includes("6d6"));
});

test("legacy full-system control fingerprints migrate without freezing generated actions", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const action = scene.tokens.contents[0].actor.items.find(item => item.system.slug === "tech-pets-detonate-mine");
  const legacy = JSON.parse(action.flags[ID].control);
  legacy.system._migration = { version: null, previous: null };
  await action.setFlag(ID, "control", JSON.stringify(legacy));
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.ok(action.system.description.value.includes("6d6"));
});

test("legacy control fingerprints still protect manual action edits", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const action = scene.tokens.contents[0].actor.items.find(item => item.system.slug === "tech-pets-detonate-mine");
  const legacy = JSON.parse(action.flags[ID].control);
  legacy.system._migration = { version: null, previous: null };
  await action.setFlag(ID, "control", JSON.stringify(legacy));
  await action.update({ "system.description.value": "GM CUSTOM DAMAGE" });
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(action.system.description.value, "GM CUSTOM DAMAGE");
});

test("manual weapon damage edits remain protected from array synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  await weapon.update({ "system.damage.damageType": "cold" });
  await performExocortexOperation(owner, "turret-array", { array: "volt" });
  assert.equal(weapon.system.damage.damageType, "cold");
});

test("detonation warns when a protected action may roll stale damage", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const mine = scene.tokens.contents[0].actor;
  const action = mine.items.find(item => item.system.slug === "tech-pets-detonate-mine");
  await action.update({ "system.description.value": "GM CUSTOM DAMAGE" });
  globalThis.document = { createElement: () => ({ dataset: {}, querySelector: () => ({ dataset: { damageRoll: "" } }) }) };
  game.pf2e = { TextEditor: { enrichHTML: async () => "<a></a>", _onClickInlineRoll: async () => {} } };
  await performExocortexOperation(owner, "mine-detonate", { id: owner.getFlag(ID, "exocortex").mines.deployed[0].id, damageType: "fire", confirmed: true });
  assert.deepEqual(warnings, ["SFMTP.ExoManualOverrides"]);
});

test("empty turret HP is rejected without recalling the turret", async () => {
  await performExocortexOperation(owner, "turret-place", { position: point() });
  await assert.rejects(performExocortexOperation(owner, "turret-hp", { hp: "" }), /ExoInvalidHP/);
  assert.equal(scene.tokens.size, 1);
  assert.equal(getTurretActor(owner).system.attributes.hp.value, 40);
});

test("module-originated turret HP writes do not queue another synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  const update = actor.update.bind(actor);
  const pending = [];
  let hookFired = false;
  actor.update = async (changes, options) => {
    const result = await update(changes, options);
    if (!hookFired && changes["system.attributes.hp.value"] !== undefined) {
      hookFired = true;
      for (const callback of events.get("updateActor") ?? []) pending.push(callback(actor, changes, options, game.user.id));
    }
    return result;
  };
  await performExocortexOperation(owner, "turret-hp", { hp: 20 });
  await Promise.all(pending);
  assert.equal(actor.system.attributes.hp.value, 20);
  assert.equal(owner.ledgerWrites, 1);
});

test("empty and over-capacity mine counts are rejected", async () => {
  await assert.rejects(performExocortexOperation(owner, "mine-count", { count: "" }), /InlineInvalidCount/);
  await assert.rejects(performExocortexOperation(owner, "mine-count", { count: 11 }), /InlineInvalidCount/);
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 4);
});

test("mine count rejects a stale displayed value before writing", async () => {
  await performExocortexOperation(owner, "mine-count", { count: 2, expected: 4 });
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 2);
  await assert.rejects(performExocortexOperation(owner, "mine-count", { count: 3, expected: 4 }), /InlineStale/);
  assert.equal(owner.getFlag(ID, "exocortex").mines.prepared, 2);
});

test("device ownership follows later mechanic permission changes", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  owner.ownership.player = 0;
  owner.ownership.helper = 3;
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.ownership.player, 0);
  assert.equal(actor.ownership.helper, 3);
});

test("mechanic ownership updates trigger device permission synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  delete owner.ownership.player;
  for (const callback of events.get("updateActor") ?? []) await callback(owner, { ownership: clone(owner.ownership) }, {}, game.user.id);
  assert.equal(Object.hasOwn(actor.ownership, "player"), false);
});

test("removed mechanic permissions are removed from the device", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  delete owner.ownership.player;
  await performExocortexOperation(owner, "device-sync");
  assert.equal(Object.hasOwn(actor.ownership, "player"), false);
  owner.ownership.helper = 3;
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.ownership.helper, 3, JSON.stringify({ owner: owner.ownership, device: actor.flags[ID].device, actor: actor.ownership }));
});

test("manual device permission edits survive synchronization", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ ownership: { ...actor.ownership, helper: 2 } });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.ownership.helper, 2);
  assert.equal(actor.ownership.player, 3);
  owner.ownership.helper = 3;
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.ownership.helper, 2);
});

test("ownership synchronization reconciles unedited entries independently", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ ownership: { ...actor.ownership, helper: 2 } });
  delete owner.ownership.player;
  await performExocortexOperation(owner, "device-sync");
  assert.equal(Object.hasOwn(actor.ownership, "player"), false);
  assert.equal(actor.ownership.helper, 2);
});

test("ownership synchronization preserves a concurrent same-entry writer", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  delete owner.ownership.player;
  actor.data.ownership.player = 2;
  const toObject = actor.toObject.bind(actor);
  let firstRead = true;
  actor.toObject = () => {
    const source = toObject();
    if (firstRead) { firstRead = false; source.ownership = { ...source.ownership, player: 3 }; }
    return source;
  };
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.data.ownership.player, 2);
  assert.equal(actor.flags[ID].device.ownership.player, 2);
  assert.equal(actor.flags[ID].device.ownershipOverrides.player, 2);
});

test("failed ownership synchronization does not advance the device baseline", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  delete owner.ownership.player;
  const update = actor.update.bind(actor);
  let fail = true;
  actor.update = async (changes, options) => {
    if (fail && changes.ownership) { fail = false; throw new Error("ownership write failed"); }
    return update(changes, options);
  };
  await assert.rejects(performExocortexOperation(owner, "device-sync"), /ownership write failed/);
  assert.equal(actor.ownership.player, 3);
  await performExocortexOperation(owner, "device-sync");
  assert.equal(Object.hasOwn(actor.ownership, "player"), false);
});

test("custom mine actor art survives collection and recreation", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const token = scene.tokens.contents[0];
  const actor = token.actor;
  await actor.update({ img: "custom/mine-actor.webp" });
  for (const callback of events.get("updateActor") ?? []) await callback(actor, { img: "custom/mine-actor.webp" }, {}, game.user.id);
  assert.equal(token.texture.src, "custom/mine-actor.webp");
  await performExocortexOperation(owner, "mine-collect");
  await performExocortexOperation(owner, "mine-place", { position: point() });
  assert.equal(scene.tokens.contents[0].actor.img, "custom/mine-actor.webp");
  assert.equal(scene.tokens.contents[0].texture.src, "custom/mine-actor.webp");
});

test("custom mine token art survives collection and recreation", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const token = scene.tokens.contents[0];
  await token.update({ "texture.src": "custom/mine-token.webp" });
  for (const callback of events.get("updateToken") ?? []) await callback(token, { "texture.src": "custom/mine-token.webp" }, {}, game.user.id);
  await performExocortexOperation(owner, "mine-collect");
  await performExocortexOperation(owner, "mine-place", { position: point() });
  assert.equal(scene.tokens.contents[0].texture.src, "custom/mine-token.webp");
});

test("custom turret token art survives recall and recreation", async () => {
  await performExocortexOperation(owner, "turret-place", { position: point() });
  const token = scene.tokens.contents[0];
  await token.update({ "texture.src": "custom/turret-token.webp" });
  for (const callback of events.get("updateToken") ?? []) await callback(token, { "texture.src": "custom/turret-token.webp" }, {}, game.user.id);
  await performExocortexOperation(owner, "turret-recall");
  await performExocortexOperation(owner, "turret-place", { position: point() });
  assert.equal(scene.tokens.contents[0].texture.src, "custom/turret-token.webp");
});

test("custom turret actor art survives actor recreation", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ img: "custom/turret-actor.webp" });
  for (const callback of events.get("updateActor") ?? []) await callback(actor, { img: "custom/turret-actor.webp" }, {}, game.user.id);
  await actor.delete();
  await performExocortexOperation(owner, "turret-create");
  assert.equal(getTurretActor(owner).img, "custom/turret-actor.webp");
  assert.equal(getTurretActor(owner).toObject().prototypeToken.texture.src, "custom/turret-actor.webp");
});

test("turret operation mirrors the mechanic weapon toggles", async () => {
  await performExocortexOperation(owner, "turret-create");
  const controls = getTurretActor(owner).items.find(item => item.flags[ID]?.deviceItem === "tech-pets-turret-operation");
  assert.ok(controls);
  assert.ok(controls.system.rules.some(rule => rule.option === "tech-pets:pinpoint-shot"));
});

test("mechanic weapon toggle changes propagate to the turret", async () => {
  await performExocortexOperation(owner, "turret-create");
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  const rules = clone(weapon.system.rules);
  rules.find(rule => rule.option === "tech-pets:pinpoint-shot").value = true;
  await weapon.update({ "system.rules": rules });
  for (const callback of events.get("updateItem") ?? []) await callback(weapon, { system: { rules } }, {}, game.user.id);
  const controls = getTurretActor(owner).items.find(item => item.flags[ID]?.deviceItem === "tech-pets-turret-operation");
  assert.equal(controls.system.rules.find(rule => rule.option === "tech-pets:pinpoint-shot").value, true);
});

test("turret toggle and suboption changes propagate to the mechanic", async () => {
  await owner.createEmbeddedDocuments("Item", [{ name: "Debilitating Exocortex", type: "feat", system: { slug: "debilitating-exocortex" } }]);
  await performExocortexOperation(owner, "turret-create");
  const controls = getTurretActor(owner).items.find(item => item.flags[ID]?.deviceItem === "tech-pets-turret-operation");
  const rules = clone(controls.system.rules);
  const toggle = rules.find(rule => rule.option === "tech-pets:debilitating-exocortex");
  toggle.value = true;
  toggle.selection = "off-guard";
  await controls.update({ "system.rules": rules });
  for (const callback of events.get("updateItem") ?? []) await callback(controls, { system: { rules } }, {}, game.user.id);
  const weapon = owner.items.find(item => item.flags[ID]?.turretWeapon);
  const synced = weapon.system.rules.find(rule => rule.option === "tech-pets:debilitating-exocortex");
  assert.equal(synced.value, true);
  assert.equal(synced.selection, "off-guard");
  await owner.update({ "system.details.level.value": 10 });
  await performExocortexOperation(owner, "device-sync");
  assert.equal(weapon.system.rules.find(rule => rule.option === "tech-pets:debilitating-exocortex").selection, "off-guard");
  assert.equal(getTurretActor(owner).items.find(item => item.flags[ID]?.deviceItem === "tech-pets-turret-operation").system.rules.find(rule => rule.option === "tech-pets:debilitating-exocortex").selection, "off-guard");
});

test("manual statistic edits are preserved without override warnings", async () => {
  await performExocortexOperation(owner, "turret-create");
  const actor = getTurretActor(owner);
  await actor.update({ "system.attributes.ac.value": 42 });
  owner.dc = 30;
  await performExocortexOperation(owner, "device-sync");
  await performExocortexOperation(owner, "device-sync");
  assert.equal(actor.system.attributes.ac.value, 42);
  assert.deepEqual(warnings, []);
});

test("a protected item warns once until synchronization is no longer blocked", async () => {
  await performExocortexOperation(owner, "mine-place", { position: point() });
  const action = scene.tokens.contents[0].actor.items.find(item => item.system.slug === "tech-pets-detonate-mine");
  await action.update({ "system.description.value": "GM CUSTOM DAMAGE" });
  await performExocortexOperation(owner, "device-sync");
  await performExocortexOperation(owner, "device-sync");
  assert.deepEqual(warnings, ["SFMTP.ExoManualOverrides"]);
});
