// Нативный familiar SF2e отвечает за характеристики. Здесь только связь и выбор Items.
import { MODULE_ID } from "./item-sources.mjs";
import { buildFamiliarSource } from "./familiar-sources.mjs";
const queues = new Map();
const t = (key) => game.i18n.localize(`SFMTP.${key}`);
const fail = (key) => {
  throw new Error(t(key));
};
const itemsOf = (actor) => Array.from(actor.items ?? []);
export function assertFamiliarAccess(actor) {
  if (
    game.system.id !== "sf2e" ||
    !game.modules.get("pf2e-animal-companions")?.active
  )
    fail("DependencyMissing");
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
export function familiarAllowance(owner, familiar) {
  const override = familiar.getFlag(MODULE_ID, "familiarAllowance");
  if (Number.isInteger(override) && override >= 0 && override <= 50)
    return override;
  const native = Number(owner?.system?.attributes?.familiarAbilities?.value);
  return Number.isFinite(native) && native > 0 ? Math.floor(native) : 2;
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
  return (
    managed(item, owner) &&
    !(familiar.getFlag(MODULE_ID, "innateFamiliarItems") ?? []).includes(
      item.id,
    ) &&
    item.flags[MODULE_ID].familiarManaged.fingerprint ===
      familiarFingerprint(item)
  );
}
export async function familiarCatalog() {
  const response = await fetch(
    `modules/${MODULE_ID}/data/familiar-abilities.json`,
  );
  if (!response.ok) fail("FamiliarCatalogMissing");
  return (await response.json()).entries;
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
      const source = buildFamiliarSource(entry);
      delete source._id;
      source.flags[MODULE_ID].familiarManaged = {
        controllerActorId: owner.id,
        fingerprint: familiarFingerprint(source),
      };
      return source;
    });
  if (toCreate.length) {
    const created = await familiar.createEmbeddedDocuments("Item", toCreate);
    // Система добавляет значения по умолчанию при создании. Снимок снимаем после неё.
    for (const item of created)
      await item.setFlag(MODULE_ID, "familiarManaged", {
        controllerActorId: owner.id,
        fingerprint: familiarFingerprint(item),
      });
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
  return {
    created: toCreate.length,
    removed: obsolete.length,
    protected: protectedItems.length,
  };
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
