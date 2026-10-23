// Панель не заменяет системный лист: все броски и подготовка характеристик остаются в SF2e.
import { TechPetsDialog } from "./dialog.mjs";
import { MODULE_ID, escapeHTML as esc } from "./item-sources.mjs";
import {
  assertFamiliarAccess,
  familiarOwner,
  linkedFamiliars,
  linkFamiliar,
  createFamiliar,
  familiarAllowance,
  familiarAbilityItems,
  familiarCanRemove,
  familiarCatalog,
  syncFamiliarAbilities,
  setInnateFamiliarItems,
} from "./familiars.mjs";
const t = (key) => game.i18n.localize(`SFMTP.${key}`);
export async function openFamiliarManager(actor, chosenId = "") {
  try {
    assertFamiliarAccess(actor);
  } catch (error) {
    return ui.notifications.error(error.message);
  }
  const owner = familiarOwner(actor);
  if (!owner) return ui.notifications.warn(t("FamiliarNoMaster"));
  const linked = linkedFamiliars(owner);
  const familiar =
    actor.type === "familiar"
      ? actor
      : (linked.find((a) => a.id === chosenId) ??
        (linked.length === 1 ? linked[0] : null));
  const catalog = await familiarCatalog();
  const all = familiar ? familiarAbilityItems(familiar) : [];
  const innate = familiar?.getFlag(MODULE_ID, "innateFamiliarItems") ?? [];
  const ability = familiar?.system?.master?.ability ?? "int";
  const candidates = Array.from(game.actors).filter(
    (a) =>
      a.type === "familiar" &&
      a.isOwner !== false &&
      (!a.system?.master?.id || a.system.master.id === owner.id),
  );
  const attributes = Object.keys(owner.system?.abilities ?? {}).filter((key) =>
    ["str", "dex", "con", "int", "wis", "cha"].includes(key),
  );
  const installed = all
    .map(
      (item) =>
        `<div class="sfmtp-mod-row"><label><input type="checkbox" data-innate="${esc(item.id)}" ${innate.includes(item.id) ? "checked" : ""}> ${esc(t("FamiliarInnate"))}</label><span>${esc(item.name)}</span><button type="button" data-familiar-item="${esc(item.id)}">${esc(t("FamiliarOpenItem"))}</button><button type="button" data-familiar-chat="${esc(item.id)}">${esc(t("SendToChat"))}</button></div>`,
    )
    .join("");
  const rows = catalog
    .map((entry) => {
      const matches = all.filter((item) => item.system?.slug === entry.id);
      const protectedItem = matches.some(
        (item) => !familiarCanRemove(item, owner, familiar),
      );
      return `<details data-familiar-row="${esc(entry.name.toLowerCase())}" class="sfmtp-familiar-entry"><summary><label><input type="checkbox" name="familiar-selection" value="${esc(entry.id)}" ${matches.length ? "checked" : ""} ${protectedItem || !familiar ? "disabled" : ""}> ${esc(entry.name)}</label> <small>${esc(t(`Category.${entry.category}`))} · ${esc(t(entry.automation === "rules" ? "FamiliarRulesShort" : "FamiliarManualShort"))}${protectedItem ? ` · ${esc(t("FamiliarProtected"))}` : ""}</small></summary><p>${esc(entry.description)}</p><p>${esc(t(entry.automation === "rules" ? "FamiliarRules" : "FamiliarManual"))}</p>${entry.prerequisites.length ? `<p>${esc(t("FamiliarRequires"))}: ${entry.prerequisites.map((id) => esc(catalog.find((e) => e.id === id)?.name ?? id)).join(", ")}</p>` : ""}<a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t("Source"))}</a></details>`;
    })
    .join("");
  const content = `<div class="sfmtp-familiars"><h3>${esc(owner.name)}</h3><p>${esc(t("FamiliarNativeHint"))}</p>${linked.length > 1 && !familiar ? `<p>${esc(t("FamiliarAmbiguous"))}</p>` : ""}<div class="form-group"><label>${esc(t("FamiliarActor"))}</label><select name="native-familiar"><option value="">—</option>${candidates.map((a) => `<option value="${esc(a.id)}" ${a.id === familiar?.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></div><div class="form-group"><label>${esc(t("FamiliarAttribute"))}</label><select name="familiar-attribute">${attributes.map((key) => `<option value="${key}" ${key === ability ? "selected" : ""}>${esc(t(`FamiliarAttribute.${key}`))}</option>`).join("")}</select></div><div class="sfmtp-action-row"><button type="button" data-familiar-link>${esc(t("FamiliarLink"))}</button><button type="button" data-familiar-create ${linked.length ? "disabled" : ""}>${esc(t("FamiliarCreate"))}</button>${familiar ? `<button type="button" data-familiar-sheet>${esc(t("FamiliarOpenSheet"))}</button>` : ""}</div>${familiar ? `<p>${esc(t("FamiliarSlots"))}: ${all.length} / ${familiarAllowance(owner, familiar)}</p><label>${esc(t("FamiliarOverride"))} <input name="familiar-allowance" type="number" min="0" max="50" value="${esc(familiar.getFlag(MODULE_ID, "familiarAllowance") ?? "")}" placeholder="${familiarAllowance(owner, familiar)}"></label><button type="button" data-familiar-allowance>${esc(t("FamiliarSaveAllowance"))}</button><p class="hint">${esc(t("FamiliarAllowanceHint"))}</p>${installed}<button type="button" data-save-innate>${esc(t("FamiliarSaveInnate"))}</button><p class="hint">${esc(t("FamiliarInnateHint"))}</p><button type="button" data-familiar-legacy>${esc(t("FamiliarLegacy"))}</button>` : ""}<hr><label>${esc(t("Search"))} <input type="search" name="familiar-query"></label><div class="sfmtp-familiar-list">${rows}</div><p class="hint">${esc(t("FamiliarSelectionHint"))}</p></div>`;
  new TechPetsDialog(
    {
      title: t("FamiliarTitle"),
      content,
      buttons: {
        save: {
          label: t("FamiliarSaveDaily"),
          callback: async (html) => {
            if (!familiar) return ui.notifications.warn(t("FamiliarNoMaster"));
            const root = html.nodes[0];
            const selected = [
              ...root.querySelectorAll('[name="familiar-selection"]:checked'),
            ].map((e) => e.value);
            try {
              await syncFamiliarAbilities(owner, familiar, selected);
              ui.notifications.info(t("FamiliarSaved"));
            } catch (error) {
              ui.notifications.error(error.message);
            }
          },
        },
        close: { label: t("Close") },
      },
      render: (html) => {
        const root = html.nodes[0];
        const run = async (fn) => {
          try {
            await fn();
          } catch (error) {
            ui.notifications.error(error.message);
          }
        };
        const reopen = () => openFamiliarManager(owner, familiar?.id);
        html.find('[name="native-familiar"]').on("change", (event) => {
          const next = game.actors.get(event.currentTarget.value);
          if (next?.system.master.id === owner.id)
            return openFamiliarManager(owner, next.id);
        });
        html.find("[data-familiar-link]").on("click", () =>
          run(async () => {
            const target = game.actors.get(
              html.find('[name="native-familiar"]').val(),
            );
            await linkFamiliar(
              owner,
              target,
              html.find('[name="familiar-attribute"]').val(),
            );
            await openFamiliarManager(owner, target.id);
          }),
        );
        html.find("[data-familiar-create]").on("click", () =>
          run(async () => {
            const target = await createFamiliar(
              owner,
              html.find('[name="familiar-attribute"]').val(),
            );
            await openFamiliarManager(owner, target.id);
          }),
        );
        html
          .find("[data-familiar-sheet]")
          .on("click", () => familiar?.sheet.render(true));
        html
          .find("[data-familiar-item]")
          .on("click", (event) =>
            familiar.items
              .get(event.currentTarget.dataset.familiarItem)
              ?.sheet.render(true),
          );
        html
          .find("[data-familiar-chat]")
          .on("click", (event) =>
            familiar.items
              .get(event.currentTarget.dataset.familiarChat)
              ?.toMessage(),
          );
        html.find("[data-save-innate]").on("click", () =>
          run(async () => {
            await setInnateFamiliarItems(
              familiar,
              [...root.querySelectorAll("[data-innate]:checked")].map(
                (e) => e.dataset.innate,
              ),
            );
            await reopen();
          }),
        );
        html.find("[data-familiar-allowance]").on("click", () =>
          run(async () => {
            const value = html.find('[name="familiar-allowance"]').val().trim();
            if (!value)
              await familiar.unsetFlag(MODULE_ID, "familiarAllowance");
            else {
              const n = Number(value);
              if (!Number.isInteger(n) || n < 0 || n > 50)
                throw new Error(t("FamiliarSelectionInvalid"));
              await familiar.setFlag(MODULE_ID, "familiarAllowance", n);
            }
            await reopen();
          }),
        );
        html.find('[name="familiar-query"]').on("input", (event) => {
          for (const row of root.querySelectorAll("[data-familiar-row]"))
            row.hidden = !row.dataset.familiarRow.includes(
              event.currentTarget.value.trim().toLowerCase(),
            );
        });
        html.find("[data-familiar-legacy]").on("click", () => {
          const old =
            owner.getFlag(MODULE_ID, "robot")?.familiarAbilities ?? [];
          for (const input of root.querySelectorAll(
            '[name="familiar-selection"]',
          ))
            if (
              !input.disabled &&
              old.some((entry) => entry.catalogId === input.value)
            )
              input.checked = true;
          ui.notifications.info(t("FamiliarLegacyHint"));
        });
      },
    },
    { width: 850, height: 720 },
  ).render(true);
}
