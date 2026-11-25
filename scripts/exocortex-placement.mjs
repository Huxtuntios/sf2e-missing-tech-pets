import { t } from "./i18n.mjs";
import { isMechanic } from "./exocortex-rules.mjs";

const QUERY = "sf2e-missing-tech-pets.exocortex";
const operations = new Set([
  "mine-daily", "mine-craft", "mine-deploy", "mine-place", "mine-adopt", "mine-forget", "mine-collect", "mine-detonate", "mine-count",
  "turret-array", "turret-arrays", "turret-create", "turret-deploy", "turret-place", "turret-recall", "turret-reconcile", "turret-hp", "turret-repair", "turret-recover",
  "drone-command", "device-sync",
]);
const argumentKeys = new Set(["confirmed", "label", "id", "damageType", "array", "arrays", "hp", "actions", "count", "expected", "sync", "amount", "position"]);
let execute;
let cancelPlacement;
const fail = key => { throw new Error(t(key)); };

function validateArgs(operation, args) {
  if (!operations.has(operation)) fail("ExoUnknownOperation");
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(key => !argumentKeys.has(key))) fail("ExoUnknownOperation");
  if (JSON.stringify(args).length > 4096) fail("ExoUnknownOperation");
  if (args.position) {
    const point = args.position;
    if (typeof point.sceneId !== "string" || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.elevation ?? 0) || (point.level != null && typeof point.level !== "string") || Object.keys(point).some(key => !["sceneId", "x", "y", "level", "elevation"].includes(key))) fail("ExoSceneRequired");
  }
}

export function registerExocortexAuthority(handler) {
  execute = handler;
  CONFIG.queries[QUERY] = async (payload, { user } = {}) => {
    if (!game.user.isGM || !user || !payload || Object.keys(payload).some(key => !["ownerActorId", "operation", "args"].includes(key))) fail("ExoAccess");
    const owner = game.actors.get(payload.ownerActorId);
    if (!isMechanic(owner) || !owner.testUserPermission(user, "OWNER")) fail("ExoAccess");
    validateArgs(payload.operation, payload.args ?? {});
    if (payload.args?.position) {
      const scene = game.scenes.get(payload.args.position.sceneId);
      if (!scene || (!scene.active && !scene.testUserPermission(user, "OBSERVER"))) fail("ExoAccess");
    }
    return handler(owner, payload.operation, payload.args ?? {});
  };
}

export async function requestExocortexOperation(owner, operation, args = {}) {
  if (!isMechanic(owner) || owner.isOwner === false) fail("ExoAccess");
  validateArgs(operation, args);
  const gm = game.users.activeGM;
  if (gm && gm.id !== game.user.id) return gm.query(QUERY, { ownerActorId: owner.id, operation, args });
  if (!execute) fail("ExoGMRequired");
  return execute(owner, operation, args);
}

export function chooseDevicePosition(owner, kind) {
  if (!canvas.ready || !canvas.scene || !canvas.level) fail("ExoSceneRequired");
  cancelPlacement?.();
  const surface = canvas.app.view;
  const scene = canvas.scene;
  const level = canvas.level.id;
  const token = owner.getActiveTokens().find(token => token.document?.parent?.id === scene.id);
  let point = token?.center ?? { x: scene.width / 2, y: scene.height / 2 };
  const elevation = token?.document?.elevation ?? 0;
  const cursor = surface.style.cursor;
  surface.style.cursor = "crosshair";
  const notification = ui.notifications.info(t("ExoChoosePoint"), { permanent: true });
  return new Promise(resolve => {
    const finish = position => {
      surface.removeEventListener("pointerdown", click, { capture: true });
      document.removeEventListener("keydown", keydown, { capture: true });
      Hooks.off("canvasTearDown", teardown);
      surface.style.cursor = cursor;
      ui.notifications.remove(notification);
      if (cancelPlacement === cancel) cancelPlacement = null;
      resolve(position);
    };
    const cancel = () => finish(null);
    const selected = () => {
      const center = canvas.grid.getSnappedPoint(point, { mode: CONST.GRID_SNAPPING_MODES.CENTER, resolution: 1 });
      finish({ sceneId: scene.id, x: center.x - canvas.grid.size / 2, y: center.y - canvas.grid.size / 2, level, elevation });
    };
    const click = event => {
      if (event.button === 2) { event.preventDefault(); event.stopImmediatePropagation(); cancel(); return; }
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      point = canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY });
      selected();
    };
    const keydown = event => {
      if (!["Escape", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") cancel();
      else if (event.key === "Enter") selected();
      else {
        point = { x: point.x + ({ ArrowLeft: -1, ArrowRight: 1 }[event.key] ?? 0) * canvas.grid.size, y: point.y + ({ ArrowUp: -1, ArrowDown: 1 }[event.key] ?? 0) * canvas.grid.size };
      }
    };
    const teardown = Hooks.on("canvasTearDown", cancel);
    cancelPlacement = cancel;
    surface.addEventListener("pointerdown", click, { capture: true });
    document.addEventListener("keydown", keydown, { capture: true });
  });
}
