import { t } from "./i18n.mjs";
import {
  dailiesState,
  dailiesControls,
  bindDailiesControls,
} from "./dailies.mjs";
import {
  familiarOwner,
  familiarCatalog,
  familiarAbilityItems,
  familiarCanRemove,
  familiarAllowance,
  familiarFingerprint,
  syncFamiliarAbilities,
} from "./familiars.mjs";

const ID = "sf2e-missing-tech-pets";
const CHASSIS = `Compendium.${ID}.robot-chassis.`;
const grades = { commercial: 0, tactical: 1, advanced: 2, superior: 3 };
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
const elementOf = (html, app) =>
  html?.querySelector ? html : (html?.[0] ?? app.element?.[0] ?? app.element);

export function isChassisSource(item) {
  return (
    item?.type === "ancestry" &&
    (String(item.uuid ?? "").startsWith(CHASSIS) ||
      String(
        item.flags?.core?.sourceId ?? item._stats?.compendiumSource ?? "",
      ).startsWith(CHASSIS) ||
      Boolean(item.flags?.[ID]?.chassisId))
  );
}

// Редактируем только каталоговые записи; ручные и неизвестные записи сохраняются.
// Для повторяемых улучшений число копий задаётся явно, прежние ID не меняются.
export function selectedModifications(
  previous,
  catalog,
  counts,
  gradeLimit,
  randomID,
) {
  const known = new Set(catalog.map((entry) => entry.id));
  const result = previous.filter(
    (entry) => entry.manual || !known.has(entry.catalogId),
  );
  for (const entry of catalog) {
    const old = previous.filter(
      (item) => !item.manual && item.catalogId === entry.id,
    );
    const count = Number(counts[entry.id] ?? old.length);
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > Math.max(50, old.length) ||
      (!entry.repeatable && count > Math.max(1, old.length))
    )
      throw new Error(t("InlineInvalidCount"));
    if (
      count > old.length &&
      (grades[entry.grade] ?? 0) > (grades[gradeLimit] ?? 0)
    )
      throw new Error(t("InlineGradeLocked"));
    result.push(...old.slice(0, count));
    for (let index = old.length; index < count; index++)
      result.push({
        id: randomID(),
        catalogId: entry.id,
        name: entry.name,
        grade: entry.grade,
        source: entry.sourceUrl,
        cost: Math.max(1, Number(entry.cost) || 1),
      });
  }
  return result;
}

export function robotController(actor, getRobotData) {
  if (actor?.type !== "character") return null;
  const data = getRobotData(actor);
  const chassisOnActor = Array.from(actor.items ?? []).some(isChassisSource);
  const hasRobotProfile = (profile) =>
    Boolean(profile.chassisCatalogId || profile.chassis);
  if (data.ownerActorId) {
    const owner = game.actors.get(data.ownerActorId);
    const ownerData = owner?.type === "character" ? getRobotData(owner) : null;
    return ownerData?.companionActorId === actor.id &&
      (chassisOnActor || hasRobotProfile(data) || hasRobotProfile(ownerData))
      ? owner
      : null;
  }
  // Одна связь или standalone-метка бывает и у животного-компаньона.
  // Не предлагаем ему роботизированные кастомизации без выбранного шасси.
  return chassisOnActor || (!data.companionActorId && hasRobotProfile(data))
    ? actor
    : null;
}

// SF2e исключает Companion Compendia из ABCPicker по namespace. Для своего
// пака скрываем только строки выбора, не меняя документы, индексы или API системы.
export function registerSheetIntegration(services) {
  const observers = new WeakMap();
  Hooks.on("renderABCPicker", (app, html) => {
    if (app.options?.itemType !== "ancestry") return;
    const root = elementOf(html, app);
    if (!root?.querySelectorAll) return;
    observers.get(app)?.disconnect();
    const filter = () => {
      for (const row of root.querySelectorAll("li[data-uuid]")) {
        const uuid = row.dataset.uuid;
        const world = uuid?.startsWith("Item.")
          ? game.items?.get(uuid.slice(5))
          : null;
        const hidden = uuid?.startsWith(CHASSIS) || isChassisSource(world);
        if (hidden) {
          row.hidden = true;
          row.dataset.sfmtpHidden = "true";
        } else if (row.dataset.sfmtpHidden) {
          row.hidden = false;
          delete row.dataset.sfmtpHidden;
        }
      }
    };
    filter();
    if (globalThis.MutationObserver) {
      const observer = new MutationObserver(filter);
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-uuid"],
      });
      observers.set(app, observer);
    }
  });
  Hooks.on("closeABCPicker", (app) => {
    observers.get(app)?.disconnect();
    observers.delete(app);
  });

  const generations = new WeakMap();
  const render = async (app, html) => {
    const actor = app.actor;
    const root = elementOf(html, app);
    if (!root?.querySelector || !actor) return;
    const generation = (generations.get(app) ?? 0) + 1;
    generations.set(app, generation);
    root.querySelectorAll(".sfmtp-inline").forEach((node) => node.remove());
    const controller =
      actor.type === "familiar"
        ? familiarOwner(actor)
        : robotController(actor, services.getRobotData);
    if (!controller) return;
    const target =
      actor.type === "familiar"
        ? root
            .querySelector(
              '[data-action="browse-abilities"][data-action-category="familiar"]',
            )
            ?.closest(".section-container")
            ?.querySelector(".section-body")
        : root.querySelector('section[data-tab="feats"]');
    if (!target) return;
    try {
      const familiar = actor.type === "familiar";
      const catalog = familiar
        ? await familiarCatalog()
        : (await services.loadCatalog("robot-customizations.json")).entries;
      if (generations.get(app) !== generation || !root.contains(target)) return;
      const data = familiar ? null : services.getRobotData(controller);
      const previous = familiar
        ? familiarAbilityItems(actor)
        : data.modifications;
      const signature = () =>
        familiar
          ? JSON.stringify({
              master: actor.system?.master?.id,
              allowance: familiarAllowance(controller, actor),
              items: familiarAbilityItems(actor).map((item) => [
                item.id,
                familiarFingerprint(item),
                familiarCanRemove(item, controller, actor),
              ]),
            })
          : JSON.stringify(services.getRobotData(controller));
      const snapshot = signature();
      const owned = actor.isOwner !== false && controller.isOwner !== false;
      const protectedSlugs = new Set(
        familiar
          ? previous
              .filter((item) => !familiarCanRemove(item, controller, actor))
              .map((item) => item.system?.slug)
          : [],
      );
      const selected = new Set(
        familiar
          ? previous.map((item) => item.system?.slug)
          : previous.map((item) => item.catalogId),
      );
      const panel = document.createElement("details");
      panel.className = "sfmtp-inline";
      const summary = familiar
        ? `${previous.length} / ${familiarAllowance(controller, actor)}`
        : `${services.robotSummary(controller).used} / ${services.robotSummary(controller).total}`;
      const installed =
        previous.map((item) => esc(item.name)).join(", ") ||
        esc(t("NoEntries"));
      panel.innerHTML = `<summary>${esc(t(familiar ? "InlineFamiliarTitle" : "InlineRobotTitle"))} (${esc(summary)})</summary><p>${esc(t("InlineCurrent"))}: ${installed}</p><p class="hint">${esc(t(familiar ? "InlineFamiliarHint" : "InlineRobotHint"))}</p><input type="search" data-sfmtp-search placeholder="${esc(t("Search"))}" aria-label="${esc(t("Search"))}"><div class="sfmtp-inline-catalog">${catalog
        .map((entry) => {
          const oldCount = familiar
            ? selected.has(entry.id)
              ? 1
              : 0
            : previous.filter(
                (item) => !item.manual && item.catalogId === entry.id,
              ).length;
          const locked = familiar
            ? protectedSlugs.has(entry.id)
            : (grades[entry.grade] ?? 0) > (grades[data.gradeLimit] ?? 0);
          const disabled =
            !owned ||
            (familiar && locked) ||
            (!familiar && locked && !oldCount);
          const control =
            !familiar && (entry.repeatable || oldCount > 1)
              ? `<input type="number" min="0" max="${entry.repeatable ? Math.max(50, oldCount) : oldCount}" step="1" value="${oldCount}" data-sfmtp-id="${esc(entry.id)}" aria-label="${esc(entry.name)}" ${disabled ? "disabled" : ""}>`
              : `<input type="checkbox" data-sfmtp-id="${esc(entry.id)}" ${oldCount ? "checked" : ""} ${disabled ? "disabled" : ""}>`;
          const detail = familiar
            ? t(`Category.${entry.category}`)
            : t(`Grade.${entry.grade}`);
          const status =
            familiar && locked
              ? t("InlineProtected")
              : !familiar && locked
                ? t("InlineGradeLocked")
                : "";
          return `<details class="sfmtp-inline-entry" data-sfmtp-entry="${esc(`${entry.name} ${detail}`.toLocaleLowerCase())}"><summary><label>${control} ${esc(entry.name)}</label><small>${esc(detail)} ${esc(status)}</small></summary><p>${esc(entry.description ?? t("InlineRulesOnSource"))}</p>${entry.sourceUrl ? `<a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t("SourcePage"))}</a>` : ""}</details>`;
        })
        .join(
          "",
        )}</div><button type="button" data-sfmtp-save ${owned ? "" : "disabled"}>${esc(t("InlineSave"))}</button><p data-sfmtp-status role="status"></p>`;
      if (familiar) {
        if (dailiesState(controller, actor).delegated) {
          panel.querySelector("[data-sfmtp-search]").remove();
          panel.querySelector(".sfmtp-inline-catalog").remove();
          panel.querySelector("[data-sfmtp-save]").remove();
          panel.querySelector(".hint").textContent = t("DailiesConnected");
        }
        panel.insertAdjacentHTML(
          "beforeend",
          dailiesControls(controller, actor),
        );
        bindDailiesControls(panel, controller, actor, () => app.render(false));
      }
      // Поля не имеют name и не попадают в нативную форму актора.
      // События останавливаем только внутри своей панели, не затрагивая лист.
      for (const type of ["change", "input", "click"])
        panel.addEventListener(type, (event) => event.stopPropagation());
      panel
        .querySelector("[data-sfmtp-search]")
        ?.addEventListener("input", (event) => {
          const needle = event.target.value.trim().toLocaleLowerCase();
          panel.querySelectorAll("[data-sfmtp-entry]").forEach((row) => {
            row.hidden = !row.dataset.sfmtpEntry.includes(needle);
          });
        });
      panel
        .querySelector("[data-sfmtp-save]")
        ?.addEventListener("click", async (event) => {
          const button = event.currentTarget;
          if (!owned || button.disabled) return;
          button.disabled = true;
          const status = panel.querySelector("[data-sfmtp-status]");
          try {
            if (familiar && dailiesState(controller, actor).delegated)
              throw new Error(t("DailiesConnected"));
            if (signature() !== snapshot) throw new Error(t("InlineStale"));
            const controls = [...panel.querySelectorAll("[data-sfmtp-id]")];
            if (familiar)
              await syncFamiliarAbilities(
                controller,
                actor,
                controls
                  .filter((input) => input.checked)
                  .map((input) => input.dataset.sfmtpId),
              );
            else {
              const counts = Object.fromEntries(
                controls.map((input) => [
                  input.dataset.sfmtpId,
                  input.type === "number"
                    ? Number(input.value)
                    : Number(input.checked),
                ]),
              );
              await services.saveModifications(
                controller,
                actor,
                selectedModifications(
                  previous,
                  catalog,
                  counts,
                  data.gradeLimit,
                  () => foundry.utils.randomID(),
                ),
              );
            }
            status.textContent = t("InlineSaved");
            app.render(false);
          } catch (error) {
            status.textContent = error.message;
            ui.notifications.warn(error.message);
            button.disabled = false;
          }
        });
      target.append(panel);
    } catch (error) {
      console.error(`${ID} | Не удалось встроить выбор способностей`, error);
    }
  };
  Hooks.on("renderActorSheetPF2e", render);
  Hooks.on("renderActorSheetV2", render);
}
