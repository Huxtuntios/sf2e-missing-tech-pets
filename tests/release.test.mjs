// Проверки комплекта публикации без обращения к GitHub.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
const manifest = JSON.parse(read("module.json"));
const run = (...args) =>
  execFileSync(process.execPath, ["tools/build-release.mjs", ...args], {
    stdio: "pipe",
  });
test("Манифест, npm и lockfile согласованы", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(pkg.version, manifest.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.equal(
    manifest.url,
    "https://github.com/Huxtuntios/sf2e-missing-tech-pets",
  );
  assert.equal(manifest.authors[0].name, "Huxtuntios");
  assert.deepEqual(
    new Set(manifest.packFolders.flatMap((folder) => folder.packs)),
    new Set(manifest.packs.map((pack) => pack.name)),
  );
});
test("Релизный ZIP воспроизводим и проверяется штатным инструментом", () => {
  run();
  const hash = () =>
    createHash("sha256").update(read("dist/module.zip")).digest("hex");
  const first = hash();
  run();
  assert.equal(hash(), first);
  execFileSync(process.execPath, ["tools/verify-release.mjs"], {
    stdio: "pipe",
  });
});
test("Несовпадающий тег отклоняется до изменения готовых assets", () => {
  const before = read("dist/module.json");
  const result = spawnSync(
    process.execPath,
    ["tools/build-release.mjs", "--tag", "v999.0.0"],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Тег релиза должен совпадать/);
  assert.deepEqual(read("dist/module.json"), before);
});
test("Адреса assets берутся из репозитория, исходный манифест не изменяется", () => {
  const before = read("module.json");
  try {
    run("--repo", "ExampleOwner/example-module");
    const built = JSON.parse(read("dist/module.json"));
    assert.equal(built.url, "https://github.com/ExampleOwner/example-module");
    assert.equal(
      built.download,
      `${built.url}/releases/download/v${manifest.version}/module.zip`,
    );
    assert.deepEqual(read("module.json"), before);
  } finally {
    run();
  }
});
