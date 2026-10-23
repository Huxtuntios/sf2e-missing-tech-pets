// Проверяем и локальную сборку, и файлы, повторно скачанные из Assets релиза.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
const directory = path.resolve(
  process.argv[2] ?? path.join(import.meta.dirname, "../dist"),
);
const manifest = JSON.parse(
  await readFile(path.join(directory, "module.json"), "utf8"),
);
const tag = process.argv[3] ?? `v${manifest.version}`;
if (tag !== `v${manifest.version}`)
  throw new Error("Версия не совпадает с тегом");
if (manifest.id !== "sf2e-missing-tech-pets")
  throw new Error("Неверный ID модуля");
if (
  manifest.compatibility.minimum !== "14.361" ||
  manifest.compatibility.verified !== "14" ||
  manifest.compatibility.maximum !== "14"
)
  throw new Error("Ожидалась совместимость Foundry v14");
if (
  !manifest.relationships.requires.some(
    (dep) =>
      dep.id === "pf2e-animal-companions" &&
      dep.compatibility.minimum === "7.6.3",
  )
)
  throw new Error("Отсутствует обязательная зависимость 7.6.3");
if (!manifest.download.endsWith(`/releases/download/${tag}/module.zip`))
  throw new Error("Неверная ссылка скачивания");
const lines = (await readFile(path.join(directory, "SHA256SUMS.txt"), "utf8"))
  .trim()
  .split("\n");
if (lines.length !== 2) throw new Error("Ожидались две контрольные суммы");
const seen = new Set();
for (const line of lines) {
  const match = /^([a-f0-9]{64})  (module\.json|module\.zip)$/.exec(line);
  if (!match || seen.has(match[2]))
    throw new Error("Некорректный SHA256SUMS.txt");
  seen.add(match[2]);
  if (
    createHash("sha256")
      .update(await readFile(path.join(directory, match[2])))
      .digest("hex") !== match[1]
  )
    throw new Error("Не совпала SHA256: " + match[2]);
}
execFileSync(
  "python3",
  [
    "-c",
    String.raw`
import json,pathlib,sys,zipfile
folder=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(folder/'module.zip') as archive:
 assert archive.testzip() is None,'Повреждён ZIP'
 names=archive.namelist()
 assert len(names)==len(set(names)),'Повторяющиеся пути'
 assert all(not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts for p in names),'Небезопасный путь'
 assert archive.read('module.json')==(folder/'module.json').read_bytes(),'Манифесты различаются'
 manifest=json.loads(archive.read('module.json'))
 for pack in manifest['packs']:
  assert pack['system']=='sf2e' and pack['type']=='Item','Некорректный пак'
  assert pack['path']+'/CURRENT' in names,'Отсутствует готовый LevelDB'
 for script in manifest['esmodules']:assert script in names,'Отсутствует entrypoint'
 for language in manifest['languages']:assert language['path'] in names,'Отсутствует язык'
 for name in names:
  if name.endswith('.json'):json.loads(archive.read(name))
 assert len([p for p in names if p.startswith('packs/src/') and p.endswith('.json')])==53,'Неполные источники'
 assert not any(p.startswith(('node_modules/','.git/','.github/','tests/','tools/')) for p in names),'В ZIP попали файлы разработки'
`,
    directory,
  ],
  { stdio: "pipe" },
);
console.log(
  "Проверены SHA256, версия/тег, манифест, ZIP, четыре LevelDB-пака и 53 исходника Items.",
);
