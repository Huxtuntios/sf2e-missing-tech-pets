// Панель мягкой автоматизации: операции требуют нажатия, стоимость действий остаётся на игроке.
import { TechPetsDialog } from "./dialog.mjs";
import { t } from "./i18n.mjs";
import { escapeHTML as esc } from "./item-sources.mjs";
import {
  mechanicStats,
  TURRET_ARRAYS,
  eligibleExocortexActions,
} from "./exocortex-rules.mjs";
import {
  assertExocortexAccess,
  exocortexState,
  linkedDrone,
  updateExocortex,
  repairDrone,
  installExocortexActions,
  showExocortexSource,
} from "./exocortex.mjs";
const button = (operation, key, attributes = "") =>
  `<button type="button" data-exo-operation="${operation}" ${attributes}>${esc(t(key))}</button>`;
const stat = (key, value) =>
  `<p><strong>${esc(t(key))}:</strong> ${esc(value ?? "—")}</p>`;
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
  const state = exocortexState(owner),
    drone = linkedDrone(owner);
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
    ? `<section><h3>${esc(t("ExoMines"))}</h3>${sourceButtons("mine")}${stat("ExoMineCapacity", stats.mineCapacity)}${stat("ExoMinePrepared", state.mines.prepared)}${stat("ExoMineDeployed", state.mines.deployed.length)}${stat("ExoMineDamage", `${stats.mineDice}d6`)}${stat("ExoMineRadius", `${stats.mineRadius} ${t("ExoFeet")}`)}${stat("ExoSmartTargets", stats.smartTargets)}${stat("ExoModifyRange", stats.canModify ? `${Math.max(60, stats.modifyRange ?? 0)} ${t("ExoFeet")}` : t("ExoNotAvailable"))}<p>${esc(t("ExoMineRules"))}</p>${button("mine-daily", "ExoDailyMines")}${button("mine-craft", "ExoCraftMines")}${button("mine-collect", "ExoCollectMines")}<label>${esc(t("ExoMineLabel"))}<input type="text" name="exo-mine-label" maxlength="120"></label>${button("mine-deploy", "ExoDeployMine")}<label>${esc(t("ExoDamageType"))}<select name="exo-mine-damage"><option value="fire">${esc(t("ExoFire"))}</option><option value="piercing">${esc(t("ExoPiercing"))}</option></select></label><ul>${state.mines.deployed.map((mine) => `<li>${esc(mine.label)} ${button("mine-detonate", "ExoDetonate", `data-id="${esc(mine.id)}"`)}</li>`).join("")}</ul><p>${esc(t("ExoMineMods"))}</p></section>`
    : "";
  const turretHTML = stats.variants.includes("turret")
    ? `<section><h3>${esc(t("ExoTurret"))}</h3>${sourceButtons("turret")}${stat("ExoTurretAC", stats.classDC)}${stat("ExoTurretMaxHP", stats.turretHP)}${stat("ExoBrokenThreshold", Math.floor(stats.turretHP / 2))}${stat("ExoHardness", stats.turretHardness)}${stat("ExoTurretSaves", `${stats.turretSave >= 0 ? "+" : ""}${stats.turretSave}`)}${stat("ExoState", t(state.turret.hp <= Math.floor(stats.turretHP / 2) ? "ExoBroken" : state.turret.deployed ? "ExoDeployed" : "ExoStored"))}<label>${esc(t("ExoCurrentHP"))}<input type="number" name="exo-turret-hp" min="0" max="${stats.turretHP}" value="${state.turret.hp}"></label>${button("turret-hp", "Save")}${button("turret-deploy", state.turret.deployed ? "ExoRecallTurret" : "ExoDeployTurret")}${button("turret-repair", "ExoRepairTurret")}${button("turret-recover", "ExoRecoverTurret")}<label>${esc(t("ExoArray"))}<select name="exo-turret-array">${Object.keys(
        TURRET_ARRAYS,
      )
        .map(
          (id) =>
            `<option value="${id}" ${state.turret.array === id ? "selected" : ""}>${esc(t(`ExoArray_${id}`))}</option>`,
        )
        .join(
          "",
        )}</select></label>${button("turret-array", "ExoSaveArray")}${stat("ExoArrayDamage", `1d8 ${t(`ExoDamage_${TURRET_ARRAYS[state.turret.array].damage}`)} · ${TURRET_ARRAYS[state.turret.array].range} ${t("ExoFeet")} · ${t(`ExoTrait_${TURRET_ARRAYS[state.turret.array].trait}`)} · ${t(`ExoGroup_${TURRET_ARRAYS[state.turret.array].group}`)}`)}<p>${esc(t("ExoTurretRules"))}</p><p>${esc(t("ExoTurretMods"))}</p></section>`
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
    else await updateExocortex(owner, operation, args);
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
