// Проверка публичного endpoint после загрузки Assets; она ничего не публикует.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateUpdateManifest } from "./release-manifest.mjs";
export async function checkPublishedRelease({
  repository,
  expectedVersion,
  fetcher = fetch,
  attempts = 1,
  delay = 0,
}) {
  const url = `https://github.com/${repository}/releases/latest/download/module.json`;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(url, {
        headers: { "Cache-Control": "no-cache", Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new Error(`Не удалось получить ${url}: HTTP ${response.status}`);
      return validateUpdateManifest(await response.json(), {
        repository,
        expectedVersion,
      });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts)
        await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const repository = process.env.GH_REPO;
  const tag = process.env.RELEASE_TAG;
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") ||
    !/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag ?? "")
  )
    throw new Error("Укажите GH_REPO=OWNER/REPOSITORY и RELEASE_TAG=vX.Y.Z");
  const manifest = await checkPublishedRelease({
    repository,
    expectedVersion: tag.slice(1),
    attempts: 6,
    delay: 5000,
  });
  console.log(
    `Публичный latest/module.json отдаёт версию ${manifest.version}; адрес ZIP совпадает.`,
  );
}
