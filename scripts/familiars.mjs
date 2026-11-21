import { t } from "./i18n.mjs";
import { supportedSystem, systemId } from "./system-context.mjs";
import { localizeCatalog, localizeItemSource } from "./content-localization.mjs";
import { sourceFamiliarAllowance } from "./companion-sources.mjs";
// Нативный familiar SF2e отвечает за характеристики. Здесь только связь и выбор Items.
import { MODULE_ID } from "./item-sources.mjs";
import { buildFamiliarSource } from "./familiar-sources.mjs";
import { choiceVariants, preserveRuleChoices } from "./choice-variants.mjs";
const queues = new Map();

const fail = (key) => {
  throw new Error(t(key));
};
const itemsOf = (actor) => Array.from(actor.items ?? []);
export function assertFamiliarAccess(actor) {
  if (!supportedSystem()) fail("SystemMismatch");
  if (
    !actor ||
    actor.isOwner === false ||
    !["character", "familiar"].includes(actor.type)
  )
    fail("FamiliarAccess");
}
export function familiarOwner(actor) {
  if (actor?.type === "character") return actor;
  const owner = game.actors.get(actor?.system?.master?.id);
  return owner?.type === "character" ? owner : null;
}
export function linkedFamiliars(owner) {
  return Array.from(game.actors).filter(
    (actor) =>
      actor.type === "familiar" && actor.system?.master?.id === owner?.id,
  );
}
export async function linkFamiliar(owner, familiar, ability = "int") {
  assertFamiliarAccess(owner);
  if (owner.getFlag(MODULE_ID, "petProfile")?.enabled)
    fail("SourcePetConflict");
  assertFamiliarAccess(familiar);
  if (
    owner.type !== "character" ||
    familiar.type !== "familiar" ||
    !["str", "dex", "con", "int", "wis", "cha"].includes(ability)
  )
    fail("FamiliarAccess");
  if (familiar.system?.master?.id && familiar.system.master.id !== owner.id)
    fail("FamiliarOccupied");
  if (linkedFamiliars(owner).some((actor) => actor.id !== familiar.id))
    fail("FamiliarAmbiguous");
  await familiar.update({
    "system.master.id": owner.id,
    "system.master.ability": ability,
  });
  return familiar;
}
export async function createFamiliar(owner, ability = "int") {
  assertFamiliarAccess(owner);
  if (owner.getFlag(MODULE_ID, "petProfile")?.enabled)
    fail("SourcePetConflict");
  if (owner.type !== "character" || linkedFamiliars(owner).length)
    fail("FamiliarAmbiguous");
  if (!["str", "dex", "con", "int", "wis", "cha"].includes(ability))
    fail("FamiliarAccess");
  return Actor.create({
    name: `${t("FamiliarTitle")} — ${owner.name}`,
    type: "familiar",
    ownership: { ...owner.ownership },
    system: { master: { id: owner.id, ability } },
  });
}
// Отдельный ручной профиль: не создаём familiar-актора и не выдаём черту Pet.
export async function savePetProfile(owner, profile) {
  assertFamiliarAccess(owner);
  if (owner.type !== "character") fail("FamiliarAccess");
  const abilities = Array.isArray(profile.abilities)
    ? [...profile.abilities]
    : [];
  if (profile.enabled) {
    if (linkedFamiliars(owner).length) fail("SourcePetConflict");
    const petAbilities = new Set(
      (await familiarCatalog())
        .filter((entry) => entry.category === "pet")
        .map((entry) => entry.id),
    );
    if (
      abilities.length !== 2 ||
      new Set(abilities).size !== 2 ||
      abilities.some((id) => !petAbilities.has(id))
    )
      fail("PetSelectionInvalid");
  }
  const saved = owner.getFlag(MODULE_ID, "petProfile") ?? {};
  await owner.setFlag(MODULE_ID, "petProfile", {
    ...saved,
    enabled: Boolean(profile.enabled),
    name: String(profile.name ?? saved.name ?? "").trim(),
    abilities,
  });
}

export function familiarAllowance(owner, familiar) {
  const override = familiar.getFlag(MODULE_ID, "familiarAllowance");
  if (Number.isInteger(override) && override >= 0 && override <= 50)
    return override;
  const native = Number(owner?.system?.attributes?.familiarAbilities?.value);
  return Math.max(
    sourceFamiliarAllowance(owner),
    Number.isFinite(native) && native > 0 ? Math.floor(native) : 0,
  );
}
export function familiarAbilityItems(familiar) {
  return itemsOf(familiar).filter(
    (item) =>
      item.type === "action" &&
      (item.system?.category === "familiar" ||
        item.flags?.[MODULE_ID]?.familiarAbility),
  );
}
// Сравниваем пользовательские данные; системная миграция не означает редактирования.
export function familiarFingerprint(item) {
  const source = item.toObject ? item.toObject() : structuredClone(item);
  const system = structuredClone(source.system ?? {});
  delete system._migration;
  const sort = (value) =>
    Array.isArray(value)
      ? value.map(sort)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sort(value[key])]),
          )
        : value;
  return JSON.stringify(
    sort({
      name: source.name,
      img: source.img,
      type: source.type,
      system,
      effects: source.effects ?? [],
    }),
  );
}
function managed(item, owner) {
  return (
    item.flags?.[MODULE_ID]?.familiarManaged?.controllerActorId === owner.id
  );
}
export function familiarCanRemove(item, owner, familiar) {
  if (
    !managed(item, owner) ||
    (familiar.getFlag(MODULE_ID, "innateFamiliarItems") ?? []).includes(item.id)
  )
    return false;
  const fingerprint = item.flags[MODULE_ID].familiarManaged.fingerprint;
  const source = item.toObject();
  // Допустимый выбор ChoiceSet — не ручная правка: сверяем и варианты выбора.
  return (
    fingerprint === familiarFingerprint(source) ||
    choiceVariants(source).some(
      (variant) => familiarFingerprint(variant) === fingerprint,
    )
  );
}
export async function familiarCatalog() {
  const base = game.modules.get(MODULE_ID)?.path ?? `modules/${MODULE_ID}`;
  const response = await fetch(`${base}/data/familiar-abilities.json`);
  if (!response.ok) fail("FamiliarCatalogMissing");
  return localizeCatalog(await response.json(), "familiar-abilities").entries;
}
export function validateFamiliarSelection(
  entries,
  owner,
  familiar,
  existing = [],
  catalog = [],
) {
  const slugs = new Set([
    ...entries.map((entry) => entry.id),
    ...existing.map((item) => item.system?.slug),
  ]);
  const validationEntries = [
    ...entries,
    ...catalog.filter((entry) =>
      existing.some((item) => item.system?.slug === entry.id),
    ),
  ];
  for (const entry of validationEntries) {
    if ((entry.prerequisites ?? []).some((id) => !slugs.has(id)))
      fail("FamiliarPrerequisites");
    if (
      entry.id === "kinspeech" &&
      (Number(owner.level ?? owner.system?.details?.level?.value ?? 0) < 6 ||
        ["construct", "dragon", "elemental", "fungus", "plant"].some((id) =>
          slugs.has(id),
        ))
    )
      fail("FamiliarPrerequisites");
  }
  if (entries.length + existing.length > familiarAllowance(owner, familiar))
    fail("FamiliarLimit");
}
export function syncFamiliarAbilities(owner, familiar, selectedIds) {
  // Сериализация не позволяет двум окнам одновременно записать противоречащие наборы.
  const key = familiar?.id;
  const next = (queues.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => syncNow(owner, familiar, selectedIds));
  queues.set(key, next);
  return next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
}
async function syncNow(owner, familiar, selectedIds) {
  assertFamiliarAccess(owner);
  assertFamiliarAccess(familiar);
  if (
    owner.type !== "character" ||
    familiar.type !== "familiar" ||
    familiar.system?.master?.id !== owner.id
  )
    fail("FamiliarAccess");
  if (
    !Array.isArray(selectedIds) ||
    selectedIds.some((id) => typeof id !== "string")
  )
    fail("FamiliarSelectionInvalid");
  const catalog = await familiarCatalog();
  const ids = [...new Set(selectedIds)];
  if (ids.some((id) => !catalog.some((entry) => entry.id === id)))
    fail("FamiliarSelectionInvalid");
  const all = familiarAbilityItems(familiar);
  const protectedItems = all.filter(
    (item) => !familiarCanRemove(item, owner, familiar),
  );
  const protectedSlugs = new Set(
    protectedItems.map((item) => item.system?.slug),
  );
  const entries = ids
    .filter((id) => !protectedSlugs.has(id))
    .map((id) => catalog.find((entry) => entry.id === id));
  validateFamiliarSelection(entries, owner, familiar, protectedItems, catalog);
  const expected = new Set(entries.map((entry) => entry.id));
  // Не дублируем вручную добавленные действия и не трогаем изменённые/врождённые.
  const toCreate = entries
    .filter((entry) => !all.some((item) => item.system?.slug === entry.id))
    .map((entry) => {
      const source = localizeItemSource(buildFamiliarSource(entry, systemId()), "familiar-abilities", entry);
      delete source._id;
      source.flags[MODULE_ID].familiarManaged = {
        controllerActorId: owner.id,
        fingerprint: familiarFingerprint(source),
      };
      return source;
    });
  let created = [];
  if (toCreate.length) {
    created = await familiar.createEmbeddedDocuments("Item", toCreate);
    const snapshots = new Map(
      created.map((item) => [item.id, familiarFingerprint(item)]),
    );
    try {
      if (
        created.length !== toCreate.length ||
        toCreate.some(
          (source) =>
            !created.some(
              (item) =>
                item.system.slug === source.system.slug &&
                item.flags?.[MODULE_ID]?.catalogId ===
                  source.flags[MODULE_ID].catalogId,
            ),
        )
      )
        fail("FamiliarCreateIncomplete");
      for (const item of created)
        await item.setFlag(MODULE_ID, "familiarManaged", {
          controllerActorId: owner.id,
          fingerprint: snapshots.get(item.id),
        });
    } catch (error) {
      const rollback = created.filter(
        (item) =>
          managed(item, owner) &&
          !all.some((previous) => previous.id === item.id) &&
          snapshots.get(item.id) === familiarFingerprint(item),
      );
      if (rollback.length) {
        try {
          await familiar.deleteEmbeddedDocuments(
            "Item",
            rollback.map((item) => item.id),
          );
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            t("FamiliarRollbackFailed"),
          );
        }
      }
      throw error;
    }
  }
  const obsolete = all.filter(
    (item) =>
      familiarCanRemove(item, owner, familiar) &&
      !expected.has(item.system.slug),
  );
  if (obsolete.length)
    await familiar.deleteEmbeddedDocuments(
      "Item",
      obsolete.map((item) => item.id),
    );
  // Обновляем неизменённые управляемые копии, чьё содержимое изменилось в каталоге
  // (например, Construct получил ActorTraits). Изменённые, врождённые и ручные
  // Items защищены тем же familiarCanRemove, что и при удалении.
  const desiredBySlug = new Map(
    entries.map((entry) => [
      entry.id,
      localizeItemSource(
        buildFamiliarSource(entry, systemId()),
        "familiar-abilities",
        entry,
      ),
    ]),
  );
  let upgraded = 0;
  for (const item of all) {
    const source = desiredBySlug.get(item.system?.slug);
    if (!source || !familiarCanRemove(item, owner, familiar)) continue;
    // Целевое состояние сохраняет поля схемы, которых нет в фабрике
    // (description.gm, traits.otherTags, deathNote и т.п.): иначе снимок не
    // совпал бы с записанным Item и копия считалась бы «изменённой».
    const target = item.toObject();
    const previous = item.toObject();
    target.name = source.name;
    target.img = source.img;
    target.effects = source.effects ?? [];
    const sys = target.system;
    sys.slug = source.system.slug;
    sys.category = source.system.category;
    sys.actionType = source.system.actionType;
    sys.actions = source.system.actions;
    sys.publication = source.system.publication;
    sys.rules = source.system.rules;
    sys.description = { ...sys.description, value: source.system.description.value };
    sys.traits = { ...sys.traits, value: source.system.traits.value };
    // Сохраняем подтверждённые выборы ChoiceSet, чтобы обновление не сбрасывало
    // выбор и не делало неизменённую копию «изменённой» на каждой синхронизации.
    preserveRuleChoices(target, previous, systemId());
    if (familiarFingerprint(item) !== familiarFingerprint(target)) {
      // Содержимое и снимок пишутся одним update: прерванная запись не оставит
      // копию с новым содержимым и старым снимком, которую менеджер счёл бы
      // «изменённой» и больше не смог ни снять, ни обновить.
      await item.update({
        name: target.name,
        img: target.img,
        system: target.system,
        effects: target.effects,
        flags: {
          core: source.flags.core,
          [MODULE_ID]: {
            ...item.flags[MODULE_ID],
            ...source.flags[MODULE_ID],
            familiarManaged: {
              controllerActorId: owner.id,
              fingerprint: familiarFingerprint(target),
            },
          },
        },
      });
      upgraded++;
    }
    // Система промптит ChoiceSet только при создании Item. Старая неизменённая
    // копия, получившая новые ChoiceSet при обновлении, осталась бы без выбора,
    // поэтому спрашиваем недостающие выборы отдельно (и при повторном сохранении).
    await promptUnselectedFamiliarChoices(item);
  }
  return {
    created: created.length,
    removed: obsolete.length,
    protected: protectedItems.length,
    upgraded,
  };
}
function choiceClausePasses(clause, options) {
  if (typeof clause === "string") return options.has(clause);
  if (!clause || typeof clause !== "object") return true;
  if ("not" in clause) return !choiceClausePasses(clause.not, options);
  if ("or" in clause) return clause.or.some((c) => choiceClausePasses(c, options));
  if ("and" in clause)
    return clause.and.every((c) => choiceClausePasses(c, options));
  for (const [op, fn] of [
    ["gte", (a, b) => a >= b],
    ["lte", (a, b) => a <= b],
    ["gt", (a, b) => a > b],
    ["lt", (a, b) => a < b],
  ]) {
    if (op in clause) {
      const [key, bound] = clause[op];
      const prefix = `${key}:`;
      return [...options]
        .filter((o) => o.startsWith(prefix))
        .map((o) => Number(o.slice(prefix.length)))
        .filter((n) => !Number.isNaN(n))
        .some((n) => fn(n, bound));
    }
  }
  return true;
}
export function choicePredicatePasses(predicate, options) {
  if (!predicate) return true;
  const clauses = Array.isArray(predicate) ? predicate : [predicate];
  return clauses.every((c) => choiceClausePasses(c, options));
}
export function optionsWithSelections(actor, pending, selections) {
  const options = new Set(actor?.getRollOptions?.() ?? []);
  for (const { rule } of pending)
    if (rule.rollOption && selections[rule.flag] != null)
      options.add(`${rule.rollOption}:${selections[rule.flag]}`);
  return options;
}
export function validChoicesFor(rule, actor, pending, selections) {
  const options = optionsWithSelections(actor, pending, selections);
  return (rule.choices ?? []).filter((c) =>
    choicePredicatePasses(c.predicate, options),
  );
}
async function promptUnselectedFamiliarChoices(item) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2 || !globalThis.game?.i18n) return;
  const system = systemId();
  const pending = (item.system.rules ?? [])
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.key === "ChoiceSet" && rule.flag && !rule.selection);
  if (!pending.length) return;
  const actor = item.actor;
  const localize = (key) => game.i18n.localize(key);
  const escape = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  //Defaults: первый допустимый вариант с учётом уже сделанных выборов, чтобы
  //пары с rollOption-исключением не стартовали с одного и того же значения.
  const selections = {};
  for (const { rule } of pending) {
    const valid = validChoicesFor(rule, actor, pending, selections);
    if (valid.length) selections[rule.flag] = valid[0].value;
  }
  const optionsHtml = (rule) =>
    validChoicesFor(rule, actor, pending, selections)
      .map(
        (c) =>
          `<option value="${escape(c.value)}"${selections[rule.flag] === c.value ? " selected" : ""}>${escape(localize(c.label ?? c.value))}</option>`,
      )
      .join("");
  const content =
    `<p>${localize("SFMTP.FamiliarNewChoiceHint")}</p>` +
    pending
      .map(
        ({ rule }) =>
          `<div class="form-group"><label>${escape(localize(rule.prompt ?? rule.label ?? rule.flag))}</label><select name="${escape(rule.flag)}">${optionsHtml(rule)}</select></div>`,
      )
      .join("");
  let settle;
  const done = new Promise((resolve) => (settle = resolve));
  const refresh = (element) => {
    for (const { rule } of pending) {
      const field = element.querySelector(`select[name="${rule.flag}"]`);
      if (!field) continue;
      const valid = validChoicesFor(rule, actor, pending, selections);
      if (!valid.some((c) => c.value === selections[rule.flag]))
        selections[rule.flag] = valid[0]?.value;
      field.innerHTML = optionsHtml(rule);
      if (selections[rule.flag] != null) field.value = selections[rule.flag];
    }
  };
  const dialog = new DialogV2({
    window: { title: localize("SFMTP.FamiliarNewChoiceTitle") },
    content,
    buttons: [
      {
        action: "ok",
        label: localize("SFMTP.Save"),
        callback: (_event, _button, dlg) => {
          for (const { rule } of pending) {
            const field = dlg.element.querySelector(
              `select[name="${rule.flag}"]`,
            );
            if (field) selections[rule.flag] = field.value;
          }
          // Проверяем выборы перед сохранением: невалидный набор не пишем.
          const options = optionsWithSelections(actor, pending, selections);
          const invalid = pending.some(
            ({ rule }) =>
              !choicePredicatePasses(
                (rule.choices ?? []).find(
                  (c) => c.value === selections[rule.flag],
                )?.predicate,
                options,
              ) || selections[rule.flag] == null,
          );
          if (invalid) {
            refresh(dlg.element);
            ui.notifications.warn(localize("SFMTP.FamiliarNewChoiceInvalid"));
            return false;
          }
          settle({ ...selections });
          return { ...selections };
        },
      },
      {
        action: "cancel",
        label: localize("SFMTP.Cancel"),
        callback: () => {
          settle(null);
          return null;
        },
      },
    ],
  });
  dialog.addEventListener("close", () => settle(null));
  await dialog.render(true);
  for (const { rule } of pending) {
    const field = dialog.element.querySelector(`select[name="${rule.flag}"]`);
    field?.addEventListener("change", () => {
      selections[rule.flag] = field.value;
      refresh(dialog.element);
    });
  }
  const chosen = await done;
  if (!chosen) return;
  const rules = (item.system.rules ?? []).map((rule) =>
    rule.key === "ChoiceSet" && chosen[rule.flag] !== undefined
      ? { ...rule, selection: chosen[rule.flag] }
      : rule,
  );
  await item.update({
    "system.rules": rules,
    [`flags.${system}.rulesSelections`]: {
      ...(item.flags[system]?.rulesSelections ?? {}),
      ...chosen,
    },
  });
  await item.update({
    [`flags.${MODULE_ID}.familiarManaged.fingerprint`]: familiarFingerprint(
      item.toObject(),
    ),
  });
}

export async function setInnateFamiliarItems(familiar, ids) {
  assertFamiliarAccess(familiar);
  if (
    familiar.type !== "familiar" ||
    !Array.isArray(ids) ||
    ids.some(
      (id) => !familiarAbilityItems(familiar).some((item) => item.id === id),
    )
  )
    fail("FamiliarSelectionInvalid");
  await familiar.setFlag(MODULE_ID, "innateFamiliarItems", [...new Set(ids)]);
}
