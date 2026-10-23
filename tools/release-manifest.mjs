// Общая проверка адресов обновления: latest для манифеста, точный тег для ZIP.
export function validateUpdateManifest(
  manifest,
  { expectedVersion, repository } = {},
) {
  if (manifest.id !== "sf2e-missing-tech-pets")
    throw new Error("Неверный ID модуля");
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version ?? ""))
    throw new Error("Некорректная версия манифеста");
  const base = repository ? `https://github.com/${repository}` : manifest.url;
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(base ?? ""))
    throw new Error("Некорректный адрес репозитория");
  if (manifest.manifest !== `${base}/releases/latest/download/module.json`)
    throw new Error(
      "manifest должен указывать на latest/download/module.json, не на отдельный тег",
    );
  if (
    manifest.download !==
    `${base}/releases/download/v${manifest.version}/module.zip`
  )
    throw new Error("download должен указывать на ZIP той же версии");
  if (expectedVersion && manifest.version !== expectedVersion)
    throw new Error(
      `GitHub latest отдаёт ${manifest.version}, ожидалась ${expectedVersion}. Опубликуйте релиз, прикрепите актуальные module.json/module.zip и отметьте его Latest; prerelease и draft не подходят.`,
    );
  return manifest;
}
