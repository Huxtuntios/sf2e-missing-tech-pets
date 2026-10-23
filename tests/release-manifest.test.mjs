// Публичный endpoint подменён; эти тесты не публикуют релизы в GitHub.
import test from "node:test";
import assert from "node:assert/strict";
import { validateUpdateManifest } from "../tools/release-manifest.mjs";
import { checkPublishedRelease } from "../tools/check-published-release.mjs";
const repository = "Huxtuntios/sf2e-missing-tech-pets";
const base = `https://github.com/${repository}`;
const manifest = {
  id: "sf2e-missing-tech-pets",
  version: "0.16.2",
  url: base,
  manifest: `${base}/releases/latest/download/module.json`,
  download: `${base}/releases/download/v0.16.2/module.zip`,
};
test("Адрес обновления остаётся latest, скачивание привязано к той же версии", () => {
  assert.equal(validateUpdateManifest(manifest).version, "0.16.2");
  assert.throws(
    () =>
      validateUpdateManifest({
        ...manifest,
        manifest: `${base}/releases/download/v0.16.0/module.json`,
      }),
    /latest/,
  );
  assert.throws(
    () =>
      validateUpdateManifest({
        ...manifest,
        download: `${base}/releases/download/v0.16.0/module.zip`,
      }),
    /той же версии/,
  );
  assert.throws(
    () => validateUpdateManifest(manifest, { expectedVersion: "0.16.3" }),
    /GitHub latest отдаёт/,
  );
});
test("Проверка опубликованного endpoint обнаруживает устаревший latest", async () => {
  let requested;
  const old = {
    ...manifest,
    version: "0.16.0",
    download: `${base}/releases/download/v0.16.0/module.zip`,
  };
  await assert.rejects(
    checkPublishedRelease({
      repository,
      expectedVersion: "0.16.2",
      fetcher: async (url) => {
        requested = url;
        return { ok: true, json: async () => old };
      },
    }),
    /latest отдаёт 0.16.0/,
  );
  assert.equal(requested, manifest.manifest);
});
test("После обновления latest проверка подтверждает версию, HTTP 404 не маскируется", async () => {
  let requests = 0;
  const result = await checkPublishedRelease({
    repository,
    expectedVersion: "0.16.2",
    attempts: 2,
    fetcher: async () =>
      ++requests === 1
        ? { ok: false, status: 404 }
        : { ok: true, json: async () => manifest },
  });
  assert.equal(result.version, "0.16.2");
  assert.equal(requests, 2);
});
