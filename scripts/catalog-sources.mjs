import {
  MODULE_ID,
  buildChassisSource,
  buildSupportSource,
  buildManeuverSource,
} from "./item-sources.mjs";
import { buildCustomizationSource } from "./customization-sources.mjs";
import { buildFamiliarSource } from "./familiar-sources.mjs";
import { ownPackName, systemId } from "./system-context.mjs";
import { t } from "./i18n.mjs";
import { localizeItemSource } from "./content-localization.mjs";

const builders = {
  "robot-chassis": buildChassisSource,
  "robot-support": buildSupportSource,
  "robot-advanced-maneuvers": buildManeuverSource,
  "robot-customizations": buildCustomizationSource,
  "familiar-abilities": buildFamiliarSource,
};
export async function catalogDocument(category, entry) {
  const builder = Object.hasOwn(builders, category) ? builders[category] : null;
  if (!builder || !entry) throw new Error(t("SourceUnavailable"));
  const source = localizeItemSource(builder(entry, systemId()), category, entry);
  const collection = `${MODULE_ID}.${ownPackName(category)}`;
  const pack = game.packs?.get(collection);
  if (pack) {
    try {
      const index = await pack.getIndex({ fields: ["type", "system.slug"] });
      const match = index.find(
        (item) => item.type === source.type && item.system?.slug === source.system.slug,
      );
      const document = match ? await pack.getDocument(match._id) : null;
      if (document) {
        const original = document.toObject();
        const translated = localizeItemSource(original, category, entry);
        return translated.name === original.name && translated.system.description.value === original.system.description.value
          ? document : new CONFIG.Item.documentClass(translated);
      }
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not read ${collection}; showing catalog data.`, error);
    }
  }
  return new CONFIG.Item.documentClass(source);
}
export async function openCatalogSource(category, entry) {
  const document = await catalogDocument(category, entry);
  return document.sheet.render(true);
}
