// Панель мягкой автоматизации: операции требуют нажатия, стоимость действий остаётся на игроке.
import { TechPetsDialog } from "./dialog.mjs";
import { t } from "./i18n.mjs";
import { escapeHTML as esc, MODULE_ID } from "./item-sources.mjs";
import {
  getExocortexDeviceData,
  performExocortexOperation,
  getTurretActor,
  getAvailableTurretArrays,
  EXPANDED_TURRET_ARRAYS,
  rollTurretStrike,
} from "./exocortex-devices.mjs";
import {
  mechanicStats,
  isMechanic,
  TURRET_ARRAYS,
  eligibleExocortexActions,
} from "./exocortex-rules.mjs";
import {
  assertExocortexAccess,
  linkedDrone,
  repairDrone,
  installExocortexActions,
  showExocortexSource,
} from "./exocortex.mjs";
const button = (operation, key, attributes = "") =>
  `<button type="button" data-exo-operation="${operation}" ${attributes}>${esc(t(key))}</button>`;
// Метрики выводим компактной строкой (inline-block), а не отдельными абзацами.
const stat = (key, value) =>
  `<span class="sfmtp-stat"><strong>${esc(t(key))}:</strong> ${esc(value ?? "—")}</span>`;
// Показываем конкретную локализованную причину, не скрываем её общим AddFailed.
const safe =
  (callback) =>
  async (...args) => {
    try {
      return await callback(...args);
    } catch (error) {
      ui.notifications.error(error.message);
    }
  };
export function openExocortexManager(owner, { openTechPets } = {}) {
  try {
    assertExocortexAccess(owner);
  } catch (error) {
    ui.notifications.error(error.message);
    return;
  }
  const stats = mechanicStats(owner, {
    withoutLevel: !!game.pf2e?.settings?.variants?.pwol?.enabled,
  });
  const state = getExocortexDeviceData(owner),
    drone = linkedDrone(owner),
    turret = getTurretActor(owner),
    arrays = getAvailableTurretArrays(owner);
  const maxHP = turret?.system.attributes.hp.max ?? stats.turretHP;
  const selectedArray = arrays[state.turret.array] ?? TURRET_ARRAYS.laser;
  const extraArrays = owner.getFlag(MODULE_ID, "devices")?.arrays ?? [];
  const strikes = turret ? `<div>${[0, 1, 2].map(map => `<button type="button" data-exo-strike="${map}">${esc(t(`ExoStrike${map}`))}</button>`).join("")}</div><p>${esc(t("ExoStrikeManual"))}</p>` : "";
  const expanded = [...owner.items].some(item => item.type === "feat" && item.system.slug === "expansive-array")
    ? `<fieldset><legend>${esc(t("ExoExtraArrays"))}</legend>${Object.keys(EXPANDED_TURRET_ARRAYS).map(array => `<label><input type="checkbox" data-exo-extra-array value="${array}" ${extraArrays.includes(array) ? "checked" : ""}>${esc(t(`ExoArray_${array}`))}</label>`).join("")}${button("turret-arrays", "ExoSaveArray")}</fieldset>`
    : "";
  const sourceButtons = (key) =>
    `<button type="button" data-exo-source="${key}">${esc(t("ExoOpenRules"))}</button><button type="button" data-exo-chat="${key}">${esc(t("SendToChat"))}</button>`;
  const range = stats.canModify
    ? stats.modifyRange
      ? `${stats.modifyRange} ${t("ExoFeet")}`
      : t("ExoReach")
    : t("ExoNotAvailable");
  const globalRules = `${stat("ExoClassDC", stats.classDC)}${stat("ExoModifyRange", range)}${stat("ExoModsPerAction", stats.modsPerAction)}<p>${esc(t("ExoModifyRules"))}</p>${!stats.mainClass ? `<p>${esc(t("ExoArchetype"))}</p>` : ""}${stats.enduring ? `<p>${esc(t("ExoEnduring"))}</p>` : ""}${stats.instant ? `<p>${esc(t("ExoInstant"))}</p>` : ""}${stats.mobile && stats.variants.some((variant) => variant !== "drone") ? stat("ExoReposition", `${stats.repositionDistance} ${t("ExoFeet")}`) : ""}`;
  const droneHTML = stats.variants.includes("drone")
    ? `<section><h3>${esc(t("ExoDrone"))}</h3>${sourceButtons("drone")}${stat("ExoLinkedDrone", drone?.name)}<button type="button" data-exo-link>${esc(t("ExoLinkDrone"))}</button><p>${esc(t("ExoDroneRules"))}</p><label>${esc(t("ExoCommand"))}<select name="exo-command"><option value="1" ${state.drone.commandActions === 1 ? "selected" : ""}>${esc(t("ExoCommandOne"))}</option><option value="2" ${state.drone.commandActions === 2 ? "selected" : ""}>${esc(t("ExoCommandTwo"))}</option></select></label>${button("drone-command", "Save")}<p>${esc(t("ExoCommandHint"))}</p>${button("drone-repair", "ExoRepairDrone", drone ? "" : "disabled")}${button("drone-reboot", "ExoRebootDrone", drone ? "" : "disabled")}${stat("ExoDesperateRepair", stats.desperateRepairHP)}<p>${esc(t("ExoDroneMods"))}</p>${stats.droneCriticalSpecialization ? `<p>${esc(t("ExoDroneCritical"))}</p>` : ""}</section>`
    : "";
  const minesHTML = stats.variants.includes("mine")
    ? `<section><h3>${esc(t("ExoMines"))}</h3>${sourceButtons("mine")}${stat("ExoMineCapacity", stats.mineCapacity)}${stat("ExoMinePrepared", state.mines.prepared)}${stat("ExoMineDeployed", state.mines.deployed.length)}${stat("ExoMineDamage", `${stats.mineDice}d6`)}${stat("ExoMineRadius", `${stats.mineRadius} ${t("ExoFeet")}`)}${stat("ExoSmartTargets", stats.smartTargets)}${stat("ExoModifyRange", stats.canModify ? `${Math.max(60, stats.modifyRange ?? 0)} ${t("ExoFeet")}` : t("ExoNotAvailable"))}<p>${esc(t("ExoMineRules"))}</p>${button("mine-daily", "ExoDailyMines")}${button("mine-craft", "ExoCraftMines")}${button("mine-collect", "ExoCollectMines")}<label>${esc(t("ExoMineLabel"))}<input type="text" name="exo-mine-label" maxlength="120"></label>${button("mine-place", "ExoDeployMine")}<label>${esc(t("ExoDamageType"))}<select name="exo-mine-damage">${stats.level >= 5 && [...owner.items].some(item => item.type === "feat" && item.system.slug === "damage-customizations") ? `<option value="selected">${esc(t("ExoSelectedDamage"))}</option>` : ""}<option value="fire">${esc(t("ExoFire"))}</option><option value="piercing">${esc(t("ExoPiercing"))}</option>${[...owner.items].some(item => item.type === "feat" && item.system.slug === "healing-mines") ? `<option value="healing">${esc(t("ExoHealing"))}</option>` : ""}</select></label><ul>${state.mines.deployed.map((mine) => `<li>${esc(mine.label)} ${mine.tokenUuid ? `<button type="button" data-exo-open-mine="${esc(mine.tokenUuid)}">${esc(t("ExoOpenMine"))}</button>` : ""} ${button("mine-detonate", "ExoDetonate", `data-id="${esc(mine.id)}"`)}</li>`).join("")}</ul><p>${esc(t("ExoMineMods"))}</p></section>`
    : "";
  const turretHTML = stats.variants.includes("turret")
    ? `<section><h3>${esc(t("ExoTurret"))}</h3>${sourceButtons("turret")}${stat("ExoTurretAC", turret?.system.attributes.ac.value ?? stats.classDC)}${stat("ExoTurretMaxHP", maxHP)}${stat("ExoBrokenThreshold", Math.floor(maxHP / 2))}${stat("ExoHardness", turret?.hardness ?? stats.turretHardness)}${stat("ExoTurretSaves", `${stats.turretSave >= 0 ? "+" : ""}${stats.turretSave}`)}${stat("ExoState", t(state.turret.hp <= Math.floor(maxHP / 2) ? "ExoBroken" : state.turret.deployed ? "ExoDeployed" : "ExoStored"))}<label>${esc(t("ExoCurrentHP"))}<input type="number" name="exo-turret-hp" min="0" max="${maxHP}" value="${state.turret.hp}"></label>${button("turret-hp", "Save")}${button(state.turret.deployed ? "turret-recall" : "turret-place", state.turret.deployed ? "ExoRecallTurret" : "ExoDeployTurret")}<button type="button" data-exo-open-turret>${esc(t(turret ? "ExoOpenTurret" : "ExoCreateTurret"))}</button>${button("turret-repair", "ExoRepairTurret")}${button("turret-recover", "ExoRecoverTurret")}<label>${esc(t("ExoArray"))}<select name="exo-turret-array">${Object.keys(
        arrays,
      )
        .map(
          (id) =>
            `<option value="${id}" ${state.turret.array === id ? "selected" : ""}>${esc(t(`ExoArray_${id}`))}</option>`,
        )
        .join(
          "",
        )}</select></label>${button("turret-array", "ExoSaveArray")}${stat("ExoArrayDamage", `${selectedArray.dice ?? 1}d8 ${t(`ExoDamage_${selectedArray.damage}`)} · ${selectedArray.range} ${t("ExoFeet")} · ${t(`ExoTrait_${selectedArray.trait}`)} · ${t(`ExoGroup_${selectedArray.group}`)}`)}<p>${esc(t("ExoTurretRules"))}</p><p>${esc(t("ExoTurretMods"))}</p>${strikes}${expanded}</section>`
    : "";
  const content = `<div class="sfmtp-exocortex"><h3>${esc(owner.name)}</h3><p>${esc(t("ExoScope"))}</p>${sourceButtons("exocortex")}${globalRules}${!stats.variants.length ? `<p>${esc(t("ExoChooseNative"))}</p>` : ""}${droneHTML}${minesHTML}${turretHTML}${
    stats.variants.length
      ? `<hr><button type="button" data-exo-install>${esc(t("ExoInstallActions"))}</button><p>${esc(t("ExoInstallHint"))}</p><div>${eligibleExocortexActions(
          owner,
        )
          .map(
            (key) =>
              `<button type="button" data-exo-source="${key}">${esc(t(`ExoAction_${key}`))}</button><button type="button" data-exo-chat="${key}">${esc(t("SendToChat"))}</button>`,
          )
          .join("")}</div>`
      : ""
  }</div>`;
  const redraw = () => openExocortexManager(owner, { openTechPets });
  const execute = safe(async (operation, args) => {
    if (["drone-repair", "drone-reboot"].includes(operation))
      await repairDrone(owner, {
        confirmed: true,
        reboot: operation === "drone-reboot",
      });
    else await performExocortexOperation(owner, operation, args);
    redraw();
  });
  return new TechPetsDialog(
    {
      title: t("ExoTitle"),
      content,
      buttons: { close: { label: t("Close") } },
      render: (html) => {
        html.on(
          "click",
          "[data-exo-source]",
          safe((event) =>
            showExocortexSource(owner, event.currentTarget.dataset.exoSource),
          ),
        );
        html.on(
          "click",
          "[data-exo-chat]",
          safe((event) =>
            showExocortexSource(owner, event.currentTarget.dataset.exoChat, {
              chat: true,
            }),
          ),
        );
        html.on("click", "[data-exo-link]", () => openTechPets?.(owner));
        html.on("click", "[data-exo-open-turret]", safe(async () => {
          if (!getTurretActor(owner)) await performExocortexOperation(owner, "turret-create");
          redraw();
          getTurretActor(owner)?.sheet.render(true);
        }));
        html.on("click", "[data-exo-strike]", safe(event => rollTurretStrike(owner, Number(event.currentTarget.dataset.exoStrike))));
        html.on("click", "[data-exo-open-mine]", safe(async event => {
          const token = await fromUuid(event.currentTarget.dataset.exoOpenMine);
          token?.actor?.sheet.render(true);
        }));
        html.on(
          "click",
          "[data-exo-install]",
          safe(async () => {
            await installExocortexActions(owner);
            ui.notifications.info(t("ExoActionsInstalled"));
          }),
        );
        html.on("click", "[data-exo-operation]", async (event) => {
          const operation = event.currentTarget.dataset.exoOperation;
          const args = {
            hp: html.find('[name="exo-turret-hp"]').val(),
            array: html.find('[name="exo-turret-array"]').val(),
            label: html.find('[name="exo-mine-label"]').val(),
            id: event.currentTarget.dataset.id,
            damageType: html.find('[name="exo-mine-damage"]').val(),
            actions: html.find('[name="exo-command"]').val(),
            arrays: html.find("[data-exo-extra-array]").nodes.filter(input => input.checked).map(input => input.value),
          };
          if (
            [
              "mine-daily",
              "turret-repair",
              "drone-repair",
              "drone-reboot",
              "mine-detonate",
            ].includes(operation)
          ) {
            new TechPetsDialog({
              title: t("ExoConfirm"),
              content: `<p>${esc(t(operation === "mine-daily" ? "ExoDailyConfirm" : operation === "mine-detonate" ? "ExoDetonateConfirm" : "ExoRepairConfirm"))}</p>`,
              buttons: {
                yes: {
                  label: t("ExoConfirm"),
                  callback: () =>
                    execute(operation, { ...args, confirmed: true }),
                },
                cancel: { label: t("Cancel") },
              },
            }).render(true);
          } else await execute(operation, args);
        });
      },
    },
    { width: 760, height: 720, resizable: true },
  ).render(true);
}

export function renderExocortexSheet(app, root) {
  const owner = app.actor;
  if (!isMechanic(owner)) return null;
  const target = root.querySelector('[data-tab="actions"] .actions-panel[data-tab="encounter"]');
  if (!target) return null;
  root.querySelectorAll(".sfmtp-exocortex-inline").forEach(panel => panel.remove());
  root.querySelectorAll(".sfmtp-mine-resource").forEach(panel => panel.remove());
  const stats = mechanicStats(owner);
  const state = getExocortexDeviceData(owner);
  const owned = owner.isOwner !== false;
  const turret = getTurretActor(owner);
  const arrays = getAvailableTurretArrays(owner);
  const disabled = owned ? "" : "disabled";
  if (stats.variants.includes("mine")) {
    let resources = root.querySelector(".subsection.resources");
    if (!resources) {
      const perception = root.querySelector("section.perception");
      const anchor = perception?.previousElementSibling;
      if (!anchor?.before) return null;
      resources = document.createElement("div");
      resources.className = "subsection resources";
      resources.dataset.sfmtpMineResources = "true";
      const header = document.createElement("header");
      const heading = document.createElement("h2");
      heading.textContent = game.i18n.localize("PF2E.Actor.Resources");
      header.append(heading);
      resources.append(header, document.createElement("ol"));
      anchor.before(resources);
    }
    const list = resources.querySelector("ol");
    if (list) {
      const id = `sfmtp-mines-${owner.id}-${foundry.utils.randomID()}`;
      const row = document.createElement("li");
      row.className = "special-resource sfmtp-mine-resource";
      row.innerHTML = `<label for="${id}"><span class="label">${esc(t("ExoMines"))}</span></label><input id="${id}" type="text" inputmode="numeric" data-dtype="Number" data-allow-delta data-min="0" data-max="${stats.mineCapacity}" data-exo-resource-count value="${state.mines.prepared}" ${disabled}><span aria-hidden="true">/ ${stats.mineCapacity}</span>`;
      for (const type of ["change", "input", "click"]) row.addEventListener(type, event => event.stopPropagation());
      row.querySelector("input").addEventListener("change", safe(async event => {
        if (!owned) return;
        if (getExocortexDeviceData(owner).mines.prepared !== state.mines.prepared) throw new Error(t("InlineStale"));
        await performExocortexOperation(owner, "mine-count", { count: event.currentTarget.value, expected: state.mines.prepared });
        app.render(false);
      }));
      list.append(row);
    }
  }
  const panel = document.createElement("details");
  panel.className = "sfmtp-inline sfmtp-exocortex-inline";
  const control = (operation, key) => `<button type="button" data-exo-sheet="${operation}" ${disabled}>${esc(t(key))}</button>`;
  const mines = stats.variants.includes("mine")
    ? `<p>${esc(t("ExoMinePrepared"))}: <strong>${state.mines.prepared} / ${stats.mineCapacity}</strong> · ${esc(t("ExoMineDeployed"))}: ${state.mines.deployed.length}</p><label>${esc(t("ExoMinePrepared"))}<input type="number" min="0" max="${stats.mineCapacity}" step="1" data-exo-count value="${state.mines.prepared}" aria-label="${esc(t("ExoMinePrepared"))}" ${disabled}></label>${control("mine-count", "Save")}${control("mine-place", "ExoDeployMine")}${control("mine-collect", "ExoCollectMines")}`
    : "";
  const turretControls = stats.variants.includes("turret")
    ? `${control("turret-open", turret ? "ExoOpenTurret" : "ExoCreateTurret")}${control(state.turret.deployed ? "turret-recall" : "turret-place", state.turret.deployed ? "ExoRecallTurret" : "ExoDeployTurret")}<label>${esc(t("ExoArray"))}<select data-exo-array ${disabled}>${Object.keys(arrays).map(array => `<option value="${esc(array)}" ${state.turret.array === array ? "selected" : ""}>${esc(t(`ExoArray_${array}`))}</option>`).join("")}</select></label>${control("turret-array", "ExoSaveArray")}`
    : "";
  panel.innerHTML = `<summary>${esc(t("ExoTitle"))}${stats.variants.includes("mine") ? ` — ${state.mines.prepared} / ${stats.mineCapacity}` : ""}</summary>${mines}${turretControls}${control("open", "ExoOpenPanel")}<p class="hint">${esc(t("ExoSheetHint"))}</p><p data-exo-status role="status"></p>`;
  for (const type of ["change", "input", "click"]) panel.addEventListener(type, event => event.stopPropagation());
  panel.addEventListener("click", safe(async event => {
    const button = event.target.closest("[data-exo-sheet]");
    if (!button || !owned || button.disabled) return;
    const operation = button.dataset.exoSheet;
    if (operation === "open") { openExocortexManager(owner); return; }
    if (operation === "turret-open" && turret) { turret.sheet.render(true); return; }
    button.disabled = true;
    try {
      if (operation === "mine-count" && getExocortexDeviceData(owner).mines.prepared !== state.mines.prepared) throw new Error(t("InlineStale"));
      const args = operation === "mine-count" ? { count: panel.querySelector("[data-exo-count]").value, expected: state.mines.prepared } : operation === "turret-array" ? { array: panel.querySelector("[data-exo-array]").value } : {};
      await performExocortexOperation(owner, operation === "turret-open" ? "turret-create" : operation, args);
      app.render(false);
      if (operation === "turret-open") getTurretActor(owner)?.sheet.render(true);
    } finally { button.disabled = false; }
  }));
  target.prepend(panel);
  return panel;
}
