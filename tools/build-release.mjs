// Релизные адреса берутся из фактического репозитория; исходники не перезаписываются.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--"))
    throw new Error(`Нет значения ${name}`);
  return args[index + 1];
}
const repository = option("--repo", "Huxtuntios/sf2e-missing-tech-pets");
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))
  throw new Error("Ожидается OWNER/REPOSITORY");
const manifest = JSON.parse(
  await readFile(path.join(root, "module.json"), "utf8"),
);
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (manifest.version !== pkg.version)
  throw new Error("Версии module.json и package.json не совпадают");
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version))
  throw new Error("Некорректная версия");
const tag = option("--tag", `v${manifest.version}`);
if (tag !== `v${manifest.version}`)
  throw new Error(
    "Тег релиза должен совпадать с версией: v" + manifest.version,
  );
const url = `https://github.com/${repository}`;
Object.assign(manifest, {
  url,
  manifest: `${url}/releases/latest/download/module.json`,
  download: `${url}/releases/download/${tag}/module.zip`,
  bugs: `${url}/issues`,
  changelog: `${url}/blob/main/CHANGELOG.md`,
});
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
await writeFile(
  path.join(dist, "module.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
// Стандартная библиотека Python: детерминированный ZIP без дополнительной npm-зависимости.
execFileSync(
  "python3",
  [
    "-c",
    String.raw`
import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1]);dist=pathlib.Path(sys.argv[2])
files=['module.json','module.css','README.md','README.ru.md','CHANGELOG.md','LICENSE.txt','docs/RELEASING.md','docs/RELEASE-NOTES.md']
files += ['scripts/'+s for s in ['main.mjs','dialog.mjs','item-sources.mjs','familiars.mjs','familiar-ui.mjs','familiar-sources.mjs','i18n.mjs','exocortex-rules.mjs','exocortex.mjs','exocortex-ui.mjs']]
for folder in ['assets','data','lang','packs']:
 for p in (root/folder).rglob('*'):
  if p.is_file() and not p.is_symlink() and p.name not in ['LOG','LOG.old','LOCK']:
   files.append(p.relative_to(root).as_posix())
with zipfile.ZipFile(dist/'module.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
 for name in sorted(set(files)):
  data=((dist if name=='module.json' else root)/name).read_bytes()
  info=zipfile.ZipInfo(name,date_time=(2020,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  archive.writestr(info,data,compresslevel=9)
`,
    root,
    dist,
  ],
  { stdio: "pipe" },
);
const sums = [];
for (const file of ["module.json", "module.zip"])
  sums.push(
    `${createHash("sha256")
      .update(await readFile(path.join(dist, file)))
      .digest("hex")}  ${file}`,
  );
await writeFile(path.join(dist, "SHA256SUMS.txt"), sums.join("\n") + "\n");
await writeFile(
  path.join(dist, "RELEASE-NOTES.md"),
  await readFile(path.join(root, "docs/RELEASE-NOTES.md")),
);
execFileSync(
  process.execPath,
  [path.join(root, "tools/verify-release.mjs"), dist, tag],
  { stdio: "inherit" },
);
console.log(
  `Релиз ${tag}: dist/module.json, module.zip, SHA256SUMS.txt, RELEASE-NOTES.md`,
);
