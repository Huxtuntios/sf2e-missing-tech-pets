import { t, initializeLocalization } from "./i18n.mjs";
import { openFamiliarManager } from "./familiar-ui.mjs";
import { openExocortexManager } from "./exocortex-ui.mjs";
import { isMechanic, customizationCapacity } from "./exocortex-rules.mjs";
import {
  droneCommercialSlots,
  exocortexState,
  updateExocortex,
  installExocortexActions,
} from "./exocortex.mjs";
import {
  familiarOwner,
  linkedFamiliars,
  linkFamiliar,
  createFamiliar,
  syncFamiliarAbilities,
} from "./familiars.mjs";
import {
  applyChassisChoices,
  imitationOptions,
  allowedSizes,
  COMPANION_CLASS_UUID,
  buildChassisSource as createChassisSource,
  buildManeuverSource as createManeuverSource,
} from "./item-sources.mjs";
import { TechPetsDialog as Dialog } from "./dialog.mjs";

const MODULE_ID = "sf2e-missing-tech-pets";
const DEPENDENCY_ID = "pf2e-animal-companions";
const FLAG = MODULE_ID;

const PACKS = [
  { key: "sf-AC-Ancestries-and-Class", label: "Ancestries" },
  { key: "sf-AC-Feats", label: "Feats" },
  { key: "sf-AC-Advanced-Maneuvers", label: "Maneuvers" },
  { key: "sf-AC-effects", label: "Effects" },
  { key: "sf-AC-Features", label: "Features" },
  { key: "sf-AC-Support", label: "Support" },
  { key: "sf-AC-Construct-Companions", label: "Constructs" },
  { key: "sf-AC-Construct-Breakthroughs", label: "Breakthroughs" },
  { key: "sf-AC-Eidolons", label: "Eidolons" },
  { key: "sf-AC-Evolution-Feats", label: "Evolution" },
  { key: "sf-AC-Followers", label: "Followers" },
];

const esc = (value) => foundry.utils.escapeHTML(String(value ?? ""));
const dependency = () => game.modules.get(DEPENDENCY_ID);
const packId = (key) => `${DEPENDENCY_ID}.${key}`;

// Этот модуль использует именно SF2e-паки Companion Compendia.
// Не разрешаем случайно импортировать PF2e-документы с совпадающими slug.
function isCompatibleItemPack(pack) {
  if (pack?.documentName !== "Item") return false;
  const collection = String(pack.collection ?? "");
  const declaredSystem = String(
    pack.metadata?.system ?? pack.metadata?.systemId ?? "",
  ).toLowerCase();
  const packageName = String(pack.metadata?.packageName ?? "").toLowerCase();
  if (declaredSystem && declaredSystem !== "sf2e") return false;
  if (packageName === "pf2e") return false;
  if (/^(?:Compendium\.)?pf2e\./i.test(collection)) return false;
  // У Companion Compendia имеются отдельные PF2e- и SF2e-паки с похожими Items;
  // для SF2e оставляем только коллекции с префиксом sf-AC-.
  if (
    collection.startsWith(`${DEPENDENCY_ID}.`) &&
    !collection.startsWith(`${DEPENDENCY_ID}.sf-AC-`)
  )
    return false;
  if (
    !declaredSystem &&
    !collection.startsWith("sf2e.") &&
    !collection.startsWith(`${MODULE_ID}.`) &&
    !collection.startsWith(`${DEPENDENCY_ID}.sf-AC-`)
  )
    return false;
  return true;
}

function missingCompanionPacks() {
  return PACKS.filter(
    ({ key }) => !isCompatibleItemPack(game.packs.get(packId(key))),
  ).map(({ key }) => key);
}

function activeActor() {
  return (
    globalThis.canvas?.tokens?.controlled?.[0]?.actor ??
    game.user.character ??
    null
  );
}

function getRobotData(actor) {
  const saved = actor.getFlag(FLAG, "robot") ?? {};
  const data = foundry.utils.mergeObject(
    {
      baseSlots: 1,
      gradeLimit: "commercial",
      chassis: "",
      chassisCatalogId: "",
      ownerActorId: "",
      companionActorId: "",
      modifications: [],
      familiarAbilities: [],
    },
    foundry.utils.deepClone(saved),
    { inplace: false, insertKeys: true, overwrite: true },
  );
  // Старый drag-and-drop обозначал отдельного робота ссылкой на самого себя.
  // Нормализация не удаляет флаги и не переносит пользовательские предметы.
  if (data.companionActorId === actor.id) {
    data.companionActorId = "";
    data.standaloneCompanion = true;
  }
  return data;
}

function validLink(owner, companion) {
  if (!owner || owner.type !== "character" || owner.isOwner === false)
    return false;
  if (!companion) return true;
  if (
    companion.type !== "character" ||
    companion.isOwner === false ||
    companion.id === owner.id
  )
    return false;
  const ownerData = getRobotData(owner);
  const companionData = getRobotData(companion);
  if (ownerData.ownerActorId || companionData.companionActorId) return false;
  return !companionData.ownerActorId || companionData.ownerActorId === owner.id;
}

async function linkActors(owner, companion) {
  if (!validLink(owner, companion)) {
    ui.notifications.warn(t("InvalidActorLink"));
    return false;
  }
  const data = getRobotData(owner);
  const previous = game.actors.get(data.companionActorId);
  if (previous && previous.id !== companion?.id && previous.isOwner === false)
    return false;
  if (
    previous &&
    previous.id !== companion?.id &&
    getRobotData(previous).ownerActorId === owner.id
  ) {
    const old = getRobotData(previous);
    old.ownerActorId = "";
    await previous.setFlag(FLAG, "robot", old);
  }
  data.companionActorId = companion?.id ?? "";
  data.standaloneCompanion = false;
  await owner.setFlag(FLAG, "robot", data);
  if (companion) {
    const companionData = getRobotData(companion);
    companionData.ownerActorId = owner.id;
    companionData.standaloneCompanion = false;
    await companion.setFlag(FLAG, "robot", companionData);
  }
  await syncAutomation(owner);
  return true;
}

async function setRobotData(actor, data) {
  const next = foundry.utils.deepClone(data);
  const current = getRobotData(actor);
  const owner = next.ownerActorId ? game.actors.get(next.ownerActorId) : null;
  const companion = next.companionActorId
    ? game.actors.get(next.companionActorId)
    : null;
  if (next.companionActorId && (!companion || !validLink(actor, companion))) {
    ui.notifications.warn(t("InvalidActorLink"));
    return null;
  }
  if (
    next.ownerActorId &&
    (!owner || next.companionActorId || !validLink(owner, actor))
  ) {
    ui.notifications.warn(t("InvalidActorLink"));
    return null;
  }
  if (next.ownerActorId !== current.ownerActorId) {
    const previousOwner = game.actors.get(current.ownerActorId);
    if (
      previousOwner &&
      getRobotData(previousOwner).companionActorId === actor.id
    ) {
      if (!(await linkActors(previousOwner, null))) return null;
    }
    if (owner && !(await linkActors(owner, actor))) return null;
  }
  if (next.companionActorId !== current.companionActorId) {
    if (!(await linkActors(actor, companion))) return null;
  }
  return actor.setFlag(FLAG, "robot", next);
}
const CHARACTER_CORE_ITEM_TYPES = new Set(["ancestry"]);
const handledCompanionBuildItems = new Map();

function linkedCompanion(actor) {
  const id = getRobotData(actor).companionActorId;
  return id
    ? (game.actors.get(id) ?? null)
    : getRobotData(actor).standaloneCompanion
      ? actor
      : null;
}

/**
 * Происхождение должно находиться на отдельном character-компаньоне:
 * характеристики подготавливаются штатными средствами SF2e, а не на владельце.
 */
function resolveImportTarget(sourceActor, sourceItem, { notify = true } = {}) {
  if (
    sourceItem.flags?.[MODULE_ID]?.familiarAbility ||
    sourceItem.system?.category === "familiar"
  ) {
    if (sourceActor.type === "familiar") return sourceActor;
    const owner = familiarOwner(sourceActor);
    const familiars = owner ? linkedFamiliars(owner) : [];
    if (familiars.length === 1) return familiars[0];
    if (notify) ui.notifications.warn(t("FamiliarNoMaster"));
    return null;
  }
  const data = getRobotData(sourceActor);
  const hasExplicitLink = Boolean(data.companionActorId);
  const companion = linkedCompanion(sourceActor);
  if (hasExplicitLink && !companion) {
    if (notify) ui.notifications.warn(t("CompanionLinkInvalid"));
    return null;
  }

  const isCoreCharacterItem = CHARACTER_CORE_ITEM_TYPES.has(sourceItem.type);
  // Companion Compendia использует character, а не отдельный тип актора companion.
  const target = companion ?? sourceActor;
  if (isCoreCharacterItem && target.type !== "character") {
    if (notify) ui.notifications.warn(t("CompanionActorInvalid"));
    return null;
  }

  if (isCoreCharacterItem) {
    const sameType = target.items.filter(
      (item) => item.type === sourceItem.type,
    );
    if (sameType.length) {
      const sourceSlug = normalizedSlug(slugOf(sourceItem));
      const sameItem = sameType.some(
        (item) =>
          (sourceSlug && normalizedSlug(slugOf(item)) === sourceSlug) ||
          normalizedSlug(item.name) === normalizedSlug(sourceItem.name),
      );
      const message = sameItem
        ? t("AncestryAlreadyAdded")
        : t("ExistingAncestryMustBeRemoved");
      if (notify) ui.notifications.warn(message);
      return null;
    }
  }
  return target;
}

function importActionLabel(sourceActor, sourceItem) {
  const target = resolveImportTarget(sourceActor, sourceItem, {
    notify: false,
  });
  return target && target.id !== sourceActor.id
    ? t("AddToCompanion")
    : t("AddToActor");
}

async function addCompendiumItem(sourceActor, sourceItem) {
  if (game.system.id !== "sf2e" || !dependency()?.active)
    return ui.notifications.error(t("DependencyMissing"));
  if (sourceItem.pack && !isCompatibleItemPack(game.packs.get(sourceItem.pack)))
    return ui.notifications.warn(t("IncompatibleSource"));
  if (!compatibleSourceDocument(sourceItem))
    return ui.notifications.warn(t("IncompatibleSource"));
  const target = resolveImportTarget(sourceActor, sourceItem);
  if (!target) return null;
  const duplicate = target.items.find(
    (item) => sourceItem.uuid && item.flags?.core?.sourceId === sourceItem.uuid,
  );
  if (duplicate) {
    ui.notifications.info(t("AlreadyImported"));
    return { item: duplicate, target };
  }
  const source = sourceItem.toObject();
  delete source._id;
  // Сохраняем UUID: импорт и штатное перетаскивание используют один источник.
  const fromCompanionCompendia = String(sourceItem.uuid ?? "").startsWith(
    `Compendium.${DEPENDENCY_ID}.`,
  );
  if (String(sourceItem.uuid ?? "").startsWith("Compendium.")) {
    source.flags ??= {};
    source.flags.core ??= {};
    source.flags.core.sourceId ??= sourceItem.uuid;
  }
  const [created] = await target.createEmbeddedDocuments("Item", [source]);
  if (
    created &&
    fromCompanionCompendia &&
    CHARACTER_CORE_ITEM_TYPES.has(created.type)
  ) {
    await handleCompanionBuildItem(created);
  }

  if (target.id !== sourceActor.id) {
    ui.notifications.info(`${t("AddedToCompanion")}: ${target.name}`);
  } else {
    ui.notifications.info(t("Added"));
  }
  return { item: created, target };
}

/**
 * Распознаём штатное перетаскивание происхождения из своего или SF2e-пака зависимости.
 * Связи и выбор синхронизируются; характеристики по-прежнему подготавливает система.
 */
async function handleCompanionBuildItem(item) {
  if (!item || !CHARACTER_CORE_ITEM_TYPES.has(item.type)) return;
  const actor = item.parent;
  if (actor?.type !== "character") return;
  const sourceId = String(
    item.flags?.core?.sourceId ?? item._source?.flags?.core?.sourceId ?? "",
  );
  const fromCompanionCompendia = sourceId.startsWith(
    `Compendium.${DEPENDENCY_ID}.`,
  );
  const fromModulePack = sourceId.startsWith(`Compendium.${MODULE_ID}.`);
  if (!fromCompanionCompendia && !fromModulePack) return;
  const generatedKey = String(item.getFlag?.(FLAG, AUTOMATION_FLAG)?.key ?? "");
  if (generatedKey.startsWith(AUTOMATION_PREFIX)) return;

  const key = `${actor.uuid ?? actor.id}:${item.id}`;
  const previousTask = handledCompanionBuildItems.get(key);
  if (previousTask) return previousTask;

  const task = (async () => {
    try {
      const actorData = getRobotData(actor);
      const chassis = await findChassisEntry(slugOf(item), item.name);
      if (chassis) {
        actorData.chassis = chassis.name;
        actorData.chassisCatalogId = chassis.id;
        actorData.chassisSource = chassis.sourceUrl;
        actorData.chassisStats = chassisStatLine(chassis);
        // Только собственное шасси получает метку управления и снимок для замены.
        // Чужое происхождение остаётся пользовательским и не перезаписывается.
        if (fromModulePack) {
          const controllerActorId = actorData.ownerActorId || actor.id;
          await item.setFlag(FLAG, AUTOMATION_FLAG, {
            key: `${AUTOMATION_PREFIX}robot-chassis:${chassis.id}`,
            kind: "robot-chassis",
            catalogId: chassis.id,
            sourceUuid: sourceId,
            sourcePack: `${MODULE_ID}.robot-chassis`,
            controllerActorId,
            fingerprint: itemFingerprint(item.toObject()),
          });
        }
      }
      const owner = actorData.ownerActorId
        ? game.actors.get(actorData.ownerActorId)
        : null;
      if (
        owner?.type === "character" &&
        getRobotData(owner).companionActorId === actor.id
      ) {
        // Выбор виден с обеих сторон связи, без self-link и смешения контроллеров.
        await actor.setFlag(FLAG, "robot", actorData);
        if (chassis) {
          const ownerData = getRobotData(owner);
          ownerData.chassis = chassis.name;
          ownerData.chassisCatalogId = chassis.id;
          ownerData.chassisSource = chassis.sourceUrl;
          ownerData.chassisStats = chassisStatLine(chassis);
          await owner.setFlag(FLAG, "robot", ownerData);
        }
        await syncAutomation(owner);
        return;
      }

      if (!actorData.companionActorId) actorData.standaloneCompanion = true;
      await actor.setFlag(FLAG, "robot", actorData);
      if (
        actorData.standaloneCompanion ||
        actorData.companionActorId === actor.id
      )
        await syncAutomation(actor);
    } catch (error) {
      console.error(
        `${MODULE_ID} | Could not register module/Companion Compendia chassis`,
        error,
      );
    } finally {
      handledCompanionBuildItems.delete(key);
    }
  })();
  handledCompanionBuildItems.set(key, task);
  return task;
}

function parseSlotRules() {
  try {
    const value = String(
      game.settings.get(MODULE_ID, "slotGrantRules") || "{}",
    );
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    console.warn(`${MODULE_ID} | Invalid slotGrantRules JSON`, error);
    return {};
  }
}

function slugOf(item) {
  return item.system?.slug ?? item.system?.identifier ?? item.slug ?? "";
}

function featActorsFor(actor) {
  const candidates = [];
  if (actor.type === "character") candidates.push(actor);
  const linkedId = getRobotData(actor).ownerActorId;
  const linkedActor = linkedId ? game.actors.get(linkedId) : null;
  if (
    linkedActor?.type === "character" &&
    !candidates.some((candidate) => candidate.id === linkedActor.id)
  ) {
    candidates.push(linkedActor);
  }
  return candidates;
}

function grantedSlots(actor) {
  const rules = parseSlotRules();
  let total = 0;
  const seen = new Set();
  for (const sourceActor of featActorsFor(actor)) {
    for (const item of sourceActor.items) {
      const slug = slugOf(item);
      const identity =
        item.flags?.core?.sourceId ||
        item._stats?.compendiumSource ||
        slug ||
        item.uuid ||
        item.id;
      if (seen.has(identity)) continue;
      seen.add(identity);
      // Общий slug customization не доказывает право на дополнительный слот.
      const configured =
        slug === "customization" ? 0 : Number(rules[slug] ?? 0);
      const fromFlag = Number(
        item.getFlag?.(FLAG, "modificationSlots") ??
          item.flags?.[FLAG]?.modificationSlots ??
          0,
      );
      const raw = Number.isFinite(configured) ? configured : 0;
      const flag = Number.isFinite(fromFlag) ? fromFlag : 0;
      total += Math.max(0, Math.floor(raw), Math.floor(flag));
    }
  }
  return total;
}

function robotSummary(actor) {
  const data = getRobotData(actor);
  const bonus = grantedSlots(actor);
  const used = (data.modifications ?? []).reduce(
    (sum, mod) => sum + Math.max(1, Number(mod.cost) || 1),
    0,
  );
  const generalTotal = Math.max(0, Number(data.baseSlots) || 0) + bonus;
  const commercialSlots = droneCommercialSlots(actor);
  const capacity = customizationCapacity(
    data.modifications,
    generalTotal,
    commercialSlots,
  );
  return {
    data,
    bonus,
    used,
    generalTotal,
    commercialSlots,
    total: generalTotal + commercialSlots,
    free: capacity.free,
  };
}

function packLabel(key) {
  const pack = PACKS.find((entry) => entry.key === key);
  return pack ? t(pack.label) : key;
}

async function openHome(actor = activeActor()) {
  if (actor?.type === "familiar") return openFamiliarManager(actor);
  if (game.system.id !== "sf2e")
    return ui.notifications.error(t("SystemMismatch"));
  if (!actor) return ui.notifications.warn(t("ActorMissing"));
  const assignedOwner = game.actors.get(getRobotData(actor).ownerActorId);
  if (
    assignedOwner &&
    assignedOwner.id !== actor.id &&
    getRobotData(assignedOwner).companionActorId === actor.id
  )
    return openHome(assignedOwner);
  const companionCompendiaAvailable = Boolean(dependency()?.active);
  if (!companionCompendiaAvailable) {
    ui.notifications.error(t("DependencyMissing"));
    return;
  }
  const missingPacks = missingCompanionPacks();
  const summary = robotSummary(actor);
  const chassisEntry = summary.data.chassisCatalogId
    ? await findChassisEntry(summary.data.chassisCatalogId)
    : null;
  const sizes = chassisEntry ? allowedSizes(chassisEntry) : [];
  const configuration =
    chassisEntry?.id === "imitator-chassis"
      ? `<button type="button" data-configure-imitation>${esc(t("ConfigureImitation"))}</button><p class="hint">${esc(summary.data.imitation?.sourceName ?? t("ImitationNotConfigured"))}</p>`
      : sizes.length > 1
        ? `<label>${esc(t("ChooseSize"))} <select name="sfmtp-chassis-size">${sizes.map((size) => `<option value="${size}" ${(summary.data.chassisSizes?.[chassisEntry.id] ?? "med") === size ? "selected" : ""}>${esc(t(`Size.${size}`))}</option>`).join("")}</select></label>`
        : "";
  const actions = (linkedCompanion(actor)?.items ?? []).filter(
    (item) => item.type === "action" && item.flags?.[FLAG]?.moduleProvided,
  );
  const packButtons = PACKS.map((p) => {
    const available = isCompatibleItemPack(game.packs.get(packId(p.key)));
    return `<button type="button" class="sfmtp-pack" data-pack="${esc(p.key)}" ${available ? "" : "disabled"}><i class="fas fa-folder-open"></i> ${esc(packLabel(p.key))}</button>`;
  }).join("");
  const content = `<div class="sfmtp-home">
    <p>${esc(actor.name)} — ${esc(missingPacks.length ? t("CompendiaPacksMissing") : t("UsesCompendia"))}</p>
    ${isMechanic(actor) ? `<button type="button" data-open-exocortex>${esc(t("ExoTitle"))}</button>` : ""}
    <h3>${esc(t("Packs"))}</h3><div class="sfmtp-pack-grid">${packButtons}</div>
    <hr><h3>${esc(t("RobotTools"))}</h3>
    <div class="sfmtp-action-row"><button type="button" data-open-catalog="robot-customizations">${esc(t("RobotCatalog"))}</button><button type="button" data-open-catalog="robot-chassis">${esc(t("ChassisCatalog"))}</button><button type="button" data-open-catalog="familiar-abilities">${esc(t("FamiliarCatalog"))}</button><button type="button" data-search-familiar>${esc(t("FamiliarSearch"))}</button></div>
    <p>${esc(t("CurrentChassis"))}: <strong>${esc(summary.data.chassis || "—")}</strong></p>${summary.data.chassisCatalogId ? `<p class="hint">${esc(t("ChassisStats"))}: ${esc(summary.data.chassisStats || chassisStatLineById(summary.data.chassisCatalogId))}</p>` : ""}
    ${configuration}
    <div class="sfmtp-action-row">${actions.map((item) => `<button type="button" data-action-chat="${esc(item.id)}">${esc(t("SendToChat"))}: ${esc(item.name)}</button>`).join("")}</div>
    <div class="form-group"><label>${esc(t("OwnerActor"))}</label><select name="sfmtp-owner"><option value="">—</option>${game.actors.contents
      .filter((a) => a.type === "character" && a.id !== actor.id)
      .map(
        (a) =>
          `<option value="${esc(a.id)}" ${summary.data.ownerActorId === a.id ? "selected" : ""}>${esc(a.name)}</option>`,
      )
      .join("")}</select></div>
    <div class="form-group"><label>${esc(t("CompanionActor"))}</label><select name="sfmtp-companion-actor"><option value="">—</option>${game.actors.contents
      .filter((a) => a.type === "character")
      .map(
        (a) =>
          `<option value="${esc(a.id)}" ${summary.data.companionActorId === a.id ? "selected" : ""}>${esc(a.name)}${a.id === actor.id ? ` (${esc(t("CurrentActor"))})` : ""}</option>`,
      )
      .join(
        "",
      )}</select><p class="hint">${esc(t("CompanionActorHint"))}</p></div>
    <div class="sfmtp-action-row"><button type="button" data-sync-automation>${esc(t("ApplyAutomation"))}</button><span class="hint">${esc(t("AutomationHint"))}</span></div>
    <p>${esc(t("BaseSlots"))}: <strong>${summary.data.baseSlots}</strong> · ${esc(t("ExtraSlots"))}: <strong>${summary.bonus}</strong> · ${esc(t("UsedSlots"))}: <strong>${summary.used}/${summary.total}</strong></p>
    ${summary.commercialSlots ? `<p class="hint">${esc(t("ExoDroneSlots"))}</p>` : ""}
    <div class="form-group"><label>${esc(t("BaseSlots"))}</label><input name="sfmtp-base-slots" type="number" min="0" value="${esc(summary.data.baseSlots)}"></div>
    <div class="form-group"><label>${esc(t("GradeLimit"))}</label><select name="sfmtp-grade-limit">${["commercial", "tactical", "advanced", "superior"].map((g) => `<option value="${g}" ${summary.data.gradeLimit === g ? "selected" : ""}>${esc(t(`Grade.${g}`))}</option>`).join("")}</select></div>
    <div class="sfmtp-mod-list">${summary.data.modifications.map((m, i) => `<div class="sfmtp-mod-row"><span>${esc(m.name)} <small>(${esc(m.grade ? t(`Grade.${m.grade}`) : t("ManualEntry"))}; ${esc(m.cost || 1)} ${esc(t("SlotsUnit"))})</small></span><button type="button" data-remove-mod="${i}">${esc(t("Remove"))}</button></div>`).join("") || `<p>${esc(t("NoEntries"))}</p>`}</div>
    <div class="form-group"><label>${esc(t("ModificationName"))}</label><input name="sfmtp-mod-name" type="text"></div>
    <div class="form-group"><label>${esc(t("Source"))}</label><input name="sfmtp-mod-source" type="text"></div>
    <button type="button" data-add-mod><i class="fas fa-plus"></i> ${esc(t("AddModification"))}</button>
    <hr><h3>${esc(t("FamiliarAbilitiesChosen"))}</h3>
    <div class="sfmtp-mod-list">${summary.data.familiarAbilities.map((a, i) => `<div class="sfmtp-mod-row"><span>${esc(a.name)} <small>(${esc(t(`Category.${a.category}`) || a.category)})</small></span><button type="button" data-remove-familiar="${i}">${esc(t("Remove"))}</button></div>`).join("") || `<p>${esc(t("NoEntries"))}</p>`}</div>
    <hr><p class="hint">${esc(t("SlotConfigHint"))}</p>
    <p class="hint">${esc(t("ImportWarning"))}</p>
  </div>`;

  new Dialog(
    {
      title: t("Title"),
      content,
      buttons: { close: { label: t("Close") } },
      render: (html) => {
        html.find(".sfmtp-pack").on("click", (event) => {
          const key = event.currentTarget.dataset.pack;
          openPackBrowser(packId(key), actor);
        });
        html
          .find("[data-open-catalog]")
          .on("click", (event) =>
            openCuratedCatalog(actor, event.currentTarget.dataset.openCatalog),
          );
        html
          .find("[data-search-familiar]")
          .on("click", () => searchFamiliarItems(actor, "familiar"));
        html
          .find("[data-configure-imitation]")
          .on("click", () => openImitationConfig(actor));
        html.find("[name='sfmtp-chassis-size']").on("change", async (event) => {
          const data = getRobotData(actor);
          data.chassisSizes ??= {};
          data.chassisSizes[chassisEntry.id] = event.currentTarget.value;
          await actor.setFlag(FLAG, "robot", data);
          await syncAutomation(actor);
        });
        html.on("click", "[data-action-chat]", async (event) => {
          const item = linkedCompanion(actor)?.items.get(
            event.currentTarget.dataset.actionChat,
          );
          if (item) await item.toMessage();
        });
        html.find("[name='sfmtp-owner']").on("change", async (event) => {
          const owner = game.actors.get(String(event.currentTarget.value));
          if (owner) {
            await linkActors(owner, actor);
            await openHome(actor);
            return;
          }
          const current = getRobotData(actor);
          current.ownerActorId = "";
          if (!(await setRobotData(actor, current))) return;
          await syncAutomation(actor);
          openHome(actor);
        });
        html
          .find("[name='sfmtp-companion-actor']")
          .on("change", async (event) => {
            const nextId = String(event.currentTarget.value || "");
            const next = nextId ? game.actors.get(nextId) : null;
            if (nextId && !next)
              return ui.notifications.warn(t("InvalidActorLink"));
            if (!(await linkActors(actor, next))) return;
            openHome(actor);
          });
        html.find("[data-sync-automation]").on("click", async () => {
          const result = await syncAutomation(actor);
          if (result)
            ui.notifications.info(
              `${t("AutomationApplied")}: ${result.applied}; ${t("AutomationSkipped")}: ${result.skipped}`,
            );
          openHome(actor);
        });
        html.find("[name='sfmtp-grade-limit']").on("change", async (event) => {
          const current = getRobotData(actor);
          current.gradeLimit = String(
            event.currentTarget.value || "commercial",
          );
          await actor.setFlag(FLAG, "robot", current);
          await syncAutomation(actor);
          openHome(actor);
        });
        html.on("click", "[data-open-exocortex]", () =>
          openExocortexManager(actor, { openTechPets: openHome }),
        );
        html.on("click", "[data-remove-familiar]", async (event) => {
          const index = Number(event.currentTarget.dataset.removeFamiliar);
          const current = getRobotData(actor);
          current.familiarAbilities.splice(index, 1);
          await actor.setFlag(FLAG, "robot", current);
          await syncAutomation(actor);
          openHome(actor);
        });
        html.find("[data-add-mod]").on("click", async () => {
          const name = String(
            html.find('[name="sfmtp-mod-name"]').val() ?? "",
          ).trim();
          const source = String(
            html.find('[name="sfmtp-mod-source"]').val() ?? "",
          ).trim();
          if (!name) return ui.notifications.warn(t("ModificationName"));
          const current = getRobotData(actor);
          const candidate = { manual: true, cost: 1 };
          const summary = robotSummary(actor);
          if (
            !customizationCapacity(
              [...current.modifications, candidate],
              summary.generalTotal,
              summary.commercialSlots,
            ).accepted.includes(candidate)
          )
            return ui.notifications.warn(t("NoSlots"));
          current.modifications.push({
            id: foundry.utils.randomID(),
            name,
            source,
            cost: 1,
            createdAt: Date.now(),
            manual: true,
          });
          await actor.setFlag(FLAG, "robot", current);
          await syncAutomation(actor);
          ui.notifications.info(t("Added"));
          openHome(actor);
        });
        html.find("[name='sfmtp-base-slots']").on("change", async (event) => {
          const value = Math.max(
            0,
            Math.floor(Number(event.currentTarget.value) || 0),
          );
          const current = getRobotData(actor);
          current.baseSlots = value;
          await actor.setFlag(FLAG, "robot", current);
          openHome(actor);
        });
        html.find("[data-remove-mod]").on("click", async (event) => {
          const index = Number(event.currentTarget.dataset.removeMod);
          const current = getRobotData(actor);
          current.modifications.splice(index, 1);
          await actor.setFlag(FLAG, "robot", current);
          await syncAutomation(actor);
          openHome(actor);
        });
      },
    },
    { width: 720, height: "auto", resizable: true },
  ).render(true);
}

async function openImitationConfig(actor) {
  const candidates = [];
  const collections = [
    "sf2e.ancestries",
    `${DEPENDENCY_ID}.sf-AC-Ancestries-and-Class`,
  ];
  for (const collection of collections) {
    const pack = game.packs.get(collection);
    if (!isCompatibleItemPack(pack)) continue;
    try {
      const index = await pack.getIndex({
        fields: ["type", "system.traits.value"],
      });
      for (const entry of index)
        if (entry.type === "ancestry") {
          const traits = entry.system?.traits?.value ?? [];
          if (traits.some((trait) => ["construct", "undead"].includes(trait)))
            continue;
          if (
            collection.startsWith(DEPENDENCY_ID) &&
            !traits.includes("animal")
          )
            continue;
          candidates.push({ pack, entry });
        }
    } catch (error) {
      console.warn(
        `${MODULE_ID} | Не загружен список для имитации: ${collection}`,
        error,
      );
    }
  }
  candidates.sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  const draw = (term) =>
    candidates
      .map((candidate, index) => ({ ...candidate, index }))
      .filter(({ entry }) =>
        entry.name.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
      )
      .map(
        ({ entry, index }) =>
          `<button type="button" data-imitation-index="${index}">${esc(entry.name)}</button>`,
      )
      .join("");
  new Dialog(
    {
      title: t("ConfigureImitation"),
      content: `<div><p>${esc(t("ImitationSourceHint"))}</p><input type="search" name="imitation-search" placeholder="${esc(t("Search"))}"><div class="sfmtp-entry-list">${draw("") || esc(t("NoEntries"))}</div></div>`,
      buttons: { close: { label: t("Close") } },
      render: (html) => {
        html
          .find("[name='imitation-search']")
          .on("input", (event) =>
            html
              .find(".sfmtp-entry-list")
              .html(draw(event.currentTarget.value)),
          );
        html.on("click", "[data-imitation-index]", async (event) => {
          const candidate =
            candidates[Number(event.currentTarget.dataset.imitationIndex)];
          if (!candidate) return;
          const document = await candidate.pack.getDocument(
            candidate.entry._id,
          );
          if (!document || !compatibleSourceDocument(document))
            return ui.notifications.warn(t("IncompatibleSource"));
          const profile = imitationOptions(document.toObject());
          if (!profile) return ui.notifications.warn(t("ImitationUnsupported"));
          new Dialog(
            {
              title: `${t("ConfigureImitation")} — ${document.name}`,
              content: `<div><p>${esc(t("ImitationConfirmHint"))}</p><p>${esc(t("ChooseSize"))}: ${esc(t(`Size.${profile.size}`))}</p><p>${esc(t("StatSpeed"))}: ${esc(
                Object.entries(profile.speeds)
                  .map(([kind, value]) => `${kind}: ${value} ft`)
                  .join(", "),
              )}</p><label>${esc(t("ImitatedAttack"))}<select name="imitation-attack">${profile.attacks.map((attack, index) => `<option value="${index}">${esc(game.i18n.localize(attack.name))} · 1d4 ${esc(attack.damageType)}</option>`).join("")}</select></label></div>`,
              buttons: {
                save: {
                  label: t("Save"),
                  callback: async (form) => {
                    const attack =
                      profile.attacks[
                        Number(form.find("[name='imitation-attack']").val())
                      ];
                    if (!attack) return;
                    const data = getRobotData(actor);
                    data.imitation = {
                      sourceUuid: document.uuid,
                      sourceName: document.name,
                      sourceSlug: slugOf(document),
                      size: profile.size,
                      speeds: profile.speeds,
                      attack,
                    };
                    await actor.setFlag(FLAG, "robot", data);
                    await syncAutomation(actor);
                    await openHome(actor);
                  },
                },
                close: { label: t("Close") },
              },
            },
            { width: 580 },
          ).render(true);
        });
      },
    },
    { width: 620, height: 600 },
  ).render(true);
}

const CATALOG_CACHE = new Map();
const GRADE_ORDER = { commercial: 0, tactical: 1, advanced: 2, superior: 3 };
async function loadCatalog(filename) {
  if (CATALOG_CACHE.has(filename)) return CATALOG_CACHE.get(filename);
  const modulePath =
    game.modules.get(MODULE_ID)?.path ?? `modules/${MODULE_ID}`;
  const response = await fetch(`${modulePath}/data/${filename}`);
  if (!response.ok)
    throw new Error(`Could not load ${filename} (${response.status})`);
  const data = await response.json();
  CATALOG_CACHE.set(filename, data);
  return data;
}
function formatAbilityModifiers(abilities = {}) {
  return Object.entries(abilities)
    .map(
      ([ability, modifier]) =>
        `${ability.toUpperCase()} ${Number(modifier) >= 0 ? "+" : ""}${modifier}`,
    )
    .join(", ");
}
function chassisStatLine(entry) {
  if (!entry) return "";
  const attacks = (entry.attacks ?? [])
    .map(
      (attack) =>
        `${attack.name} ${attack.damage}${attack.range ? ` (${attack.range})` : ""}`,
    )
    .join("; ");
  const speeds =
    Object.entries(entry.speeds ?? {})
      .map(([kind, speed]) => `${kind} ${speed} ft`)
      .join(", ") || "variable";
  const labels = {
    size: t("StatSize"),
    hp: t("StatHP"),
    speed: t("StatSpeed"),
    skills: t("StatSkills"),
    senses: t("StatSenses"),
    advanced: t("StatAdvanced"),
  };
  const skills = (entry.skills ?? []).join(", ");
  const senses = (entry.senses ?? []).join(", ");
  return `${labels.size}: ${entry.size}; ${labels.hp}: ${entry.hp}; ${formatAbilityModifiers(entry.abilities)}; ${labels.speed}: ${speeds}; ${attacks}; ${labels.skills}: ${skills}; ${labels.senses}: ${senses}; ${labels.advanced}: ${entry.advancedManeuver ?? "—"}`;
}
async function findChassisEntry(...values) {
  try {
    const catalog = await loadCatalog("robot-chassis.json");
    const wanted = new Set(values.map(normalizedSlug).filter(Boolean));
    return (
      catalog.entries.find(
        (entry) =>
          wanted.has(normalizedSlug(entry.id)) ||
          wanted.has(normalizedSlug(entry.name)),
      ) ?? null
    );
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not load chassis catalog`, error);
    return null;
  }
}
function chassisStatLineById(id) {
  const entry = CATALOG_CACHE.get("robot-chassis.json")?.entries?.find(
    (item) => item.id === id,
  );
  return entry ? chassisStatLine(entry) : id;
}

async function openCuratedCatalog(actor, catalogType, query = "") {
  if (catalogType === "familiar-abilities") return openFamiliarManager(actor);
  if (!actor) return ui.notifications.warn(t("ActorMissing"));
  const config = {
    "robot-customizations": {
      file: "robot-customizations.json",
      title: t("RobotCatalog"),
      type: "robot",
    },
    "robot-chassis": {
      file: "robot-chassis.json",
      title: t("ChassisCatalog"),
      type: "chassis",
    },
    "familiar-abilities": {
      file: "familiar-abilities.json",
      title: t("FamiliarCatalog"),
      type: "familiar",
    },
  }[catalogType];
  if (!config) return;
  let catalog;
  try {
    catalog = await loadCatalog(config.file);
  } catch (error) {
    console.error(`${MODULE_ID} | Catalog load failed`, error);
    ui.notifications.error(t("NoEntries"));
    return;
  }
  const draw = (term) => {
    const needle = String(term ?? "")
      .toLocaleLowerCase()
      .trim();
    let entries = catalog.entries.filter((entry) =>
      `${entry.name} ${entry.grade ?? ""} ${entry.category ?? ""}`
        .toLocaleLowerCase()
        .includes(needle),
    );
    if (config.type === "robot") {
      const limit = GRADE_ORDER[getRobotData(actor).gradeLimit] ?? 0;
      entries = entries.filter(
        (entry) => (GRADE_ORDER[entry.grade] ?? 0) <= limit,
      );
    }
    const visible = entries.slice(0, 100);
    const rows = visible
      .map((entry) => {
        const detail =
          config.type === "chassis"
            ? chassisStatLine(entry)
            : `${entry.grade ? t(`Grade.${entry.grade}`) : t(`Category.${entry.category}`) || entry.category || ""}${entry.repeatable ? ` · ${t("Repeatable")}` : ""}`;
        const extra =
          config.type === "chassis"
            ? `${entry.special ? `<small>${esc(entry.special)}</small>` : ""}<small>${esc(entry.supportBenefit ?? "")}</small><small>${esc(entry.rulesNote ?? "")}</small>`
            : "";
        return `<div class="sfmtp-catalog-row"><div><strong>${esc(entry.name)}</strong><small>${esc(detail)}</small>${extra}</div><div><button type="button" data-source-index="${esc(entry.id)}">${esc(t("SourcePage"))}</button><button type="button" data-select-index="${esc(entry.id)}">${esc(t("AddSelection"))}</button></div></div>`;
      })
      .join("");
    return rows || `<p>${esc(t("NoEntries"))}</p>`;
  };
  const content = `<div class="sfmtp-catalog"><input type="search" name="sfmtp-catalog-query" placeholder="${esc(t("Search"))}" value="${esc(query)}"><div class="sfmtp-catalog-list">${draw(query)}</div><p class="hint">${esc(catalog.note ?? "")}</p></div>`;
  new Dialog(
    {
      title: config.title,
      content,
      buttons: {
        back: { label: t("Back"), callback: () => openHome(actor) },
        close: { label: t("Close") },
      },
      render: (html) => {
        const redraw = () =>
          html
            .find(".sfmtp-catalog-list")
            .html(
              draw(
                String(html.find('[name="sfmtp-catalog-query"]').val() ?? ""),
              ),
            );
        html.find('[name="sfmtp-catalog-query"]').on("input", redraw);
        html.on("click", "[data-source-index]", (event) => {
          const id = event.currentTarget.dataset.sourceIndex;
          const entry = catalog.entries.find((item) => item.id === id);
          if (entry?.sourceUrl)
            window.open(entry.sourceUrl, "_blank", "noopener");
        });
        html.on("click", "[data-select-index]", async (event) => {
          const id = event.currentTarget.dataset.selectIndex;
          const entry = catalog.entries.find((item) => item.id === id);
          if (!entry) return;
          const data = getRobotData(actor);
          if (config.type === "robot") {
            const summary = robotSummary(actor);
            const candidate = { ...entry, catalogId: entry.id };
            if (
              !customizationCapacity(
                [...data.modifications, candidate],
                summary.generalTotal,
                summary.commercialSlots,
              ).accepted.includes(candidate)
            )
              return ui.notifications.warn(t("NoSlots"));
            if (
              !entry.repeatable &&
              data.modifications.some((mod) => mod.catalogId === entry.id)
            ) {
              return ui.notifications.warn(t("CustomizationAlreadySelected"));
            }
            data.modifications.push({
              id: foundry.utils.randomID(),
              name: entry.name,
              grade: entry.grade,
              source: entry.sourceUrl,
              cost: Math.max(1, Number(entry.cost) || 1),
              catalogId: entry.id,
            });
            await actor.setFlag(FLAG, "robot", data);
            await syncAutomation(actor);
            ui.notifications.info(t("CustomizationAdded"));
          } else if (config.type === "familiar") {
            if (
              !entry.repeatable &&
              data.familiarAbilities.some(
                (ability) => ability.catalogId === entry.id,
              )
            )
              return ui.notifications.warn(t("AlreadyImported"));
            data.familiarAbilities.push({
              id: foundry.utils.randomID(),
              name: entry.name,
              category: entry.category,
              source: entry.sourceUrl,
              catalogId: entry.id,
            });
            await actor.setFlag(FLAG, "robot", data);
            await syncAutomation(actor);
            ui.notifications.info(t("AbilityAdded"));
          } else if (config.type === "chassis") {
            data.chassis = entry.name;
            data.chassisCatalogId = entry.id;
            data.chassisSource = entry.sourceUrl;
            data.chassisStats = chassisStatLine(entry);
            await actor.setFlag(FLAG, "robot", data);
            await syncAutomation(actor);
            ui.notifications.info(t("ChassisSelected"));
          }
          openHome(actor);
        });
      },
    },
    { width: 760, height: 700, resizable: true },
  ).render(true);
}

/**
 * Шасси и действия поставляются собственными SF2e-паками с локальным резервным источником.
 * Кастомизации и способности требуют подходящих исходных Items: эффекты не выдумываются.
 */
const AUTOMATION_FLAG = "automationSource";
const AUTOMATION_PREFIX = "sfmtp-generated:";
function normalizedSlug(value) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
async function findSourceItem({
  catalogId = "",
  name = "",
  aliases = [],
  expectedType = "",
} = {}) {
  const wanted = new Set(
    [catalogId, name, ...aliases].map(normalizedSlug).filter(Boolean),
  );
  const packs = [...game.packs].filter(isCompatibleItemPack);
  packs.sort((a, b) => {
    const rank = (pack) => {
      const id = String(pack.collection ?? "");
      if (/\.sf-AC-/i.test(id) || /sf2e|starfinder/i.test(id)) return 0;
      if (/pf2e-animal-companions/i.test(id)) return 1;
      return 2;
    };
    return (
      rank(a) - rank(b) ||
      String(a.collection).localeCompare(String(b.collection))
    );
  });
  const indexed = [];
  for (const pack of packs) {
    let index;
    try {
      index = await pack.getIndex({
        fields: ["type", "system.slug", "system.identifier"],
      });
    } catch {
      continue;
    }
    indexed.push({ pack, index });
  }
  // Имя используется только после поиска точного slug во всех разрешённых паках.
  for (const bySlug of [true, false])
    for (const { pack, index } of indexed) {
      const matches = index.filter((entry) => {
        if (expectedType && !expectedType.split("|").includes(entry.type))
          return false;
        const slug = normalizedSlug(
          entry.system?.slug ?? entry.system?.identifier ?? "",
        );
        return bySlug
          ? wanted.has(slug)
          : wanted.has(normalizedSlug(entry.name));
      });
      const exact = matches.length === 1 ? matches[0] : null;
      if (!exact) continue;
      try {
        const document = await pack.getDocument(exact._id);
        if (document && compatibleSourceDocument(document))
          return { document, pack: pack.collection };
      } catch (error) {
        console.debug(
          `${MODULE_ID} | Could not load ${pack.collection}.${exact._id}`,
          error,
        );
      }
    }
  return null;
}
function sourceForSelection(selection, kind) {
  const catalogId = selection.catalogId ?? normalizedSlug(selection.name);
  return {
    key: `${kind}:${selection.id ?? catalogId}`,
    catalogId,
    name: selection.name,
    aliases: selection.aliases ?? [],
    expectedType: selection.expectedType ?? "feat|action|effect",
    kind,
  };
}

function compatibleSourceDocument(document) {
  if (document._stats?.systemId && document._stats.systemId !== "sf2e")
    return false;
  return (document.system?.rules ?? []).every((rule) => {
    if (JSON.stringify(rule).includes("Compendium.pf2e.")) return false;
    const registered = game.pf2e?.RuleElements?.all;
    return !registered || Boolean(registered[rule.key]);
  });
}

/**
 * Резервная генерация из каталога при недоступном собственном паке.
 * Это не режим работы без обязательной зависимости Companion Compendia.
 */
function buildModuleChassisSource(entry) {
  return createChassisSource(entry);
}

async function moduleChassisSource(selection) {
  const entry = await findChassisEntry(
    selection.catalogId,
    selection.name,
    ...(selection.aliases ?? []),
  );
  if (!entry) return null;
  // Не создаём частично работающее шасси без базового класса компаньона.
  const [classCollection, classId] = COMPANION_CLASS_UUID.replace(
    "Compendium.",
    "",
  ).split(".Item.");
  try {
    const companionClass = await game.packs
      .get(classCollection)
      ?.getDocument(classId);
    if (
      companionClass?.type !== "class" ||
      !compatibleSourceDocument(companionClass)
    ) {
      ui.notifications.warn(t("CompanionClassMissing"));
      return null;
    }
  } catch {
    ui.notifications.warn(t("CompanionClassMissing"));
    return null;
  }

  // Основной источник — встроенный модульный Compendium Pack, как в Companion Compendia.
  // Локальная генерация оставлена как безопасный fallback на случай миграции/повреждения pack.
  const packId = `${MODULE_ID}.robot-chassis`;
  const pack =
    game.packs?.get?.(packId) ??
    [...game.packs].find(
      (candidate) =>
        candidate.metadata?.packageName === MODULE_ID &&
        candidate.metadata?.name === "robot-chassis",
    );
  if (pack) {
    try {
      const index = await pack.getIndex({ fields: ["type", "system.slug"] });
      const match = index.find(
        (document) =>
          document.type === "ancestry" &&
          normalizedSlug(document.system?.slug ?? document.name) ===
            normalizedSlug(entry.id),
      );
      if (match) {
        const document = await pack.getDocument(match._id);
        if (document) {
          const source = document.toObject();
          delete source._id;
          delete source.folder;
          delete source.sort;
          return { source, uuid: document.uuid, pack: pack.collection, entry };
        }
      }
      console.warn(
        `${MODULE_ID} | Built-in chassis pack is available but contains no item for ${entry.id}; using embedded module data.`,
      );
    } catch (error) {
      console.warn(
        `${MODULE_ID} | Could not read built-in chassis pack; using embedded module data.`,
        error,
      );
    }
  }
  const localSource = await loadOwnItemSource("robot-chassis", entry.id);
  return {
    source: localSource ?? buildModuleChassisSource(entry),
    uuid: localSource ? `Compendium.${packId}.Item.${localSource._id}` : "",
    pack: packId,
    entry,
  };
}

/**
 * Возвращает нативный Action из собственного пакета Advanced Maneuvers.
 * Резервный источник сохраняет работу автоматизации, если пак пока не читается.
 */
async function moduleManeuverSource(selection) {
  const entry = await findChassisEntry(selection.chassisCatalogId ?? "");
  if (!entry?.advancedManeuverId) return null;
  const packId = `${MODULE_ID}.robot-advanced-maneuvers`;
  const pack =
    game.packs?.get?.(packId) ??
    [...game.packs].find(
      (candidate) =>
        candidate.metadata?.packageName === MODULE_ID &&
        candidate.metadata?.name === "robot-advanced-maneuvers",
    );
  if (pack) {
    try {
      const index = await pack.getIndex({ fields: ["type", "system.slug"] });
      const match = index.find(
        (document) =>
          document.type === "action" &&
          normalizedSlug(document.system?.slug ?? document.name) ===
            normalizedSlug(entry.advancedManeuverId),
      );
      if (match) {
        const document = await pack.getDocument(match._id);
        if (document) {
          const source = document.toObject();
          delete source._id;
          delete source.folder;
          delete source.sort;
          return { source, uuid: document.uuid, pack: pack.collection, entry };
        }
      }
      console.warn(
        `${MODULE_ID} | Built-in maneuver pack lacks ${entry.advancedManeuverId}; using embedded module data.`,
      );
    } catch (error) {
      console.warn(
        `${MODULE_ID} | Could not read built-in maneuver pack; using embedded module data.`,
        error,
      );
    }
  }
  const localSource = await loadOwnItemSource(
    "robot-advanced-maneuvers",
    entry.advancedManeuverId,
  );
  return {
    source: localSource ?? buildModuleManeuverSource(entry),
    uuid: localSource ? `Compendium.${packId}.Item.${localSource._id}` : "",
    pack: packId,
    entry,
  };
}

function buildModuleManeuverSource(entry) {
  return createManeuverSource(entry);
}

// Снимок сравнивает исходные поля предмета, а не подготовленные данные SF2e.
// Системные ссылки GrantItem и служебные флаги не считаются ручным изменением.
function itemFingerprint(source) {
  const system = foundry.utils.deepClone(source.system ?? {});
  delete system._migration;
  const value = {
    name: source.name,
    type: source.type,
    img: source.img,
    system,
    effects: source.effects ?? [],
    choices: source.flags?.sf2e?.rulesSelections ?? {},
  };
  const stable = (entry) =>
    Array.isArray(entry)
      ? entry.map(stable)
      : entry && typeof entry === "object"
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [key, stable(entry[key])]),
          )
        : entry;
  return JSON.stringify(stable(value));
}

function canReplaceManagedItem(item) {
  const metadata = item.getFlag?.(FLAG, AUTOMATION_FLAG);
  // У старых предметов снимка нет: без доказательства не перезаписываем старый предмет.
  return Boolean(
    metadata?.fingerprint &&
    metadata.fingerprint === itemFingerprint(item.toObject()),
  );
}

async function stampManagedItems(items = []) {
  for (const item of items) {
    const metadata = item.getFlag?.(FLAG, AUTOMATION_FLAG);
    if (!metadata) continue;
    await item.setFlag(FLAG, AUTOMATION_FLAG, {
      ...metadata,
      fingerprint: itemFingerprint(item.toObject()),
    });
  }
}

async function moduleSupportSource(selection) {
  const entry = await findChassisEntry(selection.chassisCatalogId);
  if (!entry) return null;
  const collection = `${MODULE_ID}.robot-support`;
  const pack = game.packs.get(collection);
  try {
    const index = await pack?.getIndex({ fields: ["type", "system.slug"] });
    const match = index?.find(
      (item) =>
        item.type === "action" && item.system?.slug === selection.catalogId,
    );
    if (match) {
      const document = await pack.getDocument(match._id);
      if (document)
        return { document, uuid: document.uuid, pack: collection, entry };
    }
  } catch (error) {
    console.warn(
      `${MODULE_ID} | Не удалось загрузить действие поддержки`,
      error,
    );
  }
  const source = await loadOwnItemSource("robot-support", selection.catalogId);
  return source
    ? {
        source,
        uuid: `Compendium.${collection}.Item.${source._id}`,
        pack: collection,
        entry,
      }
    : null;
}

async function loadOwnItemSource(pack, slug) {
  try {
    const response = await fetch(
      `${game.modules.get(MODULE_ID)?.path ?? `modules/${MODULE_ID}`}/packs/src/${pack}/${slug}.json`,
    );
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function generatedItemsForController(
  actor,
  controllerActorId,
  { allowLegacy = false } = {},
) {
  return actor.items.filter((item) => {
    const metadata = item.getFlag?.(FLAG, AUTOMATION_FLAG);
    if (!String(metadata?.key ?? "").startsWith(AUTOMATION_PREFIX))
      return false;
    // В старых записях не было controllerActorId. Старые копии распознаются только при
    // подтверждённом lastAutomationSync; отсутствие снимка запрещает удаление.
    return metadata.controllerActorId
      ? metadata.controllerActorId === controllerActorId
      : allowLegacy;
  });
}
async function cleanupPreviousCompanion(ownerActor, nextCompanionId) {
  const last = ownerActor.getFlag(FLAG, "lastAutomationSync");
  const previousId = last?.companionActorId;
  if (!previousId || previousId === nextCompanionId) return;
  const previous = game.actors.get(previousId);
  if (!previous) return;
  const oldItems = generatedItemsForController(previous, ownerActor.id, {
    allowLegacy: last?.companionActorId === previous.id,
  });
  const safeItems = oldItems.filter(canReplaceManagedItem);
  if (safeItems.length)
    await previous.deleteEmbeddedDocuments(
      "Item",
      safeItems.map((item) => item.id),
    );
  if (safeItems.length !== oldItems.length)
    ui.notifications.warn(t("ProtectedItems"));
}

const SYNC_TASKS = new Map();
function syncAutomation(ownerActor) {
  const key = linkedCompanion(ownerActor)?.id ?? ownerActor.id;
  const previous = SYNC_TASKS.get(key) ?? Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(() => syncAutomationNow(ownerActor));
  SYNC_TASKS.set(key, task);
  void task
    .finally(() => {
      if (SYNC_TASKS.get(key) === task) SYNC_TASKS.delete(key);
    })
    .catch(() => {});
  return task;
}
async function syncAutomationNow(ownerActor) {
  if (game.system.id !== "sf2e" || !dependency()?.active) {
    ui.notifications.error(t("DependencyMissing"));
    return { applied: 0, skipped: 0, reason: "dependency-unavailable" };
  }
  const data = getRobotData(ownerActor);
  const companion = linkedCompanion(ownerActor);
  if (
    companion &&
    companion.id !== ownerActor.id &&
    companion.type === "character" &&
    !validLink(ownerActor, companion)
  ) {
    ui.notifications.warn(t("InvalidActorLink"));
    await ownerActor.setFlag(FLAG, "lastAutomationSync", {
      companionActorId: companion.id,
      applied: 0,
      skipped: 1,
      reason: "invalid-owner-link",
      timestamp: Date.now(),
    });
    return { applied: 0, skipped: 1, reason: "invalid-owner-link" };
  }
  if (data.companionActorId && !companion) {
    await cleanupPreviousCompanion(ownerActor, "");
    await ownerActor.setFlag(FLAG, "lastAutomationSync", {
      companionActorId: "",
      applied: 0,
      skipped:
        (data.modifications?.length ?? 0) +
        (data.familiarAbilities?.length ?? 0),
      timestamp: Date.now(),
    });
    ui.notifications.warn(t("CompanionLinkInvalid"));
    return {
      applied: 0,
      skipped:
        (data.modifications?.length ?? 0) +
        (data.familiarAbilities?.length ?? 0),
      reason: "invalid-companion-link",
    };
  }
  if (!companion) {
    await cleanupPreviousCompanion(ownerActor, "");
    const skipped =
      (data.modifications ?? []).filter(
        (entry) => entry.catalogId && !entry.manual,
      ).length + (data.familiarAbilities ?? []).length;
    await ownerActor.setFlag(FLAG, "lastAutomationSync", {
      companionActorId: "",
      applied: 0,
      skipped,
      timestamp: Date.now(),
    });
    console.info(
      `${MODULE_ID} | No linked companion actor; selections remain recorded on controller.`,
    );
    return { applied: 0, skipped, reason: "no-companion" };
  }
  if (companion.type !== "character") {
    await cleanupPreviousCompanion(ownerActor, "");
    await ownerActor.setFlag(FLAG, "lastAutomationSync", {
      companionActorId: "",
      applied: 0,
      skipped:
        (data.modifications?.length ?? 0) +
        (data.familiarAbilities?.length ?? 0),
      timestamp: Date.now(),
    });
    ui.notifications.warn(t("CompanionActorInvalid"));
    return {
      applied: 0,
      skipped:
        (data.modifications?.length ?? 0) +
        (data.familiarAbilities?.length ?? 0),
      reason: "invalid-companion",
    };
  }

  await cleanupPreviousCompanion(ownerActor, companion.id);
  const slotSummary = robotSummary(ownerActor);
  const allowedModifications = new Set(
    customizationCapacity(
      data.modifications,
      slotSummary.generalTotal,
      slotSummary.commercialSlots,
    ).accepted,
  );
  const wanted = [];
  let chassisSelection = null;
  if (data.chassisCatalogId || data.chassis) {
    const chassis = await findChassisEntry(data.chassisCatalogId, data.chassis);
    if (chassis) {
      chassisSelection = {
        ...sourceForSelection(chassis, "robot-chassis"),
        expectedType: "ancestry",
      };
      wanted.push(chassisSelection);
      wanted.push({
        key: `robot-support:${chassis.id}`,
        catalogId: `${chassis.id}-support`,
        name: `${chassis.name}: Support`,
        expectedType: "action",
        kind: "robot-support",
        chassisCatalogId: chassis.id,
      });
      if (
        chassis.advancedManeuverId &&
        chassis.advancedManeuver &&
        ["advanced", "superior"].includes(data.gradeLimit)
      ) {
        wanted.push({
          key: `robot-maneuver:${chassis.advancedManeuverId}`,
          catalogId: chassis.advancedManeuverId,
          name: chassis.advancedManeuver,
          expectedType: "action",
          kind: "robot-maneuver",
          chassisCatalogId: chassis.id,
        });
      }
    }
  }
  let overSlotCount = 0;
  let manualCount = 0;
  for (const entry of data.modifications ?? []) {
    if (!allowedModifications.has(entry)) {
      overSlotCount++;
      continue;
    }
    // Ручная запись — учёт, а не доказательство наличия действующего Rule Element.
    if (entry.manual || !entry.catalogId) {
      manualCount++;
      continue;
    }
    wanted.push(sourceForSelection(entry, "robot-customization"));
  }
  for (const entry of data.familiarAbilities ?? []) {
    if (!entry.catalogId) {
      manualCount++;
      continue;
    }
    wanted.push(sourceForSelection(entry, "familiar-ability"));
  }

  const lastSync = ownerActor.getFlag(FLAG, "lastAutomationSync");
  const existing = generatedItemsForController(companion, ownerActor.id, {
    allowLegacy: lastSync?.companionActorId === companion.id,
  });
  const wantedSignatures = new Set(
    wanted.map((item) => `${item.kind}:${normalizedSlug(item.catalogId)}`),
  );
  const resolvedSignatures = new Set();
  const unresolvedKinds = new Set();
  let applied = 0;
  let skipped = overSlotCount + manualCount;
  const toCreate = [];
  const toUpdate = [];
  const updatedIds = new Set();
  let chassisBlocked = false;
  for (const selection of wanted) {
    const found =
      selection.kind === "robot-chassis"
        ? await moduleChassisSource(selection)
        : selection.kind === "robot-maneuver"
          ? await moduleManeuverSource(selection)
          : selection.kind === "robot-support"
            ? await moduleSupportSource(selection)
            : selection.kind === "familiar-ability"
              ? // Старый профиль сохраняем, но знакомые familiar Rules не применяем к character-роботу.
                // Неразрешённый вид защищает уже существовавшие предметы от очистки.
                null
              : await findSourceItem(selection);

    if (!found) {
      if (selection.kind === "robot-chassis") chassisBlocked = true;
      unresolvedKinds.add(selection.kind);
      skipped++;
      console.warn(
        `${MODULE_ID} | Could not resolve module/source item for ${selection.kind}: ${selection.name}. No guessed effect was applied.`,
      );
      continue;
    }
    if (
      chassisBlocked &&
      ["robot-maneuver", "robot-support"].includes(selection.kind)
    ) {
      unresolvedKinds.add(selection.kind);
      skipped++;
      continue;
    }
    if (["robot-maneuver", "robot-support"].includes(selection.kind)) {
      const sameNativeManeuver = companion.items.find((item) => {
        if (
          item.type !== "action" ||
          String(item.getFlag?.(FLAG, AUTOMATION_FLAG)?.key ?? "").startsWith(
            AUTOMATION_PREFIX,
          )
        )
          return false;
        return (
          normalizedSlug(slugOf(item)) ===
            normalizedSlug(selection.catalogId) ||
          normalizedSlug(item.name) === normalizedSlug(selection.name)
        );
      });
      if (sameNativeManeuver) {
        // Ручная копия действия сохраняется; собственный дубликат можно убрать.
        resolvedSignatures.add(
          `${selection.kind}:${normalizedSlug(selection.catalogId)}`,
        );
        continue;
      }
    }

    if (selection.kind === "robot-chassis") {
      const choices = found.entry && allowedSizes(found.entry);
      const currentChassis = existing.find(
        (item) =>
          item.type === "ancestry" &&
          item.getFlag?.(FLAG, AUTOMATION_FLAG)?.catalogId ===
            selection.catalogId,
      );
      const nativeChoice =
        currentChassis?.flags?.sf2e?.rulesSelections?.chassisSize;
      const choiceData = foundry.utils.deepClone(data);
      if (
        !choiceData.chassisSizes?.[selection.catalogId] &&
        choices?.includes(nativeChoice)
      ) {
        choiceData.chassisSizes ??= {};
        choiceData.chassisSizes[selection.catalogId] = nativeChoice;
      }
      found.source = applyChassisChoices(
        found.source ?? found.document.toObject(),
        found.entry,
        choiceData,
      );
      const generatedChassis = existing.find(
        (item) =>
          item.type === "ancestry" &&
          item.getFlag?.(FLAG, AUTOMATION_FLAG)?.kind === "robot-chassis",
      );
      const nativeAncestries = companion.items.filter(
        (item) =>
          item.type === "ancestry" &&
          !existing.some((managed) => managed.id === item.id),
      );
      const sameNative = nativeAncestries.find((item) => {
        const sourceId = String(
          item.flags?.core?.sourceId ??
            item._source?.flags?.core?.sourceId ??
            "",
        );
        return (
          sourceId === found.uuid ||
          normalizedSlug(slugOf(item)) ===
            normalizedSlug(selection.catalogId) ||
          normalizedSlug(item.name) === normalizedSlug(selection.name)
        );
      });
      if (sameNative) {
        // Совпадение имени или slug не доказывает применение правил своего шасси.
        skipped++;
        chassisBlocked = true;
        unresolvedKinds.add("robot-chassis");
        console.warn(
          `${MODULE_ID} | A native ancestry matches ${selection.name}, but it is not module-generated; refusing to claim the module chassis was applied.`,
        );
        continue;
      }
      if (nativeAncestries.length) {
        skipped++;
        chassisBlocked = true;
        unresolvedKinds.add("robot-chassis");
        ui.notifications.warn(t("ExistingAncestryMustBeRemoved"));
        console.warn(
          `${MODULE_ID} | A native ancestry already exists on ${companion.name}; refusing to add a second chassis ancestry.`,
        );
        continue;
      }
      if (generatedChassis) {
        if (!canReplaceManagedItem(generatedChassis)) {
          updatedIds.add(generatedChassis.id);
          chassisBlocked = true;
          skipped++;
          ui.notifications.warn(t("ProtectedItems"));
          continue;
        }
        const replacement = found.source
          ? found.source
          : found.document.toObject();
        replacement._id = generatedChassis.id;
        replacement.flags ??= {};
        replacement.flags[FLAG] ??= {};
        replacement.flags[FLAG][AUTOMATION_FLAG] = {
          key: `${AUTOMATION_PREFIX}${selection.key}`,
          kind: selection.kind,
          catalogId: selection.catalogId,
          sourceUuid: found.uuid ?? found.document?.uuid ?? "",
          sourcePack: found.pack ?? "",
          controllerActorId: ownerActor.id,
        };
        replacement.flags.core ??= {};
        replacement.flags.core.sourceId =
          found.uuid ?? found.document?.uuid ?? "";
        replacement.flags[FLAG][AUTOMATION_FLAG].fingerprint =
          itemFingerprint(replacement);
        if (
          itemFingerprint(generatedChassis.toObject()) !==
          itemFingerprint(replacement)
        )
          toUpdate.push(replacement);
        updatedIds.add(generatedChassis.id);
        resolvedSignatures.add(
          `${selection.kind}:${normalizedSlug(selection.catalogId)}`,
        );
        applied++;
        continue;
      }
    }
    const sameGenerated = existing.find(
      (item) =>
        item.getFlag?.(FLAG, AUTOMATION_FLAG)?.key ===
        `${AUTOMATION_PREFIX}${selection.key}`,
    );
    if (sameGenerated) {
      // Повторная синхронизация не пересоздаёт действие или кастомизацию.
      updatedIds.add(sameGenerated.id);
      if (!canReplaceManagedItem(sameGenerated))
        ui.notifications.warn(t("ProtectedItems"));
      applied++;
      continue;
    }
    const source = found.source ? found.source : found.document.toObject();
    delete source._id;
    source.flags ??= {};
    source.flags[FLAG] ??= {};
    source.flags[FLAG][AUTOMATION_FLAG] = {
      key: `${AUTOMATION_PREFIX}${selection.key}`,
      kind: selection.kind,
      catalogId: selection.catalogId,
      sourceUuid: found.uuid ?? found.document?.uuid ?? "",
      sourcePack: found.pack ?? "",
      controllerActorId: ownerActor.id,
    };
    source.flags.core ??= {};
    source.flags.core.sourceId = found.uuid ?? found.document?.uuid ?? "";
    source.flags[FLAG][AUTOMATION_FLAG].fingerprint = itemFingerprint(source);
    toCreate.push(source);
    resolvedSignatures.add(
      `${selection.kind}:${normalizedSlug(selection.catalogId)}`,
    );
    applied++;
  }

  // Сначала разрешаем источники. При временной недоступности не удаляем
  // прежние применённые предметы, чтобы не сломать работающего компаньона.
  if (toUpdate.length)
    await stampManagedItems(
      await companion.updateEmbeddedDocuments("Item", toUpdate),
    );
  if (toCreate.length)
    await stampManagedItems(
      await companion.createEmbeddedDocuments("Item", toCreate),
    );
  const removeIds = existing
    .filter((item) => {
      if (updatedIds.has(item.id)) return false;
      if (!canReplaceManagedItem(item)) return false;
      const metadata = item.getFlag?.(FLAG, AUTOMATION_FLAG) ?? {};
      if (
        metadata.kind === "robot-chassis" &&
        unresolvedKinds.has("robot-chassis")
      )
        return false;
      if (
        metadata.kind === "robot-maneuver" &&
        unresolvedKinds.has("robot-maneuver") &&
        wanted.some((entry) => entry.kind === "robot-maneuver")
      )
        return false;
      if (
        metadata.kind === "robot-support" &&
        unresolvedKinds.has("robot-support") &&
        wanted.some((entry) => entry.kind === "robot-support")
      )
        return false;
      const signature = `${metadata.kind ?? ""}:${normalizedSlug(metadata.catalogId ?? "")}`;
      const stillWanted = wantedSignatures.has(signature);
      const replacementCreated = resolvedSignatures.has(signature);
      return !stillWanted || replacementCreated;
    })
    .map((item) => item.id);
  if (removeIds.length)
    await companion.deleteEmbeddedDocuments("Item", removeIds);

  await ownerActor.setFlag(FLAG, "lastAutomationSync", {
    companionActorId: companion.id,
    applied,
    skipped,
    timestamp: Date.now(),
  });
  if (overSlotCount > 0)
    ui.notifications.warn(`${t("NoSlots")}: ${overSlotCount}`);
  if (skipped > 0)
    ui.notifications.warn(
      `${t("AutomationSkipped")}: ${skipped}. ${t("AutomationSkippedHint")}`,
    );
  return { applied, skipped, companionActorId: companion.id };
}

async function openPackBrowser(collection, actor, query = "") {
  if (!dependency()?.active) {
    ui.notifications.error(t("DependencyMissing"));
    return;
  }
  const packKey = String(collection).startsWith(`${DEPENDENCY_ID}.`)
    ? String(collection).slice(DEPENDENCY_ID.length + 1)
    : "";
  if (!PACKS.some(({ key }) => key === packKey)) {
    ui.notifications.error(t("NoEntries"));
    console.warn(
      `${MODULE_ID} | Refusing to open unapproved Companion Compendia collection: ${collection}`,
    );
    return;
  }
  const pack = game.packs.get(collection);
  if (!isCompatibleItemPack(pack)) {
    ui.notifications.error(`${collection} — ${t("NoEntries")}`);
    return;
  }
  let index;
  try {
    index = await pack.getIndex({
      fields: ["type", "system.slug", "system.category"],
    });
  } catch (error) {
    console.error(`${MODULE_ID} | Could not index ${collection}`, error);
    ui.notifications.error(t("NoEntries"));
    return;
  }
  const drawList = (term) => {
    const needle = term.trim().toLocaleLowerCase();
    const entries = index
      .filter(
        (entry) =>
          !needle ||
          `${entry.name ?? ""} ${entry.system?.slug ?? ""} ${entry.type ?? ""}`
            .toLocaleLowerCase()
            .includes(needle),
      )
      .slice(0, 100);
    return (
      entries
        .map(
          (entry) =>
            `<button type="button" class="sfmtp-entry" data-entry-id="${esc(entry._id)}"><span>${esc(entry.name)}</span><small>${esc(entry.type ?? "Item")}</small></button>`,
        )
        .join("") || `<p>${esc(t("NoEntries"))}</p>`
    );
  };
  const content = `<div class="sfmtp-browser"><p><strong>${esc(packLabel(collection.split(".").pop()))}</strong></p><input type="search" name="sfmtp-search" placeholder="${esc(t("Search"))}" value="${esc(query)}"><div class="sfmtp-entry-list">${drawList(query)}</div><p class="hint">${esc(t("ImportWarning"))}</p></div>`;
  new Dialog(
    {
      title: `${t("Title")} — ${packLabel(collection.split(".").pop())}`,
      content,
      buttons: {
        back: { label: t("Back"), callback: () => openHome(actor) },
        close: { label: t("Close") },
      },
      render: (html) => {
        const refresh = () =>
          html
            .find(".sfmtp-entry-list")
            .html(
              drawList(String(html.find('[name="sfmtp-search"]').val() ?? "")),
            );
        html.find('[name="sfmtp-search"]').on("input", refresh);
        html.on("click", ".sfmtp-entry", async (event) => {
          const id = event.currentTarget.dataset.entryId;
          try {
            const document = await pack.getDocument(id);
            if (!document) return;
            const description =
              await foundry.applications.ux.TextEditor.implementation.enrichHTML(
                document.system?.description?.value ??
                  document.system?.description ??
                  "",
                { relativeTo: document, secrets: document.isOwner },
              );
            const detail = `<div class="sfmtp-item-detail"><h3>${esc(document.name)}</h3><p>${esc(document.type)} · ${esc(slugOf(document))}</p><div class="sfmtp-description">${description}</div></div>`;
            new Dialog(
              {
                title: document.name,
                content: detail,
                buttons: {
                  add: {
                    label: importActionLabel(actor, document),
                    callback: async () => {
                      try {
                        await addCompendiumItem(actor, document);
                      } catch (error) {
                        console.error(
                          `${MODULE_ID} | Item import failed`,
                          error,
                        );
                        ui.notifications.error(t("AddFailed"));
                      }
                    },
                  },
                  back: {
                    label: t("Back"),
                    callback: () =>
                      openPackBrowser(
                        collection,
                        actor,
                        String(html.find('[name="sfmtp-search"]').val() ?? ""),
                      ),
                  },
                },
              },
              { width: 650, height: "auto", resizable: true },
            ).render(true);
          } catch (error) {
            console.error(`${MODULE_ID} | Could not open pack entry`, error);
            ui.notifications.error(t("NoEntries"));
          }
        });
      },
    },
    { width: 620, height: 680, resizable: true },
  ).render(true);
}

async function searchFamiliarItems(actor = activeActor(), query = "familiar") {
  if (!dependency()?.active)
    return ui.notifications.error(t("DependencyMissing"));
  if (!actor) return ui.notifications.warn(t("ActorMissing"));
  // Ищем способности в совместимых паках установленной системы и модулей.
  const packs = [...game.packs].filter(
    (pack) =>
      isCompatibleItemPack(pack) &&
      /feat|feature|ability|familiar/i.test(
        `${pack.collection} ${pack.metadata?.label ?? ""}`,
      ),
  );
  const results = [];
  const q = String(query || "familiar")
    .trim()
    .toLocaleLowerCase();
  for (const pack of packs) {
    try {
      const index = await pack.getIndex({
        fields: [
          "type",
          "system.slug",
          "system.category",
          "system.traits.value",
        ],
      });
      for (const entry of index) {
        const haystack =
          `${entry.name ?? ""} ${entry.system?.slug ?? ""} ${entry.type ?? ""} ${pack.collection}`.toLocaleLowerCase();
        if (
          !q ||
          haystack.includes(q) ||
          (q === "familiar" && /familiar|pet ability/i.test(haystack))
        ) {
          results.push({ pack, entry });
        }
      }
    } catch (error) {
      console.debug(`${MODULE_ID} | Skipping index ${pack.collection}`, error);
    }
  }
  results.sort((a, b) =>
    String(a.entry.name).localeCompare(String(b.entry.name)),
  );
  const visible = results.slice(0, 150);
  const content = `<div class="sfmtp-browser"><input type="search" name="sfmtp-familiar-search" placeholder="${esc(t("Search"))}" value="${esc(query)}"><div class="sfmtp-entry-list">${visible.map((r, i) => `<button type="button" class="sfmtp-familiar-entry" data-result="${i}"><span>${esc(r.entry.name)}</span><small>${esc(r.pack.collection)}</small></button>`).join("") || `<p>${esc(t("NoEntries"))}</p>`}</div><p class="hint">${esc(t("ImportWarning"))}</p></div>`;
  new Dialog(
    {
      title: t("FamiliarSearch"),
      content,
      buttons: {
        back: { label: t("Back"), callback: () => openHome(actor) },
        close: { label: t("Close") },
      },
      render: (html) => {
        html
          .find('[name="sfmtp-familiar-search"]')
          .on("keydown", async (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            searchFamiliarItems(actor, String(event.currentTarget.value ?? ""));
          });
        html.on("click", ".sfmtp-familiar-entry", async (event) => {
          const result = visible[Number(event.currentTarget.dataset.result)];
          if (!result) return;
          try {
            const document = await result.pack.getDocument(result.entry._id);
            if (!document) return;
            const description =
              await foundry.applications.ux.TextEditor.implementation.enrichHTML(
                document.system?.description?.value ?? "",
                { relativeTo: document, secrets: document.isOwner },
              );
            new Dialog(
              {
                title: document.name,
                content: `<h3>${esc(document.name)}</h3><p>${esc(result.pack.collection)} · ${esc(slugOf(document))}</p><div>${description}</div>`,
                buttons: {
                  add: {
                    label: importActionLabel(actor, document),
                    callback: async () => {
                      try {
                        await addCompendiumItem(actor, document);
                      } catch (error) {
                        console.error(
                          `${MODULE_ID} | Familiar feat import failed`,
                          error,
                        );
                        ui.notifications.error(t("AddFailed"));
                      }
                    },
                  },
                  back: {
                    label: t("Back"),
                    callback: () =>
                      searchFamiliarItems(
                        actor,
                        String(
                          html.find('[name="sfmtp-familiar-search"]').val() ??
                            "familiar",
                        ),
                      ),
                  },
                },
              },
              { width: 650, height: "auto", resizable: true },
            ).render(true);
          } catch (error) {
            console.error(error);
            ui.notifications.error(t("NoEntries"));
          }
        });
      },
    },
    { width: 720, height: 680, resizable: true },
  ).render(true);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "addActorButton", {
    name: "SFMTP.ShowActorButton",
    hint: "SFMTP.ShowActorButtonHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MODULE_ID, "addFamiliarButton", {
    name: "SFMTP.ShowFamiliarButton",
    hint: "SFMTP.ShowFamiliarButtonHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: game.settings.get(MODULE_ID, "addActorButton") !== false,
  });
  game.settings.register(MODULE_ID, "slotGrantRules", {
    name: "SFMTP.SlotConfig",
    hint: "SFMTP.SlotConfigHint",
    scope: "world",
    config: true,
    type: String,
    default: "{}",
    onChange: () => ui.notifications.info(t("Save")),
  });
});

Hooks.once("i18nInit", () => {
  void initializeLocalization().catch(() => {});
});

Hooks.once("ready", async () => {
  try {
    await initializeLocalization();
  } catch {
    ui.notifications.error(t("LocalizationLoadFailed"));
    return;
  }
  if (game.system.id !== "sf2e") {
    console.warn(
      `${MODULE_ID} | Current system is ${game.system.id}; SF2e required.`,
    );
    if (game.user?.isGM) ui.notifications.error(t("SystemMismatch"));
    return;
  }
  if (!dependency()?.active) {
    console.error(
      `${MODULE_ID} | Required dependency ${DEPENDENCY_ID} is not active. Initialization aborted.`,
    );
    ui.notifications.error(t("DependencyMissing"));
    return;
  }
  const missingPacks = missingCompanionPacks();
  if (missingPacks.length) {
    console.warn(
      `${MODULE_ID} | Required SF2e packs are missing from ${DEPENDENCY_ID}: ${missingPacks.join(", ")}`,
    );
    if (game.user?.isGM) ui.notifications.warn(t("CompendiaPacksMissing"));
  }
  Hooks.on("createItem", (item, _options, userId) => {
    if (userId && userId !== game.user.id) return;
    // Поддерживаем штатный перенос ancestry на character-лист, не только свой браузер.
    void handleCompanionBuildItem(item);
  });
  game.modules.get(MODULE_ID).api = {
    open: (actor = activeActor()) => openHome(actor),
    searchFamiliarItems,
    openFamiliar: (actor = activeActor()) => openFamiliarManager(actor),
    openExocortex: (actor = activeActor()) =>
      openExocortexManager(actor, { openTechPets: openHome }),
    getExocortexData: exocortexState,
    updateExocortex,
    installExocortexActions,
    createFamiliar,
    linkFamiliar,
    syncFamiliarAbilities,
    getRobotData,
    setRobotData,
    linkActors,
    getModificationSlots: (actor) => robotSummary(actor),
    getLinkedCompanion: linkedCompanion,
    resolveImportTarget: (actor, item) => resolveImportTarget(actor, item),
    addCompendiumItem,
    syncAutomation,
    registerSlotGrant: async (slug, slots = 1) => {
      const rules = parseSlotRules();
      rules[String(slug)] = Math.max(0, Math.floor(Number(slots) || 0));
      await game.settings.set(
        MODULE_ID,
        "slotGrantRules",
        JSON.stringify(rules, null, 2),
      );
      return rules;
    },
    openPack: (key, actor = activeActor()) =>
      openPackBrowser(packId(key), actor),
  };
  Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
    if (!app.actor || app.actor.type === "loot") return;
    if (
      game.settings.get(MODULE_ID, "addFamiliarButton") &&
      ["character", "familiar"].includes(app.actor.type)
    )
      buttons.unshift({
        label: t("FamiliarTitle"),
        class: "sfmtp-familiar",
        icon: "fas fa-paw",
        onclick: () => openFamiliarManager(app.actor),
      });
    if (game.settings.get(MODULE_ID, "addActorButton"))
      buttons.unshift({
        label: t("Title"),
        class: "sfmtp-open",
        icon: "fas fa-robot",
        onclick: () => openHome(app.actor),
      });
  });
  Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
    if (
      !app.actor ||
      !["character", "familiar"].includes(app.actor.type) ||
      app.actor.isOwner === false
    )
      return;
    if (game.settings.get(MODULE_ID, "addFamiliarButton"))
      controls.push({
        label: t("FamiliarTitle"),
        icon: "fas fa-paw",
        onClick: () => openFamiliarManager(app.actor),
      });
    if (
      game.settings.get(MODULE_ID, "addActorButton") &&
      app.actor.type === "character"
    )
      controls.push({
        label: t("Title"),
        icon: "fas fa-robot",
        onClick: () => openHome(app.actor),
      });
  });
  console.info(
    `${MODULE_ID} | Ready. Required Companion Compendia dependency verified; missing SF2e packs: ${missingPacks.join(", ") || "none"}.`,
  );
});
