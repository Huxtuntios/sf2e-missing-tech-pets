/**
 * Сборка в новом временном каталоге, затем замена только сгенерированных паков.
 * Резервные LevelDB-копии остаются во временном каталоге системы.
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
  buildChassisSource,
  buildManeuverSource,
  buildSupportSource,
} from "./item-sources.mjs";

import { buildCustomizationSource } from "./customization-sources.mjs";
import { buildFamiliarSource } from "./familiar-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  await readFile(path.join(root, "data/robot-chassis.json"), "utf8"),
);
const familiars = JSON.parse(
  await readFile(path.join(root, "data/familiar-abilities.json"), "utf8"),
);
const customizations = JSON.parse(
  await readFile(path.join(root, "data/robot-customizations.json"), "utf8"),
);
const temporary = await mkdtemp(path.join(tmpdir(), "sfmtp-build-"));
const definitions = [
  {
    name: "robot-customizations",
    prefix: "customization",
    builder: buildCustomizationSource,
    entries: customizations.entries,
  },
  { name: "robot-chassis", prefix: "chassis", builder: buildChassisSource },
  {
    name: "robot-advanced-maneuvers",
    prefix: "maneuver",
    builder: buildManeuverSource,
  },
  { name: "robot-support", prefix: "support", builder: buildSupportSource },
  {
    name: "familiar-abilities",
    prefix: "familiar",
    builder: buildFamiliarSource,
    entries: familiars.entries,
  },
];
if (catalog.entries.length !== 5)
  throw new Error("В каталоге должно быть пять шасси");
for (const {
  name,
  prefix,
  builder,
  entries = catalog.entries,
} of definitions) {
  const sourceDir = path.join(root, "packs/src", name);
  await mkdir(sourceDir, { recursive: true });
  const items = entries.map((entry) => {
    if (
      !["familiar", "customization"].includes(prefix) &&
      (!entry.advancedManeuverId || !entry.advancedManeuverDescription)
    )
      throw new Error(`Не описан манёвр: ${entry.id}`);
    const source = builder(entry);
    const stableKey =
      prefix === "maneuver" ? entry.advancedManeuverId : entry.id;
    source._id = createHash("sha256")
      .update(`sf2e-missing-tech-pets:${prefix}:${stableKey}`)
      .digest("hex")
      .slice(0, 16);
    return source;
  });
  if (new Set(items.map((item) => item._id)).size !== entries.length)
    throw new Error(`Повторяющиеся ID: ${name}`);
  for (const item of items)
    await writeFile(
      path.join(sourceDir, `${item.system.slug}.json`),
      JSON.stringify(item, null, 2) + "\n",
    );
  await writeFile(
    path.join(root, "packs", `${name}.db`),
    items.map((item) => JSON.stringify(item)).join("\n") + "\n",
  );
  // CLI пропускает документы без _key. Ключ нужен только промежуточному источнику,
  // а в обычные JSON/резервный Item его не добавляем.
  const compilerSources = path.join(temporary, `${name}-input`);
  await mkdir(compilerSources);
  for (const item of items)
    await writeFile(
      path.join(compilerSources, `${item._id}.json`),
      JSON.stringify({ ...item, _key: `!items!${item._id}` }),
    );
  const staged = path.join(temporary, name);
  await compilePack(compilerSources, staged, { log: false });
  const verification = path.join(temporary, `${name}-verification`);
  await extractPack(staged, verification, { log: false });
  const extracted = (await readdir(verification)).filter((file) =>
    file.endsWith(".json"),
  );
  if (extracted.length !== items.length)
    throw new Error(`Пустой или неполный LevelDB: ${name}`);
  for (const file of extracted) {
    const document = JSON.parse(
      await readFile(path.join(verification, file), "utf8"),
    );
    delete document._key;
    const expected = items.find((item) => item._id === document._id);
    if (JSON.stringify(document) !== JSON.stringify(expected))
      throw new Error(`Не совпал документ: ${name}/${document._id}`);
  }
  const destination = path.join(root, "packs", name);
  if (await stat(destination).catch(() => null))
    await rename(destination, path.join(temporary, `${name}-previous`));
  await rename(staged, destination);
  console.log(`${name}: ${items.length} предметов; JSON, NeDB и LevelDB`);
}
