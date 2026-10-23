import { t } from "./i18n.mjs";
import { TechPetsDialog } from "./dialog.mjs";
import { escapeHTML as esc } from "./item-sources.mjs";
import {
  assertFamiliarAccess,
  linkedFamiliars,
  familiarCatalog,
  savePetProfile,
} from "./familiars.mjs";
import {
  COMPANION_SOURCES,
  SOURCE_FLAG,
  ownedCompanionSources,
  sourceWarnings,
} from "./companion-sources.mjs";
// Профиль Pet — учёт, а не familiar-актор с неподходящим расчётом характеристик.
export async function openCompanionSources(owner) {
  try {
    assertFamiliarAccess(owner);
  } catch (error) {
    return ui.notifications.error(error.message);
  }
  if (owner.type !== "character") return;
  const owned = ownedCompanionSources(owner);
  const counts = owner.getFlag(SOURCE_FLAG, "sourceCounts") ?? {};
  const pet = owner.getFlag(SOURCE_FLAG, "petProfile") ?? {};
  const catalog = (await familiarCatalog()).filter(
    (entry) => entry.category === "pet",
  );
  const conflict = linkedFamiliars(owner).length > 0;
  const warnings = sourceWarnings(owner);
  if (pet.enabled && conflict) warnings.push("SourcePetConflict");
  const rows = COMPANION_SOURCES.map((entry) => {
    const match = owned.find((row) => row.slug === entry.slug);
    return `<tr><td>${esc(t(`SourceNames.${entry.slug}`))}</td><td>${esc(t(`SourceKinds.${entry.kind}`))}</td><td>${esc(t(match ? "SourceOwned" : "SourceAbsent"))}</td><td><a href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">${esc(t("Source"))}</a>${match || entry.uuid ? ` <button type="button" data-source-open="${esc(entry.slug)}">${esc(t("SourceOpen"))}</button>` : ""}${match && entry.repeat ? `<label>${esc(t("SourceCount"))} <input type="number" data-source-count="${esc(entry.slug)}" min="1" max="3" value="${esc(counts[entry.slug] ?? 1)}"></label>` : ""}</td></tr>`;
  }).join("");
  const content = `<div class="sfmtp-sources"><h3>${esc(owner.name)}</h3><p>${esc(t("SourceHint"))}</p>${warnings.map((key) => `<p class="hint">${esc(t(key))}</p>`).join("")}<table><thead><tr><th>${esc(t("Source"))}</th><th>${esc(t("SourceRole"))}</th><th>${esc(t("SourceStatus"))}</th><th>${esc(t("SourceOpen"))}</th></tr></thead><tbody>${rows}</tbody></table><p class="hint">${esc(t("SourceCountsHint"))}</p><button type="button" data-source-save>${esc(t("SourceSaveCounts"))}</button><hr><h3>${esc(t("PetProfileTitle"))}</h3><p>${esc(t("PetProfileHint"))}</p><p>${esc(t("PetRulesHint"))}</p><label><input type="checkbox" name="pet-enabled" ${pet.enabled ? "checked" : ""}> ${esc(t("PetEnabled"))}</label><label>${esc(t("PetName"))}<input name="pet-name" value="${esc(pet.name ?? "")}"></label><p>${esc(t("PetAbilitiesHint"))}</p>${catalog.map((entry) => `<label class="sfmtp-pet-ability"><input type="checkbox" name="pet-ability" value="${esc(entry.id)}" ${(pet.abilities ?? []).includes(entry.id) ? "checked" : ""}> ${esc(entry.name)} <a href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(t("Source"))}</a></label>`).join("")}<p class="hint">${esc(t("PetInnateHint"))}</p><button type="button" data-pet-save>${esc(t("PetSave"))}</button><hr><p>${esc(t("SourceOtherCompanions"))}</p><a href="https://2e.aonsrd.com/rules/1311-companions" target="_blank" rel="noopener noreferrer">${esc(t("Source"))}</a></div>`;
  return new TechPetsDialog(
    {
      title: t("SourceTitle"),
      content,
      buttons: { close: { label: t("Close") } },
      render: (html) => {
        html.find("[data-source-open]").on("click", async (event) => {
          const slug = event.currentTarget.dataset.sourceOpen;
          const entry = COMPANION_SOURCES.find((row) => row.slug === slug);
          let item = owned.find((row) => row.slug === slug)?.items[0];
          try {
            item ??= entry.uuid ? await fromUuid(entry.uuid) : null;
          } catch {
            /* Отсутствующий Item не заменяем предметом другой системы. */
          }
          if (item?.sheet) item.sheet.render(true);
          else ui.notifications.warn(t("SourceUnavailable"));
        });
        html.find("[data-source-save]").on("click", async () => {
          assertFamiliarAccess(owner);
          const next = {
            ...(owner.getFlag(SOURCE_FLAG, "sourceCounts") ?? {}),
          };
          for (const entry of owned.filter((row) => row.repeat)) {
            const number = Number(
              html.find(`[data-source-count="${entry.slug}"]`).val(),
            );
            if (
              !Number.isInteger(number) ||
              number < 1 ||
              number > entry.repeat
            )
              return ui.notifications.warn(t("SourceCountInvalid"));
            next[entry.slug] = number;
          }
          await owner.setFlag(SOURCE_FLAG, "sourceCounts", next);
          ui.notifications.info(t("SourceSaved"));
        });
        html.find("[data-pet-save]").on("click", async () => {
          const enabled = html.nodes[0].querySelector(
            '[name="pet-enabled"]',
          )?.checked;
          const abilities = [
            ...html.nodes[0].querySelectorAll('[name="pet-ability"]:checked'),
          ].map((element) => element.value);
          try {
            await savePetProfile(owner, {
              enabled,
              name: html.find('[name="pet-name"]').val(),
              abilities,
            });
            ui.notifications.info(t("SourceSaved"));
          } catch (error) {
            ui.notifications.warn(error.message);
          }
        });
      },
    },
    { width: 820 },
  ).render(true);
}
