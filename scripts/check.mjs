// Статическая проверка файлов проекта; она не заменяет запуск в Foundry.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await files(filename)));
    else if (entry.isFile()) result.push(filename);
  }
  return result;
}
const all = await files(root);
const jsonFiles = all.filter((filename) => filename.endsWith(".json"));
for (const filename of jsonFiles) JSON.parse(await readFile(filename, "utf8"));
const modules = all.filter((filename) => filename.endsWith(".mjs"));
for (const filename of modules)
  execFileSync(process.execPath, ["--check", filename], { stdio: "pipe" });
const en = JSON.parse(await readFile(path.join(root, "lang/en.json"), "utf8"));
const ru = JSON.parse(await readFile(path.join(root, "lang/ru.json"), "utf8"));
assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
for (const filename of modules.filter((name) =>
  name.includes(`${path.sep}scripts${path.sep}`),
)) {
  const source = await readFile(filename, "utf8");
  for (const match of source.matchAll(/\bt\("([^"]+)"\)/g)) {
    assert.ok(
      en[`SFMTP.${match[1]}`],
      `Нет локализации: ${match[1]} (${filename})`,
    );
  }
}
console.log(
  `JSON: ${jsonFiles.length}; синтаксис ES modules: ${modules.length}; EN/RU: ${Object.keys(en).length} одинаковых ключей.`,
);
