# 1.7.0 — PF2e, Russian content and safer synchronization

Release candidate prepared on 2026-11-15. This document is not evidence of a published GitHub Release, a tag or live-world compatibility.

## Highlights

- SF2e retained; five additional PF2e packs provide matching stable IDs, slugs and native document types. Ten packs contain 178 documents (89 per system).
- PF2e mechanic references use SF2e Anachronism redirects. Without Anachronism, native familiar tools and the module's PF2e packs remain available; mechanic features are not granted or invented.
- Companion Compendia is optional for independent tools; robot chassis still require its native base class.
- Russian names and descriptions for all 89 distinct documents, including support benefits and maneuvers. English remains the source language. Optional Babele translates native compendium display; catalogs and generated Items work in Russian without it.
- Local source viewers replace external rules-site links without creating world documents.
- Familiar capacity is zero without a recognized source/native allowance. Cancellation and partial creation preserve previous abilities; cleanup protects manually edited Items.
- Valid ChoiceSet changes remain manageable. Linguistic Upload and Glow Up prerequisites are checked in UI and direct synchronization. Cancelled creations no longer count as applied.
- Dailies integration is restricted to source-reviewed 4.23.1. Older or newer versions retain the local editor.

## Compatibility and verification

| Area | Evidence |
| --- | --- |
| Foundry | Manifest minimum 14.361; local installation/bridge observed at 14.370; new code not deployed |
| SF2e | 1.7.0 source reviewed; SF2e branch exercised in mocks |
| PF2e | 8.7.0 source reviewed; PF2e branch exercised in mocks |
| Anachronism | 2.5.0 redirects source-reviewed and mock-tested |
| Companion Compendia | 7.7.3 class/pack contracts source-reviewed; fixture tests |
| Babele | 2.9.1 registration source-reviewed; mock tests and translation-file validation; no live Babele run |
| Dailies | 4.23.1 source reviewed and mock-tested; no live preparation/rest run |
| Checks | Static syntax/localization checks, unit/mock tests, generated-pack comparison and release ZIP verification |
| Browser | Mock Foundry fixture: English/Russian catalogs, local sources, save/cancellation and missing-pack fallback; not native sheets |

Exact current command outcomes and remaining gates are recorded in `AUDIT-1.7.0.md`. Manifest `verified` is unchanged. A connected bridge is not a live test of this build. GM/player, synthetic-token, upgrade and multi-client scenarios still require disposable-world testing.

## Upgrade and data safety

1. Back up the world and installed module before testing. Do not overwrite the maintained 0.16.2 installation for these checks; use a separate test installation/world.
2. Install the matching asset `module.zip`, not GitHub's automatic source archive. The ZIP has `module.json` at its root.
3. Enable Companion Compendia for robot chassis; add Anachronism for PF2e mechanic tools. Reload the world.
4. Review the existing selections and protected Items. Old familiar entries on robot profiles, unknown flags and manual edits are not automatically cleared.
5. Save selections deliberately. Old managed Action-to-feat conversion remains create-first; embedded IDs change only when document type changes. Compendium IDs are unchanged. Edited or manually imported Items are not renamed merely for translation.
6. Run the ordered live checklist in `AUDIT-1.7.0.md` before approving a release. Use one controlling client: queues are client-local, not cross-client locks.

## Installation endpoints

The stable endpoint is unchanged and serves the latest actually published regular release:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/latest/download/module.json
```

After a maintainer publishes `v1.7.0` with its assets, the version-specific endpoints will be:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/download/v1.7.0/module.json
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/download/v1.7.0/module.zip
```

Preparing files or opening a PR does not make these version-specific assets available. Do not merge, create a tag or publish automatically.

## Кратко по-русски

Добавлены PF2e-паки и поддержка перенаправлений Anachronism, полный русский контент с необязательным Babele, локальные источники и исправления безопасной синхронизации. Ручные игровые решения не автоматизированы; старые данные не очищаются массово. Новая сборка не проверена в живом мире и не опубликована. Перед выпуском нужны тестовые миры SF2e/PF2e, проверка Babele/Dailies и отдельного клиента игрока.
