# Аудит архитектуры и механик — 1.8.0

Документ фиксирует собственную проверку при подготовке 1.8.0 в ветке `feature/tech-pets-1.8.0`. Утверждения сверены с доступным кодом; внешние контракты проверены в исходниках и бандле целевых систем. Статические риски отделены от воспроизведённых mock-сценариев. Живая проверка в мире Foundry через мост fvtt-world-cli выполнена частично и зафиксирована в отдельном разделе ниже; оставшиеся гейты вынесены в чек-лист.

## Окружение

| Компонент | Версия | Как проверено |
| --- | --- | --- |
| Foundry VTT | 14.361–14.370 | локальная установка отвечает на `localhost:30000`; новый код в мир не развёрнут |
| SF2e | 1.7.1 | бандл `sf2e.mjs` и извлечённые документы паков equipment/bestiary |
| PF2e | 8.7.0 | исходники тега; общие схемы документов |
| SF2e Anachronism | — | перенаправления source-reviewed; PF2e-паки Minibot опираются на него для SF2e-признаков |
| PF2e Companion Compendia | 7.7.3 | манифест и пак класса `KKOgokqHa7RjVDN6` (fixture) |
| PF2e Dailies | 4.23.1 | не изменялся в этом релизе |
| Babele | — | регистрация source-reviewed; 14 файлов переводов проверены тестами |

Значение `compatibility.verified` в манифесте не повышалось.

## Архитектура и границы изменений

| Путь | Владелец данных и контракт | Регрессия |
| --- | --- | --- |
| `ability-row.mjs / rich-text.mjs → все UI-модули` | Общий компонент строки: делегированные click/keydown, интерактивные вложенные элементы исключены из переключения; обогащение `TextEditor.enrichHTML` по узлам `data-sfmtp-enrich` | мышь/клавиатура, вложенные ссылки не сворачивают, просмотр ≠ выполнение |
| `familiar-sources / customization-sources → RE` | Construct → `ActorTraits`; Resistant Panels → `ChoiceSet` + `Resistance`; ссылки правил переключаются `flags.sf2e`/`flags.pf2e` рекурсивно | обе системы, защита изменённых Items, идемпотентность |
| `data/minibots.json → minibot-sources → build-minibot-packs → 4 пака` | Отдельный проход сборки, не затрагивает дуальную сборку шасси. Документы Minibot без системных RE/UUID, идентичны для SF2e и PF2e | 14 паков, 232 документа, LevelDB roundtrip |
| `tools/build-release.mjs / verify-release.mjs` | Runtime-модули строк добавлены в ZIP; проверка допускает Actor-пак существа и mapping `system.details.publicNotes` | релизный ZIP, 232 исходника, 14 LevelDB |

Изменения не запускают массовую миграцию мира, не повышают manifest `verified`, не вводят сокеты и не выполняют игровые действия за игрока. UUID/ID/slug прежних документов не менялись.

## Мягкая автоматизация: вердикты

| Запись | Вердикт | Что сделано | Доказательство |
| --- | --- | --- | --- |
| Construct (фамильяр) | Автоматизировано | `ActorTraits` add construct / remove animal; иммунитеты выводит система (`setImmunitiesFromTraits`, не-character) | `familiars.test.mjs`, бандл sf2e |
| Resistant Panels (кастомизация) | Автоматизировано | нативный `ChoiceSet` 7 типов урона + `Resistance` `(@actor.level + 1) / 2` = ceil(level/2); type-ссылка переключается по системе | `customizations.test.mjs`, `IWRRuleElement`/`ResistanceRuleElement` в бандле |
| Skill Module / Expertise Module | Автоматизировано | `ChoiceSet` навыка (SF2e 18 / PF2e 16, computers/piloting отфильтрованы в PF2e) + `ActiveEffectLike` upgrade rank 1/2; предикаты по текущему рангу | `rule-elements.test.mjs`, живая проверка резолвимого AEL |
| Resistance / Elemental / Maneuver Module («выбрать два») | Автоматизировано | Пара `ChoiceSet` с rollOption-взаимоисключением (образец официального Resistance) + `Resistance`/`ActorTraits`+`Immunity`/`FlatModifier` athletics; прежний вердикт «ChoiceSet не поддерживает множественный выбор» опровергнут | `rule-elements.test.mjs`, официальный Resistance в бандле |
| Familiar Amphibious / Damage Avoidance / Fast Movement / Skilled | Автоматизировано | `BaseSpeed`+`ActorTraits`; `ChoiceSet`+`Note`; `ChoiceSet`+`BaseSpeed` 40; `ChoiceSet`+`FlatModifier` `@actor.masterAttributeModifier` | `rule-elements.test.mjs` |
| Agility / Camoflage / Glow Up | Автоматизировано | Резолвимый `ActiveEffectLike` `min(3,max(2,rank+1))` (условное мастерство); Glow Up дополнительно override cha.mod 3; предикаты по рангу не используются (roll options ставятся после AEL) | живая проверка на тестовом character |
| Light Mounts / Linguistic Upload | Автоматизировано | `RollOption` toggleable + `TokenLight` по предикату; `ActiveEffectLike` add languages.max 2 | `rule-elements.test.mjs` |
| Recharge / поддержки Tank / Powerful | Автоматизировано (Effect) | Отдельные Effect-предметы в существующих паках: `selfEffect` → `GrantItem` clumsy 1 (1 раунд, cascade); `FlatModifier` strike-attack-roll; `ChoiceSet`+`DamageDice` persistent bleed | `customizations.test.mjs`, `data-and-packs.test.mjs` |
| Свойства самого Minibot (Firebot resistance, Bellbot speed) | Автоматизировано, гейт на бота | `Resistance` fire 12/24/36 и `BaseSpeed` land 25 / fly 30 с `predicate:["self:trait:minibot"]` + `requiresEquipped:false`; существо несёт признак minibot | живая проверка на npc с признаком; `minibots.test.mjs` |
| Бонусы владельца Minibot (Petbot/Beatbot «You …») | Выдаются по активации/условию | `FlatModifier` по `action:conceal-an-object` (Petbot) и переключаемый `RollOption` drop-the-beat + `FlatModifier` (Beatbot); без гейта на минибота, без всегда-включённой пассивки | `minibots.test.mjs`, `rule-elements.test.mjs` |
| Эффекты активаций Minibot (повествовательные) | Оставлено ручным | Запись/музыка/лечение/тушение/навигация не имеют однозначного RE; стоимость действия и признаки нативны | системный образец Independent Obstructobot (`rules: []`) |
| Independent Obstructobot (системный shield) | Оставлено системным/ручным | Уже в `sf2e.equipment`; Reconfigure Fields — активация владельца (Raise a Shield + deflecting), величину сопротивления задаёт системный признак deflecting; модуль не дублирует и не мутирует системный пак | живой дамп `sf2e.equipment`, `shieldTraits deflecting-*` |

Границы соблюдены: числа не выдуманы; действия/ресурсы не тратятся без подтверждения; состояния/эффекты владельца не применяются автоматически без активации/условия; свойства бота применяются только к актёру с признаком minibot; характеристики не меняются произвольно; допустимый выбор пользователя сохраняется при синхронизации (`choiceVariants`/`preserveRuleChoices`).

## Компендиум Minibot: решения

- Independent Obstructobot (Advanced/Elite/Ultimate) **уже есть** в системном паке `sf2e.equipment` — намеренно не дублируется. Отсутствующие 9 типов (Camerabot, Medbot, Petbot, Beatbot, Bellbot, Butlerbot, Firebot, Glampbot, Grabot) дают 25 предметов; добавлены существо Minibot и действие Direct Minibot.
- Схемы сверены с реальными системными документами: NPC (attributes.ac/hp/speed/immunities/weaknesses, details.publicNotes, perception.senses, saves, skills.base, traits.size), equipment (price.value.sp = кредиты, bulk, level, traits, usage, equipped.carryType), IWR-форма `{type}` / `{type,value}`.
- Существо: нативный стат-блок Creature -1, Tiny construct/robot/tech/**minibot**, AC 14, HP 4, Fort +0 / Ref +4 / Will +0, иммунитеты по стат-блоку (включая mental и area-damage), weakness electricity 1, fly 30, darkvision, Acrobatics +6. Иммунитеты заданы явно; система дополнительно выводит construct-иммунитеты без дублирования. Признак `minibot` регистрируется и в `creatureTraits` (`registerMinibotCreatureTrait`), чтобы отображаться с системной меткой и давать roll-option `self:trait:minibot` для гейта свойств бота.
- Разделение адресатов эффектов Minibot: свойства самого бота (Firebot resistance fire 12/24/36, Bellbot land 25 / fly 30) выражены нативными RE с `predicate:["self:trait:minibot"]` и `requiresEquipped:false` (на NPC `held` не считается equipped), поэтому работают только на актёре-миниботе. Бонусы владельца («You gain…») остаются в предмете и выдаются по условию действия (Petbot `action:conceal-an-object`) или переключаемой активации (Beatbot `drop-the-beat`), без гейта на минибота и без всегда-включённой пассивки. Camerabot darkvision через `Sense` в живой проверке не применился — оставлен ручным.
- PF2e-варианты идентичны SF2e (документы без системных RE/UUID); для SF2e-признаков/иммунитетов в PF2e требуется Anachronism. Это отражено в RELEASE-NOTES и чек-листе.
- `usage: held-in-one-hand` и `equipped.carryType: held` — представление переноски, не игровая механика; источник не задаёт usage явно. Повествовательные активации описаны в тексте по образцу системных предметов и остаются ручными.
- Independent Obstructobot (Advanced/Elite/Ultimate) — системный `shield` (`sf2e.equipment`, `rules: []`, признаки minibot/tech). Его Reconfigure Fields — активация владельца: Raise a Shield + выбор физических типов, признак deflecting на 10 минут, раз в раунд. Величину сопротивления даёт системный признак `deflecting-<type>`; модуль не дублирует системный пак и не мутирует его на лету, поэтому полная автоматика Reconfigure Fields потребовала бы runtime-выдачи признака щиту — вынесено в отдельную доработку, сейчас ручное/системное.

## Собственные находки и исправления

- **Упаковка релиза (подтверждено, исправлено):** runtime-модули `ability-row.mjs` и `rich-text.mjs`, импортируемые `main.mjs`, `sheet-integration.mjs`, `familiar-ui.mjs`, `companion-sources-ui.mjs`, отсутствовали в списке упаковываемых скриптов `tools/build-release.mjs`. Релизный ZIP был бы нерабочим. Добавлены в список и в обязательную проверку `verify-release.mjs`.
- Проверка релиза и тесты переводов обновлены под 14 паков / 238 исходников и Actor-пак существа с mapping `system.details.publicNotes`.

## Выполненные команды

2026-11-21, локально Windows / Node.js v24.16.0:

- `npm run build:packs`: 14 паков, 238 документов; сборка извлекает LevelDB обратно и сверяет с фабриками (включая 4 пака Minibot).
- `npm run check`: 271 JSON, синтаксис 51 ES modules, 393 одинаковых ключа EN/RU; проверка запрещённых внешних ссылок.
- `npm test`: 212 выполнено, 212 прошло, 0 ошибок и пропусков. Внутри suite выполнены упаковка, повторная сборка ZIP и штатный verifier; это не live-тест.
- `npm run package` и `npm run verify:release dist v1.8.0`: релизный ZIP и контрольные суммы проверены штатным инструментом.
- `git diff --check`: без ошибок пробелов.

## Живая проверка через мост fvtt-world-cli

2026-11-20, мир «Секреты Роя» (sekrety-roya), Foundry 14.370, sf2e 1.7.1, GM-сессия через мост 1.4.0. Сборка 1.8.0 развёрнута в `Data/modules` (бэкап 1.7.0 сохранён), сервер перезапущен владельцем. Проверки выполнены макросами и чтением документов/паков; тестовые актёры/предметы создавались и удалялись.

- **Загрузка:** модуль 1.8.0 активен; в мире sf2e зарегистрированы 7 SF2e-паков, включая `minibot-creature` (Actor, 1) и `minibots` (Item, 26). PF2e-паки в мире sf2e не открываются (ожидаемо).
- **Существо Minibot:** импортируется в мир без ошибок схемы; AC 14, HP 4, Fort +0 / Ref +4 / Will +0, иммунитеты 17 (включая mental и area-damage), weakness electricity 1, тёмное зрение, Acrobatics +6; Скорость полёт 30 корректно preparation в `system.movement.speeds` (NPC переносит speed из attributes). Признаки construct/robot/tech сохранены.
- **Предметы Minibot:** цена корректна — система нормализует `price.value.sp` в номинал `credits` (100/750 и т.д.); уровень/Нагрузка/usage валидны; Independent Obstructobot отсутствует; Direct Minibot на месте. Babele активен: названия/описания отображаются по-русски («Минибот», «Камеработ (коммерческий)», «Управление миниботом»).
- **Construct:** правило `ActorTraits` (add construct / remove animal) на месте; на тестовом NPC с признаком construct система выводит 15 иммунитетов construct (`setImmunitiesFromTraits`).
- **Resistant Panels:** `ChoiceSet` (7 типов урона, prompt SFMTP.ResistantPanelsPrompt) + `Resistance` `type=["{item|flags.sf2e.rulesSelections.resistantPanels}"]`, `value="(@actor.level + 1) / 2"` — структура подтверждена в живом паке.
- **Строки действий (живой DOM браузера):** компонент `ability-row` — header role=button tabindex=0; клик по строке раскрывает (aria-expanded true, body виден); вложенная кнопка управления и ссылка в теле НЕ сворачивают строку; Enter и Space переключают с клавиатуры; `enrichRowBodies` превращает `@UUID` в нативный `content-link` (data-uuid, draggable, aria-label). Просмотр не выполняет действие.
- **Путь обновления Construct (2026-11-21, после перезагрузки клиента):** на тестовых character+familiar синхронизация `tough`+`construct` создаёт оба Item; имитация копии 1.7.0 (`system.rules: []` + соответствующий снимок) при повторном сохранении обновляется ровно один раз (`upgraded: 1`) и получает `ActorTraits`; снимок совпадает с фактическим Item (`familiarCanRemove: true`); повторная синхронизация идемпотентна (`upgraded: 0`, `protected: 0`); снятие выбора удаляет обе копии (`removed: 2`). Тестовые актёры удалены.
- **Новые RE кастомизаций (2026-11-21, живой character level 5):** Glow Up → diplomacy rank 2 и cha.mod 3; Agility Optimization → acrobatics rank 2; Camoflage → stealth rank 3 (из base 2); High Speed (fly) → fly 40; Linguistic Upload → languages.max 2. Резолвимый `min(3,max(2,rank+1))` подтверждён на разных базовых рангах. Тестовый актёр удалён.
- **Чтение новых паков (2026-11-21):** после чистой развёртки живой пак `robot-customizations` (37 документов) отдаёт recharge `selfEffect` → Effect `8a4adcb39a007962`, effect-recharge `GrantItem` clumsy (badge-value 1, cascade, 1 раунд turn-end), glow-up резолвимый AEL + override cha, maneuver-module 3×ChoiceSet+2×FlatModifier; `familiar-abilities` отдаёт skilled (ChoiceSet 16 + FlatModifier masterAttributeModifier) и resistance (2×ChoiceSet+2×Resistance).
- **Гейт признака minibot (2026-11-21, живые npc/character):** признак актёра даёт roll-option `self:trait:minibot` (не голый `minibot`); `FlatModifier`/`Resistance`/`BaseSpeed` с `predicate:["self:trait:minibot"]` + `requiresEquipped:false` включаются на npc с признаком (resistance fire 12, land 25) и выключены на character без признака. На NPC `equipped.carryType:"held"` даёт `isEquipped:false`, поэтому для свойств бота нужен `requiresEquipped:false`. `Sense` (darkvision) на equipment в живой проверке не применился — оставлен ручным.
- **Импорт реальных предметов пака (2026-11-21):** существо из `minibot-creature` несёт признаки construct/minibot/robot/tech; Firebot (tactical) + Bellbot (tactical), импортированные на npc с признаком, дают resistance fire 24 и fly 30; те же предметы на character без признака сопротивления не дают. Petbot на владельце в покое не активен (бонус только по `action:conceal-an-object`), что соответствует «без всегда-включённой пассивки». Тестовые актёры удалены.
- **Развёртка и LevelDB (2026-11-21, урок):** горячая замена .ldb файлов при запущенном мире повреждает открытый дескриптор («Corruption: bad block type»), а при остановке мира Foundry сбрасывает своё старое состояние поверх новых файлов. Корректная развёртка: остановить мир (`game.shutDown`, сохраняет данные) → чисто заменить каталог модуля из проверенного ZIP → запустить мир. Выполнено; старые runtime-файлы паков удалены.

### Находка и исправление (живая проверка)

- **Признак minibot у equipment (подтверждено, исправлено):** реестр `CONFIG.PF2E.equipmentTraits` не содержит `minibot` (он в `shieldTraits`), поэтому схема equipment отфильтровывала его из `traits.value`, и предметы показывали только `tech`. Попытка через `traits.otherTags` оказалась неэффективной: геттер `item.traits` и лист оборудования не отображают otherTags как признак. Исправлено регистрацией признака в `init`: `registerMinibotEquipmentTrait()` добавляет `minibot → PF2E.TraitMinibot` в `equipmentTraits` (не перезаписывая существующее). Проверено в живом мире: после регистрации equipment сохраняет `traits.value=["minibot","tech"]` и геттер отображает оба признака; добавлен модульный тест.
- **Затирание полей схемы при обновлении фамильяра (подтверждено живым прогоном, исправлено):** первая версия пути обновления сливала фабричный `source.system` поверх `item.system`, теряя поля, которые схема добавляет при записи (`description.gm`, `traits.otherTags`). Предсказанный снимок не совпадал с записанным Item: неизменённые копии «обновлялись» каждый sync и становились навсегда защищёнными (нельзя снять). Исправлено: целевое состояние переопределяет только принадлежащие фабрике листья, а `description`/`traits` сливаются с сохранением полей схемы; содержимое и снимок пишутся одним `update`. Повторный живой прогон подтвердил `upgraded: 1`, совпадение снимка, идемпотентность и снятие выбора; mock-тест дополнен имитацией полей схемы.

### Не выполнено в живом мире

- Идемпотентная синхронизация и защита Items на реальном роботе-компаньоне (покрыто модульными/mock-тестами; живой компаньон не создавался).
- PF2e + Anachronism в живом мире (доступен только мир sf2e); PF2e-паки Minibot проверены сборкой и тестами.
- Отдельный клиент игрока и межклиентские гонки.

## Исправления по ревью (2026-11-21, PR #3)

| Замечание | Вердикт | Исправление |
| --- | --- | --- |
| 1. Старые копии фамильяра получают новые ChoiceSet без шага выбора | Подтверждено | Система промптит ChoiceSet только в `preCreate`; при `item.update` выбора нет. Добавлен `promptUnselectedFamiliarChoices` (DialogV2): после обновления (и при повторном сохранении) спрашивает недостающие выборы, пишет `rules.selection` + `flags.rulesSelections` и перештамповывает снимок. Отмена оставляет выбор на потом. |
| 2. Amphibious фиксировал 25/25 вместо большей скорости | Подтверждено | Заменено на `BaseSpeed land = max(25, swim.value)` с предикатом `speed:swim` (чтобы не читать null) и `BaseSpeed swim = max(25, land.value)`. Живьём: база 25/25; с Fast Movement(land) — 40/40 + трейт amphibious. |
| 3. Light Mounts dim=20 не даёт тусклой зоны | Подтверждено | Foundry меряет dim от токена; «20 футов beyond bright» = dim 40. Установлено `{bright:20, dim:40}`, тест обновлён. |
| 4. Frequency Emergency Repair не доходит до старых копий | Подтверждено | Условие обновления кастомизации сравнивало только uuid/type/name/description. Добавлен дрейф механических полей через `itemFingerprint` целевого состояния, построенного ОТ записанного Item (сохраняя поля схемы) с нормализацией выбора с обеих сторон (`preserveCustomizationChoices`), иначе был вечный дрейф/потеря idempotency. Регрессионный mock-тест: старая копия без frequency получает `{max:1,per:PT10M}`, повторная синхронизация без записей. |

**Находка живой проверки (не дефект модуля):** familiar без установленного `system.master.id` НЕ готовит Rule Elements своих action-предметов (prepared rules пусты); с мастером — готовит и применяет. Все живые проверки RE фамильяра выполнялись с мастером. Это системное поведение, модуль его не меняет.

## Уровни доказательств

- **Проверено тестами (mock):** 212 модульных и mock-тестов `node --test`. Проверяют реальный код модуля с подменой API документов, но не запускают Foundry.
- **Схема и сборка:** документы Minibot сверены с извлечёнными системными образцами; LevelDB roundtrip совпадает с фабриками; релизный ZIP проходит штатный verifier.
- **Живой мир:** сборка 1.8.0 развёрнута (чистая замена при остановленном мире) и клиент перезапущен; проверены импорт Minibot, иммунитеты Construct, структура Resistant Panels, строки действий в реальном DOM, обогащение `@UUID`, Babele, путь обновления Construct, новые RE кастомизаций/фамильяров/Effect-предметов и гейт признака minibot на боте. PF2e+Anachronism и отдельный клиент игрока в живом мире не проверялись.

## Проверки в живом мире перед выпуском

1. Развернуть сборку 1.8.0 в тестовый мир SF2e и в тестовый мир PF2e с Anachronism; перезагрузить мир.
2. Все интерфейсы: раскрытие строк мышью и с клавиатуры (Enter/Space); вложенные ссылки/кнопки/поля не сворачивают строку; просмотр не выполняет действие; hover/focus/press обратная связь.
3. Inline-текст и обогащение: @UUID/@Check/броски урона работают, сырая разметка не видна; метрики экзокортекса компактны.
4. Construct: иммунитеты выводятся системой на familiar/NPC; Resistant Panels: выбор типа и сопротивление ceil(level/2) на разных уровнях; повторная синхронизация без дубликатов; защита изменённых Items.
5. Minibot: импорт существа и предметов в мир без ошибок схемы; иммунитеты/слабость/полёт отображаются; PF2e+Anachronism — признаки minibot/tech и иммунитет area-damage корректны; Independent Obstructobot не задвоен.
6. Русский язык с Babele и без неё: названия/описания паков Minibot и созданных Items.
7. Идемпотентность синхронизации и защита ручных/сторонних Items; два клиента одновременно меняют одного робота — зафиксировать фактическое поведение.

## Риски и ограничения

- PF2e-существо Minibot использует иммунитет `area-damage` и признаки `minibot`/`tech`: в PF2e они доступны через Anachronism; без него возможен отказ схемы при импорте. Требуется живая проверка PF2e+Anachronism.
- Очереди синхронизации локальны клиенту (`socket: false`); межклиентские гонки не исправлены и документированы как ограничение.
- Живая проверка выполнена частично (см. раздел выше): путь обновления Construct подтверждён; отдельный клиент игрока, межклиентские гонки и обновление реального робота-компаньона не выполнены; `verified` не повышен.