import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { chooseDevicePosition, registerExocortexAuthority, requestExocortexOperation } from "../scripts/exocortex-placement.mjs";

let owner, player, gm, surface, keys;
beforeEach(() => {
  owner = { id: "owner", type: "character", isOwner: true, items: [{ type: "class", system: { slug: "mechanic" } }], testUserPermission: (user) => user?.id === "player" || user?.isGM, getActiveTokens: () => [] };
  player = { id: "player", isGM: false };
  gm = { id: "gm", isGM: true, active: true };
  globalThis.game = { user: player, users: { activeGM: gm }, actors: new Map([[owner.id, owner]]), modules: new Map(), system: { id: "sf2e" }, i18n: { localize: key => key } };
  const callbacks = new Map();
  globalThis.Hooks = { on: (name, callback) => { callbacks.set(name, callback); return callback; }, off: (name) => callbacks.delete(name), callAll: (name) => callbacks.get(name)?.() };
  globalThis.CONFIG = { queries: {} };
  globalThis.CONST = { GRID_SNAPPING_MODES: { CENTER: 1 } };
  surface = new EventTarget();
  surface.style = { cursor: "default" };
  keys = new EventTarget();
  globalThis.document = keys;
  globalThis.canvas = { ready: true, scene: { id: "scene", width: 1000, height: 1000 }, level: { id: "level" }, app: { view: surface }, grid: { size: 100, getSnappedPoint: ({x,y}) => ({ x: Math.floor(x/100)*100+50, y: Math.floor(y/100)*100+50 }) }, canvasCoordinatesFromClient: point => point };
  globalThis.ui = { notifications: { info: () => 1, remove: () => {} } };
});
const fire = (target, type, data) => { const event = new Event(type, { cancelable: true }); Object.assign(event, data); target.dispatchEvent(event); return event; };

test("placement uses the live Pixi application view", async () => {
  canvas.app = { view: surface };
  const pending = chooseDevicePosition(owner, "mine");
  fire(keys, "keydown", { key: "Escape" });
  assert.equal(await pending, null);
});
test("Escape cancels placement and restores canvas interaction", async () => {
  const pending = chooseDevicePosition(owner, "turret");
  assert.equal(surface.style.cursor, "crosshair");
  fire(keys, "keydown", { key: "Escape" });
  assert.equal(await pending, null);
  assert.equal(surface.style.cursor, "default");
  assert.equal(fire(surface, "pointerdown", { button: 0, clientX: 210, clientY: 330 }).defaultPrevented, false);
});
test("leaving the canvas cancels placement and cleans both input listeners", async () => {
  const pending = chooseDevicePosition(owner, "mine");
  let finished = false;
  pending.then(() => { finished = true; });
  Hooks.callAll("canvasTearDown");
  await Promise.resolve();
  assert.equal(finished, true);
  assert.equal(await pending, null);
  assert.equal(surface.style.cursor, "default");
  assert.equal(fire(keys, "keydown", { key: "Enter" }).defaultPrevented, false);
});
test("map placement returns snapped top-left, scene and level", async () => {
  const pending = chooseDevicePosition(owner, "mine");
  fire(surface, "pointerdown", { button: 0, clientX: 210, clientY: 330 });
  assert.deepEqual(await pending, { sceneId: "scene", x: 200, y: 300, level: "level", elevation: 0 });
  assert.equal(surface.style.cursor, "default");
});
test("keyboard placement can move by a grid square then confirm", async () => {
  const pending = chooseDevicePosition(owner, "turret");
  fire(keys, "keydown", { key: "ArrowRight" });
  fire(keys, "keydown", { key: "Enter" });
  assert.deepEqual(await pending, { sceneId: "scene", x: 600, y: 500, level: "level", elevation: 0 });
});
test("a second placement cancels the first instead of leaving duplicate listeners", async () => {
  const first = chooseDevicePosition(owner, "mine");
  const second = chooseDevicePosition(owner, "turret");
  assert.equal(await first, null);
  fire(keys, "keydown", { key: "Escape" });
  assert.equal(await second, null);
});
test("authority uses authenticated sender, never a user id from args", async () => {
  const operations = [];
  registerExocortexAuthority(async (actor, operation, args) => { operations.push([actor.id, operation, args]); return "saved"; });
  game.user = gm;
  const handler = CONFIG.queries["sf2e-missing-tech-pets.exocortex"];
  await assert.rejects(handler({ ownerActorId: "owner", operation: "mine-craft", args: {} }, { user: { id: "intruder" } }));
  assert.equal(operations.length, 0);
  assert.equal(await handler({ ownerActorId: "owner", operation: "mine-craft", args: {} }, { user: player }), "saved");
  assert.deepEqual(operations, [["owner", "mine-craft", {}]]);
});
test("authority rejects unknown operations and arbitrary document payloads", async () => {
  registerExocortexAuthority(async () => { throw new Error("handler must not run"); });
  game.user = gm;
  const handler = CONFIG.queries["sf2e-missing-tech-pets.exocortex"];
  await assert.rejects(handler({ ownerActorId: "owner", operation: "delete-all", args: {} }, { user: player }));
  await assert.rejects(handler({ ownerActorId: "owner", operation: "mine-deploy", args: { actorData: { type: "character" } } }, { user: player }));
  await assert.rejects(handler({ ownerActorId: "owner", operation: "mine-deploy", args: { position: { sceneId: "scene", x: Infinity, y: 0 } } }, { user: player }));
});
test("player operation is routed to the active GM with a narrow payload", async () => {
  let payload;
  gm.query = async (name, data) => { payload = { name, data }; return { mines: { prepared: 2 } }; };
  assert.deepEqual(await requestExocortexOperation(owner, "mine-craft", {}), { mines: { prepared: 2 } });
  assert.deepEqual(payload, { name: "sf2e-missing-tech-pets.exocortex", data: { ownerActorId: "owner", operation: "mine-craft", args: {} } });
});
test("read-only actors cannot request mutation even with an active GM", async () => {
  owner.isOwner = false;
  gm.query = async () => { throw new Error("GM must not be called"); };
  await assert.rejects(requestExocortexOperation(owner, "mine-craft", {}));
});
test("GM authority refuses placement in a private scene inaccessible to the sender", async () => {
  game.scenes = new Map([["private", { active: false, testUserPermission: () => false }]]);
  registerExocortexAuthority(async () => "must not execute");
  game.user = gm;
  const handler = CONFIG.queries["sf2e-missing-tech-pets.exocortex"];
  await assert.rejects(handler({ ownerActorId: "owner", operation: "mine-place", args: { position: { sceneId: "private", x: 0, y: 0, level: "level" } } }, { user: player }));
});
