# SF2e Missing Tech Pets

## 1.7.0 — PF2e, Russian content and safer selections

Five pack families are supplied for each system (10 packs, 178 documents). English remains the source language; all 89 distinct documents have Russian names and descriptions. Babele is optional: catalogs, local source viewers and newly generated Items are localized without it. Enable Babele for translated native compendium display; translation files use stable document IDs. IDs, slugs, UUIDs and rule keys are not translated.

Valid ChoiceSet changes remain manageable rather than protecting an otherwise unchanged Item forever. Linguistic Upload and Glow Up require Artificial Personality or Sapient in module selections. Existing invalid legacy selections are not silently erased. Familiar saves report actual creation/removal counts; cancellation and incomplete creation preserve the previous ability set.

**Release candidate:** publication, a tag and live-world compatibility verification are separate maintainer gates. See [audit](docs/AUDIT-1.7.0.md) and [release notes](docs/RELEASE-NOTES.md).

## Descriptions, bonus abilities and updates

Expand an entry in **Robot customizations** or in the tools catalog to read its mechanical description. **Open local document** opens the corresponding Item from the active system's pack.

Selected robot customizations are native **feat** Items with category **bonus**, shown in **Bonus Feats/Abilities** on the companion's `character` sheet. They belong to the companion, not automatically to its owner. They retain the same passive Rules, action costs and source UUIDs; no second Action/Rule Element copy is granted. Familiar abilities remain native actions on the `familiar` actor because that actor has no character bonus-feat group. Support and advanced maneuvers remain actions.

On saving the current selection, an unchanged module-managed customization from the old Action format is replaced with a bonus feat. The replacement is created first; the old Item is removed only after successful creation. Valid Armored Plates choices are carried over. Embedded Item IDs change during this type conversion, so update saved actor-Item shortcuts if necessary; compendium IDs remain stable. Manual and edited copies are not silently converted or duplicated. Review protected old Actions and their source before making a deliberate replacement.

The installation/update URL remains:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/latest/download/module.json
```

Foundry only sees a newer version after its public GitHub release and updated Assets exist. Committing files or receiving a ZIP does not publish a release. Publish tag **v1.7.0** as a normal **Latest** release, not a draft or prerelease. The release workflow now verifies the version returned by the public latest manifest after verifying the uploaded Assets. If an old installation uses a tag-specific manifest, reinstall once using the stable URL above. See [release instructions](docs/RELEASING.md).


## Robot customization sources

All **36 robot customizations** have native bonus feat Items in `robot-customizations` (SF2e) and `pf2e-robot-customizations` (PF2e). Saving the selection no longer depends on finding a same-named Item in a third-party or familiar pack.

- **Passive Rule Elements (10):** Aquatic Adaptation, Armored Plates, Climber, Flier, Burrower, Nightvision Sensors, Olfactory Receptors, Echolocation, Hardened Chassis and Speedster.
- **Manual resolution (26):** the other customizations have descriptions and local document buttons, without invented numerical effects. Speakers, for example, describes speaking through the robot; it does not need an artificial bonus. The catalog marks the difference, and synchronization reports manual selections as information rather than as missing sources.
- **Armored Plates:** the native ChoiceSet asks for +1, or +2 for an actual Superior robot companion. Select the appropriate bonus when the Item is added; update its Rule Element selection if the robot advances. The catalog's grade limit does not itself grant advancement or decide this bonus.
- Slot costs, grade limits and existing prerequisites still apply. Possessing an Item does not automate every active effect in its description.

**Upgrading:** reload the world, open the robot's **Feats/Abilities → Robot customizations** section and save the current selection again. Keep the same profile choices. A previously module-generated, unchanged customization is corrected safely; old Actions are replaced with bonus feats after creating their replacement. Manually added or edited Items are retained; review any protected old copy yourself instead of deleting Items in bulk. An exact native drag-and-drop copy of an included customization is not duplicated or adopted for automatic deletion.

Rules are included in the local Robot Customizations Item pack.

## Optional PF2e Dailies integration

**PF2e Dailies (`pf2e-dailies`) is optional; this adapter enables only version 4.23.1. Familiar tools do not require Companion Compendia.** Integration uses the public `game.dailies.api.registerCustomDailies` API, without replacing methods or modifying the Dailies API. The API contract was checked against Dailies 4.23.1.

1. Enable Dailies and reload the world. Link one native `familiar` actor to its `character` owner; you must own both actors.
2. Close existing daily-preparation windows. On the familiar sheet, expand **Choose familiar abilities** and click **Prepare in Dailies**. The same controls are available in the familiar management tool.
3. Connecting disables **only the standard familiar daily set on this owner** and registers **Tech Core familiar abilities** in Dailies. Other preparations and owners are unaffected. Do not re-enable the standard familiar set while this integration is connected.
4. Click **Open Dailies**, or use Dailies' own preparation entry on the owner's sheet. Choose the daily abilities and complete preparation there. The local daily editor is hidden while integration is connected; no new character-header buttons are added.
5. Use Dailies' normal rest workflow before the next preparation. Only this module's unchanged managed daily abilities are removed by its rest callback; innate, manual, third-party and edited Items remain protected and count against the limit.
6. **Disconnect Dailies integration** restores the previous standard-set setting unless you have changed that setting manually. The familiar's Items are retained; the local editor becomes available again. If Dailies is absent or its API is incompatible, the local editor remains available.

The set offers the module's 38 Tech Core abilities, checks capacity and known prerequisites, avoids duplicates, and retains stable source UUIDs. Protected abilities are listed separately and subtract from the available choices. Dailies remembers the last choices. Empty choices are allowed. If the familiar already has temporary abilities created by the standard Dailies set, rest through Dailies before connecting; this module never adopts or deletes those foreign Items.

This integration does **not** automate the active effects described by every ability, grant a familiar feat, implement repeatable Skilled variants, or replace the system's familiar statistics. Existing manual-resolution and Rule Element boundaries still apply. Other third-party custom daily sets that also modify familiar abilities must be disabled separately. An error in this set does not roll back unrelated Dailies preparations. Configuration changes should be followed by closing and reopening Dailies, not using an old preparation window.

Reference: [PF2e Dailies](https://github.com/reonZ/pf2e-dailies), [public API](https://github.com/reonZ/pf2e-dailies/blob/master/src/main.ts), [standard familiar set](https://github.com/reonZ/pf2e-dailies/blob/master/src/data/familiar.ts).


## Abilities on the pet sheet

Character-sheet header buttons have been removed. Open **Configure Settings → Module Settings → SF2e Missing Tech Pets → Open tools** for initial creation, links, source references and advanced tools. Select the actor there; the public API remains available.

- **Robot companion:** open the companion's **Feats/Abilities** tab and expand **Robot customizations**. Current selections, all 36 catalog entries, grades and repeatable counts are shown together. Change the choices and click **Save selection**. Slot and grade checks apply. Manual and unknown legacy records are preserved; the included customization Items supply the sources; entries marked manual still require manual resolution.
- **Native familiar:** expand **Choose familiar abilities** in its existing **Abilities** section. Inspect the 38 available abilities, change the daily set and save. Innate, manually added and edited Items cannot be removed here. Native ability Items remain visible in the system's list.
- The inline editors are shown on the companion/familiar, not every owner character. Only owners of both linked actors can save. If actor data changes while editing, reopen the sheet rather than overwrite the newer data.
- Robot chassis are hidden from the native character ancestry picker, including world copies with retained source metadata. Drag them from **Robot Chassis (Tech Core)** onto a separate companion actor of type `character`, as with Companion Compendia. The catalog is reference-only; it no longer assigns chassis through a selection button. Existing chassis and user data are retained.
- Remaining tool windows are bounded by the viewport and their contents scroll. Catalogs have their own scroll area and search.

After updating, reload the world page to refresh translations. Existing imported chassis retain their saved image: choose the matching SVG in `modules/sf2e-missing-tech-pets/assets/icons/` in the Item image picker. Custom images are not overwritten.

[Русская версия](README.ru.md) · [Releases](https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases) · [Report a bug](https://github.com/Huxtuntios/sf2e-missing-tech-pets/issues)

![Foundry VTT 14](https://img.shields.io/badge/Foundry_VTT-14-informational)
![Starfinder 2e](https://img.shields.io/badge/System-Starfinder_2e-orange)

**Version 1.7.0 candidate.** Tech Core robot companions and native familiars: items and tools for Foundry VTT v14 / SF2e and PF2e.

> Action descriptions and automated mechanics are different. See the automation notes below for effects that require manual resolution.


## Companion sources and Pet (0.14)

Open **Tech Pets → Companion sources and Pet**, or use the same button in **Familiars**. The new reference distinguishes grants from improvements and care feats. It recognizes 13 curated SF2e sources: Familiar, Enhanced Familiar, Incredible Familiar, Pet, Drone, Tactical/Advanced/Superior Drone, the four graded Customization feats, and Devoted Pet Owner. Existing native items are opened on the owner; absent native items can be opened from their exact system UUID when available. Nothing is granted or retrained automatically.

- Familiar capacity uses the highest recognized **2/4/6** limit or positive native capacity, not their sum. A manually entered capacity still takes priority. A technomancer class alone does not grant a familiar. Missing prerequisite sources produce reminders, not invented Items.
- For a reciprocally linked Drone, each owned Tactical/Advanced/Superior Drone feat supplies one customization from advancement and one additional customization from the feat, restricted to that grade. Each owned graded Customization feat supplies one slot of its own grade. The existing two extra commercial Drone slots remain. Imported duplicates do not increase these counts.
- Repeatable Customization feats count once by default. Use **Confirmed selections** (1–3) only for genuinely repeated feat selections. Superior Drone repeats never grant additional customization slots. Existing explicit slot rules/item flags retain priority instead of being added a second time. Reopen Tech Pets and synchronize after saving counts.
- The recognized Drone grade is informational. **Grade limit**, actual advancement Items, burly/deft/specialization choices and their statistics remain under player/GM control. Grade-specific slots cannot pay for manual notes or a different grade. Existing records and unrelated Items are preserved.
- **Pet** has a separate manual profile: name, active state and exactly two distinct abilities from the Pet category. The profile persists on its owner and creates no actor, feat, HP/AC, actions or Rule Elements. Its rule reference includes the Pet's statistics and prohibition on Strikes. Natural abilities and replacement/retraining are checked manually; other familiar abilities are not offered without a GM-approved workflow.
- An active Pet profile prevents linking/creating a familiar through this module; a linked familiar prevents activating a Pet profile. Existing conflicting data is warned about, never deleted. A familiar grant that requires retraining Pet is not silently resolved.
- Animal-companion linking/import tools use Companion Compendia packs for the active system. The module does not infer an animal-companion grant from a class, ancestry or matching name. Animal and robot companions are mutually exclusive under the rules, but either can coexist with a familiar or Pet. This broader cross-module restriction is a reminder, not an automatic scanner of every actor.
- Purchased minibots, delivery drones and turrets are not treated as companion/familiar grants. Devoted Pet Owner is a healing benefit, not a creature grant; healing and robot immunity remain manual.

The source list is a curated SF2e integration, **not an exhaustive importer of PF2e classes, archetypes or ancestry feats**. Pet has no unverified native system UUID. Full Pet sheet automation, general animal-companion grant discovery, creature prerequisite enforcement and automatic advancement-stat application are not implemented.

See [source guide](docs/COMPANION-SOURCES.md) for provenance and boundaries.


## Mechanic mines and turret (unreleased)

On the mechanic's **Actions → Encounter** tab, expand **Mechanic: Exocortex**. Edit the carried mine count or place/collect mines directly. The manager additionally offers daily preparations, crafting, mine sheets and detonation. Placement spends a mine only after creating its token; Escape/right-click cancels without spending it. The same carried/max mine count is shown in the character sheet's **Resources** block, and the turret array selector is available directly in the inline panel.

**PF2e Summons Assistant (`pf2e-summons-assistant`) 2.20.6 is recommended, not required.** When active, placement clones its Mine actor source and preserves its inherited actions. Native PSA Mine summons are also added to the ledger after their summoner is known; they are counted once. Do not use both placement buttons for the same deployment. Without PSA, Tech Pets creates a hazard mine. No third-party pack or artwork is redistributed.

**Create turret statblock** creates one persistent hazard actor with the mechanic's ownership. Place/recall its token from the sheet or manager. Recall preserves that actor and its HP. Level, Intelligence, mechanic class DC and owned feats drive its generated statistics and actions; manually edited fields and Items are protected. Custom actor and token artwork is remembered per mechanic and reused after recall or actor recreation. An active GM handles actor/token mutations through Foundry's authenticated query system; global player permissions are not changed.

The turret's separate weapon on the mechanic supplies native proficiency, grade/upgrades, damage and shared MAP without ammunition. The manager offers three MAP buttons. **Range, cover, visibility and target-dependent modifiers must be checked manually from the turret's square**: the system has no supported origin-token override for the owner's Strike. Use the weapon's normal damage button and Pinpoint Shot toggle. The turret actor's **Turret Operation** action mirrors those toggles for convenience; toggle values and suboptions synchronize in both directions. Expansive Array additions are chosen explicitly, up to two per owned feat, maximum four. Editing generated mechanical fields protects them from further automatic changes; grade, runes and equipped state remain manual and do not block stat/array synchronization.

Mine damage uses a single detonation action. With PSA, its native Detonate Mine Item is enhanced in place, so no duplicate Tech Pets action appears; without PSA, the module creates its own action. Enable Targeting Mine, damage customization and other owned mod toggles on the mine sheet. The selected sheet damage type is retained by synchronization; an explicit fire/piercing choice in the manager overrides it. Healing Mines and Impressive Healing Mines use their owned-feature progression. Conditional Notes remind you about Critical Explosion, Maneuvering Mines and Debilitating Exocortex; they do not apply conditions. Mines use the Small (`sm`) size. Custom mine artwork is reused for later placements. Generated rule-reference text remains canonical English; interface controls are EN/RU. No new compendium packs are required: statblocks are built from the actual owner when created.

Actions, reaction triggers, targets, saving throws, forced movement, durations and mod activation through Modify remain manual. Automatic actor/token updates do not spend character actions or grant feats. Full multi-client race testing and PF2e/Anachronism verification remain separate gates.

A standalone `*` in an action description is the manual-resolution marker: the module does not move tokens, roll Strikes, or apply conditions to targets automatically. Resolve those parts through Foundry's normal tools.

## Compatibility and optional integrations

- Foundry VTT **v14**, minimum **14.361**. The manifest's `verified` value is unchanged; it is not proof of live testing of this build.
- Declared systems: **SF2e 1.6.0+** and **PF2e 8.7.0+**. Sources reviewed for this change: SF2e 1.7.0, PF2e 8.7.0 and SF2e Anachronism 2.5.0.
- **PF2e Companion Compendia (`pf2e-animal-companions`) 7.6.3+ is optional (`relationships.recommends`).** Its base class is required for robot chassis, but familiar tools and exocortex bookkeeping do not require it. Pack contracts were reviewed against 7.7.3; the declared minimum is unchanged.
- **PF2e + SF2e Anachronism:** mechanic features and SF2e source references require an active Anachronism installation and its UUID redirects. PF2e without Anachronism still offers native familiars and the module's PF2e robot packs; it does not invent mechanic features.
- **Dailies:** only 4.23.1 is enabled by this adapter; other versions use the local editor. **Babele:** optional Russian compendium display, source-reviewed against 2.9.1.
- Unit/mock and browser-fixture checks are not live compatibility verification. This build has not been installed in a disposable Foundry world. See [audit and live checklist](docs/AUDIT-1.7.0.md).

Dependency manifest:

```text
https://github.com/TikaelSol/PF2e-Animal-Companions/releases/latest/download/module.json
```

## Installation and Updating

### Install through Foundry

Enable Companion Compendia if using robot chassis. In **Add-on Modules → Install Module**, paste:

```text
https://github.com/Huxtuntios/sf2e-missing-tech-pets/releases/latest/download/module.json
```

This address becomes available after the first regular GitHub release has been published and its **Release** workflow has completed. It does not resolve to prereleases. To install a prerelease, use its version-specific `module.json` asset.

### Manual installation

For the release asset **module.zip**, create `Data/modules/sf2e-missing-tech-pets/` and extract the archive **into that directory**. Its `module.json` must be directly inside the module directory. GitHub's automatic **Source code** archives are not installation packages.


1. Back up your world, actors, and existing module folder. Use a copy of your world for the first test.
2. With Foundry shut down, extract the installation archive using the appropriate path described above. The resulting manifest path must be `Data/modules/sf2e-missing-tech-pets/module.json`, without an extra nested folder.
3. When updating, replace the old module folder completely. Do not mix files from different versions.
4. Enable the module in your SF2e or PF2e world. For robot chassis, also enable Companion Compendia; PF2e mechanic tools additionally require Anachronism.
5. In module settings, click **Open tools**, select the actor and open **Tech Pets** or **Familiars**. No buttons are added to actor-sheet headers.

The archive includes ready-to-use **LevelDB compendiums**. Node.js and a build step are not required for manual installation.

## Familiars on Character Sheets

SF2e 1.6.0 already includes the native `familiar` actor type, its system sheet, `system.master.id` / `system.master.ability`, inherited master statistics, and Rule Element processing. The familiar panel adds convenient entry points and Tech Core content. It does not copy PF2e's actor engine or duplicate the system's calculations.

1. For initial setup, open **Module Settings → SF2e Missing Tech Pets → Open tools**, select the owner and choose **Familiars**. After linking, change the daily set directly in the familiar sheet's **Abilities** section. The advanced manager remains available from settings.
2. Create a native familiar, or select an existing `familiar` actor that is not assigned to another master. Select the master's attribute and click **Link / save attribute**. A newly created familiar copies the master's ownership permissions. Foundry still enforces permission to create actors; if you cannot create one, ask your GM to do so.
3. Open the familiar's native sheet and check its statistics. The module does not grant a familiar feat, determine whether the character is entitled to a familiar, or replace system methods.
4. Select and save a daily ability set. The allowance uses recognized familiar grants (2/4/6) and the native counter without adding them together. With neither source nor native capacity, it is **0**, not an automatic grant of two abilities. An explicit allowance can be entered for house rules or unautomated feats; leave it blank to restore automatic handling. This panel does not create feats or change the master's native counter.
5. Mark installed innate abilities and save those markers separately. Innate abilities count toward the allowance and cannot be removed by changing the daily set. The module does not infer them from artwork or creature type; they are explicitly designated by the user.

The panel supports searching, reading descriptions, opening installed Items, sending them to chat, and opening the native familiar sheet. Links persist across restarts through native Actor data. A familiar assigned to another master is not silently reassigned. If several familiars are already linked to the same master, select the one you want to inspect and correct unwanted links on their native sheets.

### Tech Core Abilities

The `familiar-abilities` pack contains **38 standalone SF2e Action Items** in the Pet, Familiar, and Master categories, with full English descriptions. These are abilities, not 38 ordinary character feats. They ship with this module, do not require searching for similarly named PF2e Items, and have stable IDs, slugs, and source IDs. All are placed on the familiar; Master ability effects are not automatically applied to the master.

**Rule Elements are provided for 10 passive abilities:**

- **Burrower:** burrow Speed 5 feet.
- **Climber:** climb Speed 25 feet.
- **Flier:** fly Speed 25 feet.
- **Darkvision.**
- **Echolocation:** precise, 20 feet.
- **Scent:** imprecise, 30 feet.
- **Tough:** +2 HP per level.
- **Dragon, Fungus, and Plant:** replace the animal trait with the corresponding trait.

The `BaseSpeed`, `Sense`, `FlatModifier`, and `ActorTraits` schemas were checked against SF2e 1.6.0.

**The remaining 28 abilities provide rules text for manual resolution.** In particular:

- Construct does not automatically grant immunities.
- Elemental, Resistance, Skilled, Fast Movement, and Damage Avoidance require manual configuration of their choices or mechanics.
- Master abilities do not automatically change the master's resources, spells, Focus Points, or HP.
- Familiar Focus is assigned a cost of 2 actions, but the module neither spends those actions nor restores a Focus Point programmatically.

The panel checks required abilities for Construct, Elemental, Kinspeech, Master's Form, Plant Form, and Toolbearer, as well as the master's level for Kinspeech. Check all other prerequisites, choices, languages, spellcasting requirements, and effect eligibility against the descriptions.

Repeated selections of Skilled for different skills currently require native drag-and-drop and manual configuration; the panel selects one copy. Imports through the module's API or browser route familiar actions to the native familiar, not to a `character` robot. Native drag-and-drop remains a user-controlled operation: do not drop these Items onto the robot or master.

Changing the daily set removes only unchanged Items created by this panel for the current master. Manually added, third-party, edited, and innate Items are retained and count toward the allowance. Remove them deliberately on the native sheet if needed. Repeated synchronization and queued operations within one client do not create duplicates. Cross-client writes are not locked; use one controlling client. Failure to load the catalog does not clear existing abilities.

### Migrating from the Old Familiar Catalog

Existing `robot.familiarAbilities` entries are not erased or transferred without confirmation. **Select saved legacy entries** only checks recognized entries in the panel; save the daily set afterward to import them onto the actual familiar.

Old Items on the `character` robot are not deleted. **Legacy robot synchronization no longer creates familiar Items on a character actor:** those selections are reported as skipped, while existing applied Items remain protected. After making a backup, review and manually remove unwanted old effects so they do not remain active on both the robot and familiar.

Vital Bond and Spell Delivery are separate catalog entries. Their descriptions remain separate without adding unsupported mechanics.

## Master and Robot Companion

1. Create the master and a **separate actor of type `character`** for the robot, not an NPC.
2. Open **Module Settings → SF2e Missing Tech Pets → Open tools**, select the master, open Tech Pets and link the companion. You must be able to edit both actors.
3. Drag the chassis from the **Robot Chassis** compendium onto the companion sheet. If two sizes are allowed, configure the size through the Item choice or the advanced tools in module settings.
4. Inspect the result on the companion sheet. Select and replace customizations in its **Feats/Abilities → Robot customizations** panel.
5. Set the robot's actual grade. **Advanced/Superior** allows the advanced maneuver to be granted, but the selector **does not grant grade feats or improve statistics**.

The link is stored in both directions. Self-links, cycles, companion chains, and assigning a companion that is already linked to another master are blocked. Opening Tech Pets from a linked companion uses the master's profile.

A chassis from the module's own compendium can be dragged onto a separate character sheet using native drag-and-drop. Without a linked master, that actor is treated as a standalone companion rather than as a link to itself. An ancestry from a third-party pack remains user-controlled; the module does not assume permission to overwrite it.

An actor cannot have two ancestry Items. The module **does not delete** a conflicting ancestry. Review it manually first.

## Included Compendiums

| Pack | Contents |
| --- | --- |
| `robot-chassis` | 5 ancestry Items: Agile, Imitator, Powerful, Surveillance, and Tank |
| `robot-advanced-maneuvers` | 5 action Items: Surgical Strike, Disturbing Display, Hydraulic Flipper, Blinding Spotlight, and Ram Slam |
| `robot-support` | 5 separate action Items containing each chassis's Support Benefit |
| `familiar-abilities` | 38 action Items: Pet, Familiar, and Master abilities from Tech Core |
| `robot-customizations` | 36 bonus feat Items with descriptions; 10 contain passive Rule Elements |

Each family also has a `pf2e-` collection with the same IDs, slugs and types. Chassis use native ancestry fields and Rule Elements for base attribute modifiers, HP, size, Speeds, senses, skill training, traits and Strikes. `GrantItem` uses the active system's Companion Compendia class:

```text
SF2e: Compendium.pf2e-animal-companions.sf-AC-Features.Item.KKOgokqHa7RjVDN6
PF2e: Compendium.pf2e-animal-companions.AC-Features.Item.KKOgokqHa7RjVDN6
```

If the class is unavailable, the module does not create an incomplete new chassis. Existing Items are retained and a warning is shown.

The Support Benefit is granted with the chassis. The advanced maneuver is granted at Advanced/Superior grade. Actions can be opened on the native sheet and sent to chat. Additional tools remain available from module settings.

**Maneuvers and Support Benefits are resolved manually.** The module does not perform their Strikes, Demoralize checks, saving throws, movement, durations, or conditional application of conditions. Condition links in descriptions do not mean those conditions are applied automatically.

## Imitator Chassis

Before configuration, Imitator has **no generated imitated Strike**. The Medium size and 25-foot Speed in its source ancestry are placeholders, not a selected creature form. Configure the chassis before play.

1. Select Imitator, then open its configuration.
2. Find a living ancestry in the active system's ancestry pack, or an animal from Companion Compendia's pack for that system.
3. The source must explicitly provide a size, Speeds, and at least one unconditional melee unarmed attack.
4. Choose a specific attack and confirm.

The source UUID/name, size, Speeds, and selected attack are saved. The robot receives **1d4 damage of the selected type**, with the unarmed, agile, and finesse traits. Other bonuses, traits, and Rule Elements are not copied. The selection persists through repeated synchronization.

Conditional, calculated, and ranged attacks, as well as sources with ambiguous size, are rejected. Not all living ancestries provide a suitable Strike, so **not every creature form is available**. Arbitrary NPC sources and copying all of a creature's features are not supported.

## Customizations, Abilities, and Slots

- The 36 customizations have their own source Items; search tools and the compendium browser are retained. The 38 familiar abilities now have standalone Items and a dedicated panel.
- Imports use Item packs for the active system; opposite-system packs and Rule references, incompatible metadata and unknown Rule Element keys are rejected. Anachronism UUID redirects are used for curated SF2e features in PF2e, not as permission to import arbitrary opposite-system documents.
- Known robot customizations use exact own-catalog IDs, never familiar Items with matching names. For other searches, exact slug/identifier matches are searched across all allowed packs **before** falling back to names. Item types are checked. Imports preserve Rules and `flags.core.sourceId`.
- Unidentified third-party packs without system metadata are not automatically considered safe.
- If a source is unavailable, the selection stays in the profile; effects are not invented. A previously applied Item is not deleted merely because its source is temporarily unavailable.
- A manual entry is a note and slot bookkeeping, not a functioning Rule Element.
- Additional slots can be assigned by an exact slug in the `slotGrantRules` setting or through the Item flag `flags.sf2e-missing-tech-pets.modificationSlots`.
- The generic `customization` slug does not grant slots by itself. Duplicate sources do not grant slots repeatedly, and a rule plus a flag on the same Item do not stack.
- Selections exceeding available slots are saved but skipped during synchronization. A catalog grade does not replace checking all gameplay prerequisites.

## Data Safety and Upgrading

Synchronization is serialized for each controller/companion. Running it again does not recreate Items that have already been applied.

Only module-generated Items belonging to the relevant `controllerActorId` and matching their control snapshot can be deleted or replaced. Valid declared ChoiceSet changes alone remain manageable and are preserved; changing text, other rules or using invalid choice values protects the Item. Manually added Items and Items belonging to other controllers are retained.

**Older Items may not have a snapshot.** They are protected from automatic replacement even if they have an old module marker. After making a backup, compare them against the new compendiums. To migrate, manually remove only confirmed old chassis copies and their related old actions, then drag the new chassis from its compendium and synchronize again. Do not delete unrelated Items or clear flags in bulk.

Legacy entries without a `controllerActorId` are recognized only when the previous companion is confirmed through `lastAutomationSync`. A missing snapshot still prevents automatic deletion.

## Mechanic: Exocortex

Open **Tech Pets → Mechanic: Exocortex** on the mechanic's character. First choose the exocortex through the **native SF2e class feature**. The panel recognizes owned Drone, Mine and Turret features, including multiple variants obtained legitimately. It does not grant the class, dedication, feats or an extra exocortex.

The integration uses native feature/action UUIDs reviewed in **SF2e 1.7.0**; in PF2e it requires Anachronism redirects. It does not distribute duplicate class features. **Add missing native actions to my sheet** imports only eligible Modify, Deploy Mine, Detonate Mine, Deploy Turret, Reposition Exocortex and Synchronized Step actions, preserving their source IDs and avoiding duplicate imports. Existing and manually imported actions are not replaced or deleted. Native rules can be opened or sent to chat.

### Drone

- Link the mechanic and a separate **character** companion in Tech Pets; drag its chassis from the Robot Chassis compendium. The link must be reciprocal.
- The Drone feature adds **two restricted commercial customization slots** to that linked companion's profile. These are separate from ordinary slots: higher-grade customizations and manual notes cannot use them. Their removal does not erase profile selections.
- Save whether Command costs **one or two actions**, as a reminder of the normal two or three drone actions. The module does not spend actions or command tokens.
- Confirm completion of repair/daily preparations to restore the linked drone's HP, or completion of its one-minute emergency reboot to restore **1 HP from 0**. These buttons update only HP; they do not advance time, remove conditions or apply shutdown immunity.
- Control range, exclusive owner control/repair, Desperate Repair, Killbot and critical-specialization reminders are shown. Mod effects and range enforcement remain manual.

### Mines

- Track prepared/carried mines separately from individually labelled deployed mines. Capacity, damage dice, burst radius and Smart Mine target allowance follow owner level and Intelligence.
- Record deployment, collect all deployed mines, craft up to two mines after ten minutes, or confirm daily preparations to replace all unused mines. Deployed mines do not occupy carried slots. Collection preserves all remaining mines even when it exceeds the carried limit; resolve excess capacity manually.
- Detonating a selected mine uses the **native SF2e DamageRoll**, then removes its actor and token. A failed or cancelled roll leaves the mine recorded. Base damage scales with level; owned mod Rule Elements add only their supported bonuses.
- Placement creates a real Small actor and token. The module does not measure distance, choose targets, roll saves, apply damage or trigger reactions. Check the action/reaction and trigger yourself. Smart Mine exclusions and Targeting Mine remain manual choices.

### Turret

- Track one stored/deployed turret, current HP, broken threshold, Hardness, mechanic class DC as AC and base Fortitude/Reflex bonuses, including Proficiency Without Level.
- Choose and save one of **six arrays**, with its base damage type, range increment, trait and weapon group. Changing an array requires its normal time or the appropriate mod; this panel does not apply a mod's duration.
- At 0 HP the recorded turret returns to storage. Confirm daily repair for full HP. At the end of the owner's active combat turn, the stored turret's **+5 HP** button can be used once for that turn. Recovery is explicitly confirmed, not an automatic combat hook.
- This creates a persistent hazard actor and a separate native weapon proxy on the mechanic. Strikes use the owner's proficiency and shared MAP; range, targeting and cover are checked from the turret's square. A broken turret cannot Strike.

### Interaction with the mechanic class

The panel distinguishes a full mechanic from **Mechanic Dedication**: dedication alone does not unlock Modify. It accounts for Mobile Exocortex, Remote Mods, Enduring Mods, Manifold Mods and Instant Mods in the displayed eligibility/ranges and action imports. The archetype Remote Mods range does not receive the full mechanic's level-15 increase. These reminders do not automatically apply mod Rule Elements, duration, daily targets or the once-per-round limit.

State is stored in `flags.sf2e-missing-tech-pets.exocortex`, separately from existing robot/familiar profiles. Operations are queued per owner in the current client. Simultaneous edits from different clients are not transaction-locked: use one controlling client for device bookkeeping.

## API

```js
const api = game.modules.get("sf2e-missing-tech-pets").api;
api.open(actor);
await api.linkActors(owner, companion);
await api.syncAutomation(owner);
```

The existing methods are retained:

- `open(actor?)`
- `searchFamiliarItems(actor?, query?)`
- `getRobotData(actor)`
- `setRobotData(actor, data)`
- `getModificationSlots(actor)`
- `getLinkedCompanion(actor)`
- `resolveImportTarget(actor, item)`
- `addCompendiumItem(actor, item)`
- `syncAutomation(actor)`
- `registerSlotGrant(slug, slots = 1)`
- `openPack(key, actor?)`

`linkActors(owner, companion)` was added; passing `null` for the companion breaks the link. `setRobotData` validates links. A companion assigned to another master must first be released from its old link.

`syncAutomation` returns `{ applied, skipped, reason? }`. **`applied` counts applied or retained Items, not automatically executed gameplay effects.**

Additional familiar API methods, separate from robot linking:

```js
await api.openFamiliar(owner); // Also accepts a familiar actor.
const familiar = await api.createFamiliar(owner, "wis");
await api.linkFamiliar(owner, familiar, "wis");
await api.syncFamiliarAbilities(owner, familiar, ["flier", "tough"]);
```

`createFamiliar` requires that no other familiar is already linked and does not grant a feat to the master. `linkFamiliar` does not take over an actor assigned to another master. `syncFamiliarAbilities` returns `{ created, removed, protected }` and rejects invalid selections with a localized error. These methods work in either supported system without Companion Compendia.

Additional exocortex API (all existing methods remain available):

```js
await api.openExocortex(owner);
const state = api.getExocortexData(owner); // Detached, normalized snapshot.
await api.updateExocortex(owner, "mine-craft");
await api.installExocortexActions(owner);
```

`updateExocortex` accepts `mine-daily` (`confirmed: true`), `mine-craft`, `mine-deploy` (`label`), `mine-collect`, `mine-detonate` (`id`, `damageType: "fire" | "piercing"`), `turret-array` (`array`), `turret-deploy` (toggle), `turret-hp` (`hp`), `turret-repair` (`confirmed: true`), `turret-recover`, and `drone-command` (`actions: 1 | 2`) as its operation; arguments are the third parameter. This is explicit bookkeeping, not permission to bypass gameplay costs. `getModificationSlots` now also returns `generalTotal` and `commercialSlots`; `free` includes restricted slots and is not an allowance for arbitrary grades.

## Development and Checks

The runtime code uses ES modules and does not require a JavaScript build step. For development, use Node.js 22+ and run `npm install`.

```sh
npm run build:packs
npm run check
npm test
```

Robot Item sources are defined in `data/robot-chassis.json` and `scripts/item-sources.mjs`. Familiar sources are defined in `data/familiar-abilities.json` and `scripts/familiar-sources.mjs`.

Customization sources are defined in `data/robot-customizations.json` and `scripts/customization-sources.mjs`.

The build updates ten `packs/src/` directories, textual `.db` snapshots, ready-to-use LevelDB directories and ten Babele translation files. The five PF2e collections have the `pf2e-` prefix; each system has 89 documents. The manifest loads **LevelDB**. The `.db` files are retained as inspectable text snapshots, not as the runtime pack paths for v14.

Reproducibility is checked by document contents and IDs, not by byte-for-byte equality of LevelDB's internal files. The builder first compiles into a temporary directory, extracts and verifies the documents, then replaces the generated pack.

See the [changelog](CHANGELOG.md) and [release instructions](docs/RELEASING.md). These supporting documents are in Russian.

## Sources and Rights

- [PF2e Companion Compendia](https://github.com/TikaelSol/PF2e-Animal-Companions)
- [PF2e Runesmith Assistant](https://github.com/ChasarooniZ/pf2e-runesmith-assistant)
- Starfinder Tech Core: robot companions, customizations and familiar abilities are described in this module's local Item packs.
- [PF2e Familiar Ability Sources](https://github.com/foundryvtt/pf2e/tree/master/packs/familiar-abilities)

English remains the source language of the catalogs and Item packs. Russian translations cover all 89 module-owned documents, including descriptions, support and maneuvers. Catalogs, source previews and newly applied Items use built-in localization without Babele. Enable Babele for Russian names and descriptions in native compendium browsing; ID-keyed files for both systems are included. See `LICENSE.txt` for legal notices and caveats. The archive does not itself establish permission to redistribute third-party content publicly.
