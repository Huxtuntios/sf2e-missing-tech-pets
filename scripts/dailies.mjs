// Не изменяем замороженный game.dailies.api: регистрируем собственный набор
// через публичный registerCustomDailies. Формат проверен по Dailies 4.23.1.
import { t } from "./i18n.mjs";
import { MODULE_ID, escapeHTML as esc } from "./item-sources.mjs";
import {
  assertFamiliarAccess,
  linkedFamiliars,
  familiarAllowance,
  familiarAbilityItems,
  familiarCanRemove,
  familiarFingerprint,
  familiarCatalog,
  syncFamiliarAbilities,
} from "./familiars.mjs";

const DAILIES = "pf2e-dailies";
const KEY = "sfmtp-familiar";
const registered = new WeakSet();
const operations = new Map();

// Foundry Helpers предоставляет read-only context game.dailies с полем api.
// Не присваиваем game.dailies и не переписываем методы другого модуля.
function apiOf() {
  return game.dailies?.api ?? game.modules.get(DAILIES)?.api;
}
function compatible() {
  const version = String(game.modules.get(DAILIES)?.version ?? "");
  const parts = version.split(".").map(Number);
  const current = [4, 23, 1];
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(parts[i])) return false;
    if (parts[i] !== current[i]) return parts[i] > current[i];
  }
  return true;
}
function linked(owner, familiar) {
  return (
    owner?.type === "character" &&
    familiar?.type === "familiar" &&
    familiar.system?.master?.id === owner.id &&
    linkedFamiliars(owner).length === 1
  );
}
function requireAccess(owner, familiar) {
  assertFamiliarAccess(owner);
  assertFamiliarAccess(familiar);
  if (!linked(owner, familiar)) throw new Error(t("FamiliarAmbiguous"));
}
function builtInDisabled(owner, api = apiOf()) {
  return api?.getDisabledDailies?.(owner)?.["dailies.familiar"] === true;
}
function temporaryItems(familiar) {
  return familiarAbilityItems(familiar).some(
    (item) => item.flags?.[DAILIES]?.temporary,
  );
}
export function dailiesState(owner, familiar) {
  const active = Boolean(game.modules.get(DAILIES)?.active);
  const api = apiOf();
  const available =
    active &&
    compatible() &&
    [
      "registerCustomDailies",
      "getDisabledDailies",
      "openDailiesInterface",
      "canPrepareDailies",
    ].every((key) => typeof api?.[key] === "function");
  const enabled = Boolean(
    owner?.getFlag(MODULE_ID, "dailiesFamiliar")?.enabled &&
    linked(owner, familiar),
  );
  const registeredHere = available && registered.has(api);
  const conflict = Boolean(
    enabled && registeredHere && !builtInDisabled(owner, api),
  );
  return {
    active,
    available: Boolean(registeredHere),
    enabled,
    conflict,
    delegated: enabled && registeredHere,
    using: enabled && registeredHere && !conflict,
    temporary: Boolean(familiar && temporaryItems(familiar)),
  };
}
function snapshot(owner, familiar) {
  return JSON.stringify({
    familiar: familiar.id,
    master: familiar.system?.master?.id,
    allowance: familiarAllowance(owner, familiar),
    items: familiarAbilityItems(familiar).map((item) => [
      item.id,
      familiarFingerprint(item),
      familiarCanRemove(item, owner, familiar),
    ]),
  });
}
function currentFamiliar(owner) {
  const familiars = linkedFamiliars(owner);
  return familiars.length === 1 ? familiars[0] : null;
}
function assertUsing(owner, familiar) {
  requireAccess(owner, familiar);
  if (!dailiesState(owner, familiar).using)
    throw new Error(t("DailiesNotConnected"));
  if (temporaryItems(familiar)) throw new Error(t("DailiesTemporary"));
}
export function createFamiliarDaily() {
  return {
    key: KEY,
    items: [],
    label: () => t("DailiesTitle"),
    condition: (owner) => {
      const familiar = currentFamiliar(owner);
      return Boolean(
        familiar?.isOwner &&
        owner.isOwner !== false &&
        !temporaryItems(familiar) &&
        dailiesState(owner, familiar).using,
      );
    },
    prepare: (owner) => {
      const familiar = currentFamiliar(owner);
      assertUsing(owner, familiar);
      return { familiarId: familiar.id, snapshot: snapshot(owner, familiar) };
    },
    rows: async (owner, _items, custom) => {
      const familiar = currentFamiliar(owner);
      assertUsing(owner, familiar);
      if (custom?.snapshot !== snapshot(owner, familiar))
        throw new Error(t("InlineStale"));
      const protectedItems = familiarAbilityItems(familiar).filter(
        (item) => !familiarCanRemove(item, owner, familiar),
      );
      const protectedSlugs = new Set(
        protectedItems.map((item) => item.system?.slug),
      );
      const remaining =
        familiarAllowance(owner, familiar) - protectedItems.length;
      if (remaining < 0)
        return [
          {
            type: "alert",
            slug: "limit",
            message: t("FamiliarLimit"),
            resolve: () => false,
          },
        ];
      const catalog = await familiarCatalog();
      const options = [
        { value: "", label: "—", skipUnique: true },
        ...catalog
          .filter((entry) => !protectedSlugs.has(entry.id))
          .map((entry) => ({ value: entry.id, label: entry.name })),
      ];
      const note =
        protectedItems.map((item) => item.name).join(", ") || t("NoEntries");
      return [
        {
          type: "notify",
          slug: "protected",
          message: `${t("DailiesProtected")}: ${note}`,
          save: false,
        },
        ...Array.from({ length: remaining }, (_, index) => ({
          type: "select",
          slug: `ability${index + 1}`,
          label: `${t("DailiesAbility")} ${index + 1}`,
          options: structuredClone(options),
          unique: KEY,
          empty: true,
          save: true,
        })),
      ];
    },
    process: async ({ actor: owner, rows, custom, messages }) => {
      const familiar = currentFamiliar(owner);
      assertUsing(owner, familiar);
      if (
        custom?.familiarId !== familiar.id ||
        custom?.snapshot !== snapshot(owner, familiar)
      )
        throw new Error(t("InlineStale"));
      const protectedItems = familiarAbilityItems(familiar).filter(
        (item) => !familiarCanRemove(item, owner, familiar),
      );
      const count = familiarAllowance(owner, familiar) - protectedItems.length;
      const selected = [];
      for (const [key, value] of Object.entries(rows ?? {})) {
        if (key === "protected") continue;
        const match = /^ability([1-9]\d*)$/.exec(key);
        if (!match || Number(match[1]) > count || typeof value !== "string")
          throw new Error(t("FamiliarSelectionInvalid"));
        if (value) selected.push(value);
      }
      if (new Set(selected).size !== selected.length)
        throw new Error(t("FamiliarSelectionInvalid"));
      const catalog = await familiarCatalog();
      if (
        selected.some(
          (id) =>
            !catalog.some((entry) => entry.id === id) ||
            protectedItems.some((item) => item.system?.slug === id),
        )
      )
        throw new Error(t("FamiliarSelectionInvalid"));
      // Сохраняем прежнюю защиту и очередь, а не создаём второй движок Items.
      await syncFamiliarAbilities(owner, familiar, selected);
      messages.addGroup(KEY, t("DailiesTitle"));
      for (const id of selected) {
        const entry = catalog.find((item) => item.id === id);
        messages.add(KEY, {
          uuid: `Compendium.${MODULE_ID}.familiar-abilities.Item.${entry.itemId}`,
        });
      }
      if (!selected.length)
        messages.add(KEY, { label: t("DailiesNoNewAbilities") });
    },
    rest: async ({ actor: owner }) => {
      const familiar = currentFamiliar(owner);
      if (!dailiesState(owner, familiar).using) return;
      try {
        requireAccess(owner, familiar);
        // Только неизменённые Items этого модуля. Dailies сам снимает свои temporary.
        // Их флаги не присваиваются нашим Items и не используются для чужой очистки.
        await syncFamiliarAbilities(owner, familiar, []);
      } catch (error) {
        // Ошибка одного набора не должна прерывать отдых всех остальных dailies.
        console.warn(`${MODULE_ID} | Способности сохранены при отдыхе`, error);
        ui.notifications.warn(error.message);
      }
    },
  };
}
export function initializeDailiesIntegration() {
  const module = game.modules.get(DAILIES);
  if (!module?.active || !compatible()) return false;
  const api = apiOf();
  if (
    ![
      "registerCustomDailies",
      "getDisabledDailies",
      "openDailiesInterface",
      "canPrepareDailies",
    ].every((key) => typeof api?.[key] === "function")
  )
    return false;
  if (registered.has(api)) return true;
  try {
    api.registerCustomDailies([createFamiliarDaily()]);
    registered.add(api);
    return true;
  } catch (error) {
    console.error(`${MODULE_ID} | Интеграция Dailies недоступна`, error);
    return false;
  }
}
export function connectDailies(owner, familiar, enabled) {
  const next = (operations.get(owner?.id) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      requireAccess(owner, familiar);
      const saved = owner.getFlag(MODULE_ID, "dailiesFamiliar");
      if (enabled) {
        if (
          !initializeDailiesIntegration() ||
          !dailiesState(owner, familiar).available
        )
          throw new Error(t("DailiesUnavailable"));
        if (temporaryItems(familiar)) throw new Error(t("DailiesTemporary"));
        if (saved?.enabled) {
          if (!builtInDisabled(owner)) throw new Error(t("DailiesConflict"));
          return;
        }
        const raw = owner.getFlag(DAILIES, "disabled")?.dailies?.familiar;
        if (raw !== undefined && typeof raw !== "boolean")
          throw new Error(t("DailiesConflict"));
        // Пользователь явно нажал «Подключить»: меняем лишь стандартный набор
        // фамильяра на этом владельце и сохраняем его прежнее значение для возврата.
        await owner.update({
          [`flags.${MODULE_ID}.dailiesFamiliar`]: {
            enabled: true,
            previousBuiltIn: raw ?? null,
          },
          [`flags.${DAILIES}.disabled.dailies.familiar`]: true,
        });
      } else {
        if (!saved?.enabled) return;
        const update = {
          [`flags.${MODULE_ID}.dailiesFamiliar`]: { ...saved, enabled: false },
        };
        // Не перезаписываем более новую ручную настройку Dailies.
        const raw = owner.getFlag(DAILIES, "disabled")?.dailies?.familiar;
        if (raw === true) {
          const key =
            saved.previousBuiltIn === null ? "-=familiar" : "familiar";
          update[`flags.${DAILIES}.disabled.dailies.${key}`] =
            saved.previousBuiltIn;
        }
        await owner.update(update);
      }
    });
  operations.set(owner?.id, next);
  return next.finally(() => {
    if (operations.get(owner?.id) === next) operations.delete(owner?.id);
  });
}
export function openDailies(owner, familiar) {
  assertUsing(owner, familiar);
  const api = apiOf();
  if (!api.canPrepareDailies(owner)) throw new Error(t("DailiesRestFirst"));
  return api.openDailiesInterface(owner);
}
export function dailiesControls(owner, familiar) {
  const state = dailiesState(owner, familiar);
  if (!state.active && !state.enabled) return "";
  const disabled = owner.isOwner === false || familiar.isOwner === false;
  return `<div class="sfmtp-dailies"><p>${esc(t(state.temporary ? "DailiesTemporary" : state.conflict ? "DailiesConflict" : state.enabled && !state.available ? "DailiesMissing" : state.using ? "DailiesConnected" : state.available ? "DailiesDetected" : "DailiesUnavailable"))}</p>${state.available && !state.enabled ? `<p class="hint">${esc(t("DailiesConnectHint"))}</p><button type="button" data-sfmtp-dailies="connect" ${disabled ? "disabled" : ""}>${esc(t("DailiesConnect"))}</button>` : ""}${state.using ? `<button type="button" data-sfmtp-dailies="open" ${disabled ? "disabled" : ""}>${esc(t("DailiesOpen"))}</button>` : ""}${state.enabled ? `<button type="button" data-sfmtp-dailies="disconnect" ${disabled ? "disabled" : ""}>${esc(t("DailiesDisconnect"))}</button>` : ""}</div>`;
}
export function bindDailiesControls(root, owner, familiar, render) {
  for (const button of root.querySelectorAll("[data-sfmtp-dailies]"))
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      button.disabled = true;
      try {
        if (button.dataset.sfmtpDailies === "open")
          await openDailies(owner, familiar);
        else {
          await connectDailies(
            owner,
            familiar,
            button.dataset.sfmtpDailies === "connect",
          );
          await render();
        }
      } catch (error) {
        ui.notifications.warn(error.message);
      } finally {
        button.disabled = false;
      }
    });
}
