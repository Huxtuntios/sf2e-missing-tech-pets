# Выпуск через GitHub Desktop

Подготовленные адреса рассчитаны на публичный репозиторий:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets
```

Текущая версия: **0.12.1**, тег первого подготовленного выпуска: **v0.12.1**. Сам репозиторий и релиз автоматически не создаются.

## Подготовка на Windows

1. Установите GitHub Desktop и войдите в аккаунт Huxtuntios.
2. Распакуйте архив репозитория. Внутри находится папка `sf2e-missing-tech-pets` с `module.json`, `package.json`, README и скрытой папкой `.github`.
3. Перенесите эту папку, например, в `Документы\GitHub\`. Репозиторием должна стать именно папка, содержащая `module.json`, а не внешний каталог архива.
4. Проверьте файлы `LICENSE.txt` и README перед публичной публикацией. Правовые уведомления сохранены; всем файлам проекта не назначена новая общая лицензия автоматически.

## Создание репозитория

1. В Desktop откройте **File → Add local repository…**, укажите папку модуля и нажмите **create a repository**, если Git ещё не инициализирован.
2. В **Create a Git Repository** установите **Name: sf2e-missing-tech-pets**. Убедитесь, что итоговый путь указывает на уже распакованную папку, а не создаёт ещё один вложенный каталог.
3. Не включайте **Initialize this repository with a README**. Для **Git Ignore** и **License** выберите **None**: файлы уже подготовлены.
4. Проверьте ветку **main**. При необходимости используйте **Branch → Rename…**.
5. В **Summary** напишите `Initial release preparation` и нажмите **Commit … files to main**.
6. Нажмите **Publish repository**. Имя — `sf2e-missing-tech-pets`, **Keep this code private** должно быть выключено. **Organization** оставьте пустым.
7. Откройте **Repository → View on GitHub**. На вкладке **Actions** дождитесь зелёного **CI**.

CI устанавливает зависимости через `npm ci`, проверяет код и локализации, запускает тесты, собирает и проверяет релизные Assets. Артефакт **release-assets** содержит готовые файлы даже до создания релиза.

## Публикация релиза

GitHub Desktop не создаёт релизы: следующие действия выполняются на сайте GitHub.

1. В репозитории откройте **Releases → Draft a new release / Create a new release**.
2. В **Choose a tag** введите **v0.12.1** и выберите создание нового тега при публикации. **Target: main**.
3. В **Release title** укажите `0.12.1`.
4. Вставьте описание из `docs/RELEASE-NOTES.md`.
5. Для обычного выпуска включите **Set as the latest release** и не включайте **Set as a pre-release**.
6. Нажмите **Publish release**, откройте **Actions** и дождитесь зелёного **Release**.
7. В **Assets** появятся **module.json**, **module.zip** и **SHA256SUMS.txt**. Workflow также скачивает опубликованные файлы обратно и проверяет их.

**Не заменяйте module.zip автоматически создаваемыми Source code (zip/tar.gz).** Установочный архив содержит готовые компендиумы и правильную структуру.

После первого успешного обычного релиза ссылка для Foundry:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/latest/download/module.json
```

Ссылка на конкретную версию:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/download/v0.12.1/module.json
```

`latest` не выбирает pre-release. Если первым выпуском будет pre-release, устанавливайте его по ссылке конкретного тега.

## Ошибки workflow

- **Тег не совпадает с версией:** тег должен быть `v` + версия из `module.json` и `package.json`.
- **403 при загрузке Assets:** проверьте разрешения GitHub Actions для записи содержимого репозитория. Workflow уже запрашивает `contents: write`; ограничения организации могут запрещать такую запись. После исправления запустите **Re-run all jobs**.
- **Immutable release:** такой релиз нельзя дополнить файлами после публикации. Скачайте **release-assets** из зелёного CI, распакуйте и прикрепите `module.json`, `module.zip`, `SHA256SUMS.txt` к черновику релиза **до** его публикации. В этом режиме автоматическая дозагрузка после публикации не используется.
- **Нет workflow в Actions:** убедитесь, что папка `.github/workflows` попала в коммит и опубликована на GitHub, а Actions разрешены для репозитория.

## Следующие обновления

1. Внесите изменения и обновите `CHANGELOG.md` и `docs/RELEASE-NOTES.md`.
2. Поднимите версию одновременно в `module.json`, `package.json`, а также в двух местах `package-lock.json`: верхний `version` и `packages[""].version`.
3. В исходном `module.json` обновите `download` на новый тег. При сборке workflow дополнительно подставляет правильные адреса фактического репозитория.
4. Через Desktop выполните **Commit to main → Push origin** и дождитесь CI.
5. Создайте следующий релиз с совпадающим тегом. Уже опубликованный номер повторно не используйте.

## Локальная сборка для разработчика

Нужны Node.js 22+, Python 3 и зависимости проекта:

```sh
npm ci
npm run check
npm test
npm run package
```

Результат находится в `dist/`:

- `module.json` — манифест для установки и обновления;
- `module.zip` — установочный архив, **module.json лежит в его корне**;
- `SHA256SUMS.txt` — контрольные суммы манифеста и архива;
- `RELEASE-NOTES.md` — текст релиза.

Другой репозиторий можно указать явно:

```sh
npm run package -- --repo OWNER/REPOSITORY --tag v0.12.1
npm run verify:release
```

Для ручной установки `module.zip` распаковывается в заранее созданную папку `Data/modules/sf2e-missing-tech-pets/`. Чтобы без Node.js вручную прикрепить уже подготовленные Assets к релизу, загрузите выданные `module.json` и `module.zip` **из одного комплекта**, не редактируя манифест отдельно.
