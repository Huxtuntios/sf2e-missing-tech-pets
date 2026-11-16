import { validateUpdateManifest } from "./release-manifest.mjs";
// Проверяем и локальную сборку, и файлы, повторно скачанные из Assets релиза.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { referencePattern } from "./reference-check.mjs";
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
  !manifest.relationships.recommends.some(
    (dep) =>
      dep.id === "pf2e-animal-companions" &&
      dep.compatibility.minimum === "7.6.3",
  )
)
  throw new Error("Отсутствует рекомендуемая интеграция Companion Compendia 7.6.3");
validateUpdateManifest(manifest, { expectedVersion: tag.slice(1) });
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
  process.platform === "win32" ? "python" : "python3",
  [
    "-c",
    String.raw`
import json,pathlib,sys,zipfile,re
folder=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(folder/'module.zip') as archive:
 assert archive.testzip() is None,'Повреждён ZIP'
 names=archive.namelist()
 assert len(names)==len(set(names)),'Повторяющиеся пути'
 assert all(not p.startswith('/') and '..' not in pathlib.PurePosixPath(p).parts for p in names),'Небезопасный путь'
 assert archive.read('module.json')==(folder/'module.json').read_bytes(),'Манифесты различаются'
 manifest=json.loads(archive.read('module.json'))
 for pack in manifest['packs']:
  assert pack['system'] in ['sf2e','pf2e'] and pack['type']=='Item','Некорректный пак'
  current=pack['path']+'/CURRENT'
  assert current in names,'Отсутствует готовый LevelDB'
  target=archive.read(current).decode().strip()
  assert target.startswith('MANIFEST-') and '/' not in target and pack['path']+'/'+target in names,'Некорректный CURRENT'
  translation='lang/babele/ru/'+manifest['id']+'.'+pack['name']+'.json'
  assert translation in names,'Отсутствует перевод пака'
  payload=json.loads(archive.read(translation))
  assert payload['mapping']=={'name':'name','description':'system.description.value'},'Перевод меняет технические поля'
  source_prefix='packs/src/'+pack['name']+'/'
  ids={json.loads(archive.read(p))['_id'] for p in names if p.startswith(source_prefix) and p.endswith('.json')}
  assert set(payload['entries'])==ids,'Не совпали ID переводов'
 assert 'data/ru-content.json' in names,'Отсутствует русский каталог'
 for script in manifest['esmodules']:assert script in names,'Отсутствует entrypoint'
 for script in ['content-localization.mjs','babele.mjs','customization-sources.mjs','dailies.mjs','sheet-integration.mjs','exocortex-rules.mjs','exocortex.mjs','exocortex-ui.mjs','companion-sources.mjs','companion-sources-ui.mjs']:assert 'scripts/'+script in names,'Отсутствует экзокортекс: '+script
 for language in manifest['languages']:assert language['path'] in names,'Отсутствует язык'
 for name in names:
  if pathlib.PurePosixPath(name).suffix in ['.json','.db','.mjs','.md','.txt','.css','.html','.svg']:
   assert re.search(sys.argv[2],archive.read(name).decode('utf-8'),re.I) is None,'External rules reference: '+name
  if name.endswith('.json'):json.loads(archive.read(name))
  if name.startswith('packs/src/') and name.endswith('.json'):
   item=json.loads(archive.read(name))
   image=item.get('img','')
   prefix='modules/'+manifest['id']+'/'
   if image.startswith(prefix):
    assert image[len(prefix):] in names,'Отсутствует встроенная иконка: '+image
 for language in manifest['languages']:
  translations=json.loads(archive.read(language['path']))
  assert isinstance(translations.get('SFMTP',{}).get('ManualActionHint'),str),'Не разрешается ключ Foundry SFMTP.ManualActionHint'
 assert len([p for p in names if p.startswith('packs/src/') and p.endswith('.json')])==178,'Неполные источники'
 assert not any(p.startswith(('node_modules/','.git/','.github/','tests/','tools/')) for p in names),'В ZIP попали файлы разработки'
 assert not any(pathlib.PurePosixPath(p).name in ['LOG','LOG.old','LOCK'] or p.endswith(('.dbtmp','-wal','-shm')) for p in names),'В ZIP попали временные файлы базы'
 assert 'docs/AUDIT-1.7.0.md' in names,'Отсутствует отчёт проверки кандидата'
`,
    directory,
    referencePattern.source,
  ],
  { stdio: "pipe" },
);
console.log(
  "Проверены SHA256, версия/тег, манифест, ZIP, десять LevelDB-паков и 178 исходников Items.",
);
