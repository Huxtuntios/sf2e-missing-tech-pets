/**
 * Сборка компендиумов Minibot (только SF2e, контент Tech Core).
 * Independent Obstructobot намеренно исключён: он уже есть в системном паке sf2e.
 * Отдельный проход, не затрагивает дуальную сборку шасси/фамильяров.
 */
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  rename,
  stat,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack, extractPack } from "@foundryvtt/foundryvtt-cli";
import {
  buildMinibotCreatureSource,
  buildMinibotEquipmentSource,
  buildMinibotActionSource,
} from "./minibot-sources.mjs";
import { ownPackName } from "./system-context.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(
  await readFile(path.join(root, "data/minibots.json"), "utf8"),
);
const temporary = await mkdtemp(path.join(tmpdir(), "sfmtp-minibot-"));
const translationDir = path.join(root, "lang/babele/ru");
await mkdir(translationDir, { recursive: true });

const stableId = (prefix, slug) =>
  createHash("sha256")
    .update(`sf2e-missing-tech-pets:${prefix}:${slug}`)
    .digest("hex")
    .slice(0, 16);

const creature = buildMinibotCreatureSource(data.creature);
creature._id = stableId("minibot-creature", data.creature.slug);

const equipment = data.equipment.map((entry) => {
  const source = buildMinibotEquipmentSource(entry);
  source._id = stableId("minibot-equipment", entry.slug);
  return { source, entry };
});
const actions = data.actions.map((entry) => {
  const source = buildMinibotActionSource(entry);
  source._id = stableId("minibot-action", entry.slug);
  return { source, entry };
});

async function writePack(name, documents, { keyPrefix, labelRu, descPath, ru }) {
  if (new Set(documents.map((d) => d._id)).size !== documents.length)
    throw new Error(`Повторяющиеся ID: ${name}`);
  const sourceDir = path.join(root, "packs/src", name);
  await mkdir(sourceDir, { recursive: true });
  for (const document of documents)
    await writeFile(
      path.join(sourceDir, `${document.system.slug ?? "minibot"}.json`),
      JSON.stringify(document, null, 2) + "\n",
    );
  await writeFile(
    path.join(root, "packs", `${name}.db`),
    documents.map((d) => JSON.stringify(d)).join("\n") + "\n",
  );
  await writeFile(
    path.join(translationDir, `sf2e-missing-tech-pets.${name}.json`),
    JSON.stringify(
      {
        label: labelRu,
        mapping: { name: "name", description: descPath },
        entries: Object.fromEntries(
          documents.map((d) => [d._id, ru(d)]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  const compilerSources = path.join(temporary, `${name}-input`);
  await mkdir(compilerSources);
  for (const document of documents)
    await writeFile(
      path.join(compilerSources, `${document._id}.json`),
      JSON.stringify({ ...document, _key: `${keyPrefix}${document._id}` }),
    );
  const staged = path.join(temporary, name);
  await compilePack(compilerSources, staged, { log: false });
  const verification = path.join(temporary, `${name}-verification`);
  await extractPack(staged, verification, { log: false });
  const extracted = (await readdir(verification)).filter((file) =>
    file.endsWith(".json"),
  );
  if (extracted.length !== documents.length)
    throw new Error(`Пустой или неполный LevelDB: ${name}`);
  for (const file of extracted) {
    const document = JSON.parse(
      await readFile(path.join(verification, file), "utf8"),
    );
    delete document._key;
    const expected = documents.find((d) => d._id === document._id);
    if (JSON.stringify(document) !== JSON.stringify(expected))
      throw new Error(`Не совпал документ: ${name}/${document._id}`);
  }
  const destination = path.join(root, "packs", name);
  if (await stat(destination).catch(() => null))
    await rename(destination, path.join(temporary, `${name}-previous`));
  await rename(staged, destination);
  console.log(`${name}: ${documents.length} документов; JSON, NeDB и LevelDB`);
}

const itemDocuments = [...equipment, ...actions].map(({ source }) => source);
const ruBySlug = Object.fromEntries(
  [...data.equipment, ...data.actions].map((entry) => [entry.slug, entry]),
);

// Документы Minibot не содержат системных RE/UUID, поэтому идентичны для SF2e и
// PF2e (PF2e использует контент через SF2e Anachronism). Паки различаются именем.
for (const system of ["sf2e", "pf2e"]) {
  await writePack(ownPackName("minibot-creature", system), [creature], {
    keyPrefix: "!actors!",
    labelRu: "Существо минибот — Tech Pets",
    descPath: "system.details.publicNotes",
    ru: () => ({ name: data.creature.nameRu, description: data.creature.descriptionRu }),
  });
  await writePack(ownPackName("minibots", system), itemDocuments, {
    keyPrefix: "!items!",
    labelRu: "Миниботы — Tech Pets",
    descPath: "system.description.value",
    ru: (document) => {
      const entry = ruBySlug[document.system.slug];
      return { name: entry.nameRu, description: entry.descriptionRu };
    },
  });
}