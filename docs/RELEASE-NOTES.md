# 1.8.0 — Unified action rows, inline text, soft automation and the Minibot compendium

Release candidate prepared on 2026-11-20. This document is not evidence of a published GitHub Release, a tag or live-world compatibility.

## Highlights

- Every module interface (familiars, Tech Pets, customizations, support benefits, advanced maneuvers, exocortex, companion sources) now uses one shared `ability-row` component: icon at the left, name, compact metadata (action cost, traits, category, level) beside it, and the description expanding directly under the row. The whole row is the click target; Enter/Space toggle it from the keyboard; nested links, buttons and fields never collapse the row; viewing an ability does not execute it. Disclosure triangles are no longer the primary control.
- Inline elements are truly inline: exocortex metrics and ability lists render as compact lines without extra paragraphs or vertical nesting. Descriptions are enriched with the native `TextEditor.enrichHTML`; @UUID links, @Check saves and damage rolls are preserved and raw markup is never shown. Long rules text stays structured.
- Soft automation uses native Rule Elements only, with no invented numbers. The Construct familiar ability is now an `ActorTraits` rule (adds construct, removes animal); the system derives the construct immunities itself. The Resistant Panels customization gained a native damage-type `ChoiceSet` and a `Resistance` rule valued `(@actor.level + 1) / 2` (ceil(level/2)). Rule references switch correctly between `flags.sf2e` and `flags.pf2e`. "Choose two" abilities and conditional bonuses stay manual: ChoiceSet has no multi-select and ambiguous effects are not automated.
- New Minibot compendium (Tech Core): the Minibot creature (an Actor with a native NPC stat block — construct immunities, electricity 1 weakness, fly 30, darkvision) plus 25 minibot equipment items and the Direct Minibot action. Four new packs cover SF2e and PF2e (via SF2e Anachronism); 14 packs total, 232 source documents. Independent Obstructobot is deliberately not duplicated because the sf2e system pack already ships it. Prices in credits are stored as `price.value.sp`; activations are described in text following the system's own item convention and their effects remain manual. English is the source language; Russian names and descriptions are provided for optional Babele.
- Release packaging fix: the runtime modules `ability-row.mjs` and `rich-text.mjs`, imported by the entry point, are now included in the release ZIP and asserted by the release verification. They were previously missing from the packaged-script list.

## Compatibility and verification

| Area | Evidence |
| --- | --- |
| Foundry | Manifest minimum 14.361; local installation observed responding at 14.370; new code not yet deployed to a live world |
| SF2e | 1.7.1 source reviewed (NPC/equipment schemas, IWR shape, Resistance/ChoiceSet/ActorTraits, currency); SF2e branch exercised in tests |
| PF2e | 8.7.0 source reviewed; PF2e branch exercised in tests; Minibot PF2e packs rely on Anachronism for SF2e traits/immunities |
| Anachronism | Redirects source-reviewed; Minibot PF2e content assumes Anachronism for SF2e-specific traits |
| Companion Compendia | 7.7.3 class/pack contracts source-reviewed; fixture tests |
| Babele | Registration source-reviewed; 14 translation files validated by stable ID and display-only mapping; no live Babele run |
| Dailies | 4.23.1 source reviewed and mock-tested; unchanged this release |
| Checks | `npm run check` (264 JSON, 48 ES modules, 371 EN/RU keys); `npm test` (196 tests); generated-pack comparison and release ZIP verification |
| Browser | Mock Foundry fixture tests; native sheets and live UI not yet exercised in a world |

Exact current command outcomes and remaining gates are recorded in `AUDIT-1.8.0.md`. Manifest `verified` is unchanged. Live Foundry verification (deploying this build, reloading a disposable world, exercising every interface with mouse and keyboard, and document-level macro checks) is the next step and is not yet done. GM/player, synthetic-token, upgrade and multi-client scenarios still require disposable-world testing.

## Upgrade and data safety

1. Back up the world and installed module before testing. Use a separate test installation/world; do not overwrite a maintained installation for these checks.
2. Install the matching asset `module.zip`, not GitHub's automatic source archive. The ZIP has `module.json` at its root.
3. Enable Companion Compendia for robot chassis; add Anachronism for PF2e mechanic tools and the PF2e Minibot packs. Reload the world.
4. Existing UUIDs, IDs and slugs are unchanged. Manually added, edited and third-party Items stay protected; synchronization remains idempotent and create-before-delete.
5. The Construct familiar ability and Resistant Panels customization now carry native rules. Previously created unchanged managed Items are updated in place; edited copies are not overwritten. Re-save selections deliberately to apply the new rules.
6. The Minibot compendium is additive reference content. It does not grant items or actors automatically and does not duplicate the system's Independent Obstructobot.
7. Run the ordered live checklist in `AUDIT-1.8.0.md` before approving a release. Use one controlling client: queues are client-local, not cross-client locks.

## Installation endpoints

The stable endpoint is unchanged and serves the latest actually published regular release:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/latest/download/module.json
```

After a maintainer publishes `v1.8.0` with its assets, the version-specific endpoints will be:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/download/v1.8.0/module.json
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/download/v1.8.0/module.zip
```

Preparing files or opening a PR does not make these version-specific assets available. Do not merge, create a tag or publish automatically.

## Кратко по-русски

Все интерфейсы переведены на единые раскрывающиеся строки действий (клик по всей строке, клавиатура, вложенные элементы не сворачивают, просмотр не выполняет действие), inline-текст и нативное обогащение ссылок. Мягкая автоматизация на нативных RE: Construct через ActorTraits (иммунитеты выводит система) и Resistant Panels через ChoiceSet + Resistance ceil(level/2); неоднозначные эффекты остаются ручными. Добавлен компендиум Minibot (существо + 25 предметов + Direct Minibot) для SF2e и PF2e через Anachronism; Independent Obstructobot не дублируется. Исправлена упаковка runtime-модулей строк в релизный ZIP. UUID/ID/slug прежних документов не менялись, ручные и сторонние Items защищены, EN/RU сохранены. Новая сборка проверена CLI (196 тестов), но ещё не проверена в живом мире и не опубликована; перед выпуском нужны тестовые миры SF2e/PF2e, проверка Babele и отдельного клиента игрока.