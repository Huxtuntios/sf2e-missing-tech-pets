# SF2e Missing Tech Pets

**Version 0.12.0.** Tech Core robot companions and native familiars: items and management tools for Foundry VTT v14 / Starfinder Second Edition. This continues the existing 0.10.2 project rather than replacing it with a new module.


## Compatibility and Required Dependency

- Foundry VTT **v14**, minimum **14.361**. The `minimum`, `verified`, and `maximum` fields limit support to v14. `verified: "14"` is a compatibility declaration, not a report of live testing on a particular build.
- Starfinder Second Edition: **sf2e 1.6.0+**.
- **PF2e Companion Compendia (`pf2e-animal-companions`) 7.6.3+ is required and must be active.** It is declared in `relationships.requires`. The main interface and integration do not start without it.
- The dependency's source code, SF2e items, release 7.7.3, and the SF2e reference fixes in 7.6.3 were reviewed. Its minimum required version has not been raised.

Dependency manifest:

```text
https://github.com/TikaelSol/PF2e-Animal-Companions/releases/latest/download/module.json
```

## Installation and Updating

1. Back up your world, actors, and existing module folder. Use a copy of your world for the first test.
2. With Foundry shut down, extract the ZIP into `Data/modules/`. The resulting manifest path should be `Data/modules/sf2e-missing-tech-pets/module.json`, without an extra nested folder.
3. When updating, replace the old module folder completely. Do not mix files from different versions.
4. Install or update the required dependency, then enable both modules in your SF2e world.
5. Open the character sheet's header menu and choose **Tech Pets**. A world setting can hide this entry.

The archive includes ready-to-use **LevelDB compendiums**. Node.js and a build step are not required for manual installation.

## Familiars on Character Sheets

SF2e 1.6.0 already includes the native `familiar` actor type, its system sheet, `system.master.id` / `system.master.ability`, inherited master statistics, and Rule Element processing. Version 0.12.0 adds convenient entry points and Tech Core content. It does not copy PF2e's actor engine or duplicate the system's calculations.

1. Choose **Familiars** from the **character** sheet's header menu. The same entry is available on the native familiar sheet. The familiar ability catalog in Tech Pets also opens this panel.
2. Create a native familiar, or select an existing `familiar` actor that is not assigned to another master. Select the master's attribute and click **Link / save attribute**. A newly created familiar copies the master's ownership permissions. Foundry still enforces permission to create actors; if you cannot create one, ask your GM to do so.
3. Open the familiar's native sheet and check its statistics. The module does not grant a familiar feat, determine whether the character is entitled to a familiar, or replace system methods.
4. Select and save a daily ability set. A positive `system.attributes.familiarAbilities.value` on the master is used as the allowance; otherwise, the panel defaults to the **2 abilities** specified by the familiar rules. An explicit allowance can be entered for house rules or feats that are not automated. Leave the field blank to restore automatic handling. **This is the panel's allowance:** it does not create feats or the master's native counter. If that counter is 0, the native sheet may continue to show 0 until an appropriate system item is added.
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

The `BaseSpeed`, `Sense`, `FlatModifier`, and `ActorTraits` schemas were checked against SF2e 1.6.0. Their actual application in a live game world has not yet been tested.

**The remaining 28 abilities provide rules text for manual resolution.** In particular:

- Construct does not automatically grant immunities.
- Elemental, Resistance, Skilled, Fast Movement, and Damage Avoidance require manual configuration of their choices or mechanics.
- Master abilities do not automatically change the master's resources, spells, Focus Points, or HP.
- Familiar Focus is assigned a cost of 2 actions, but the module neither spends those actions nor restores a Focus Point programmatically.

The panel checks required abilities for Construct, Elemental, Kinspeech, Master's Form, Plant Form, and Toolbearer, as well as the master's level for Kinspeech. Check all other prerequisites, choices, languages, spellcasting requirements, and effect eligibility against the descriptions.

Repeated selections of Skilled for different skills currently require native drag-and-drop and manual configuration; the panel selects one copy. Imports through the module's API or browser route familiar actions to the native familiar, not to a `character` robot. Native drag-and-drop remains a user-controlled operation: do not drop these Items onto the robot or master.

Changing the daily set removes only unchanged Items created by this panel for the current master. Manually added, third-party, edited, and innate Items are retained and count toward the allowance. Remove them deliberately on the native sheet if needed. Repeated or concurrent synchronization does not create duplicates. Failure to load the catalog does not clear existing abilities.

### Migrating from the Old Familiar Catalog

Existing `robot.familiarAbilities` entries are not erased or transferred without confirmation. **Select saved legacy entries** only checks recognized entries in the panel; save the daily set afterward to import them onto the actual familiar.

Old Items on the `character` robot are not deleted. **Legacy robot synchronization no longer creates familiar Items on a character actor:** those selections are reported as skipped, while existing applied Items remain protected. After making a backup, review and manually remove unwanted old effects so they do not remain active on both the robot and familiar.

At the time of review, AON appended Vital Bond's text to the end of Spell Delivery. The catalog separates that text into its existing Vital Bond entry without inventing any mechanics. The source reference and caveat are preserved.

## Master and Robot Companion

1. Create the master and a **separate actor of type `character`** for the robot, not an NPC.
2. Open Tech Pets on the master's sheet and select the companion. You must be able to edit both actors.
3. Choose a chassis from the catalog. If the chassis allows two sizes, select the desired size.
4. Apply the selected rules and inspect the result on the companion's sheet.
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

Chassis use native ancestry fields and Rule Elements for base attribute modifiers, HP, size, Speeds, senses, skill training, traits, and Strikes. The base companion class is granted through `GrantItem` from the dependency's **SF2e** pack:

```text
Compendium.pf2e-animal-companions.sf-AC-Features.Item.KKOgokqHa7RjVDN6
```

If the class is unavailable, the module does not create an incomplete new chassis. Existing Items are retained and a warning is shown.

The Support Benefit is granted with the chassis. The advanced maneuver is granted at Advanced/Superior grade. Actions can be opened on the sheet and sent to chat using the Tech Pets buttons.

**Maneuvers and Support Benefits are resolved manually.** The module does not perform their Strikes, Demoralize checks, saving throws, movement, durations, or conditional application of conditions. Condition links in descriptions do not mean those conditions are applied automatically.

## Imitator Chassis

Before configuration, Imitator has **no generated imitated Strike**. The Medium size and 25-foot Speed in its source ancestry are placeholders, not a selected creature form. Configure the chassis before play.

1. Select Imitator, then open its configuration.
2. Find a living ancestry in `sf2e.ancestries`, or an animal from Companion Compendia's SF2e ancestry pack.
3. The source must explicitly provide a size, Speeds, and at least one unconditional melee unarmed attack.
4. Choose a specific attack and confirm.

The source UUID/name, size, Speeds, and selected attack are saved. The robot receives **1d4 damage of the selected type**, with the unarmed, agile, and finesse traits. Other bonuses, traits, and Rule Elements are not copied. The selection persists through repeated synchronization.

Conditional, calculated, and ranged attacks, as well as sources with ambiguous size, are rejected. Not all living ancestries provide a suitable Strike, so **not every creature form is available**. Arbitrary NPC sources and copying all of a creature's features are not supported.

## Customizations, Abilities, and Slots

- The 36 customizations, search tools, and compendium browser are retained. The 38 familiar abilities now have standalone Items and a dedicated panel.
- Only compatible SF2e Item packs are used. PF2e packs, packs explicitly assigned to another system, PF2e references in Rules, and Rule Element keys unknown to the installed system are rejected.
- Exact slug/identifier matches are searched across all allowed packs **before** falling back to names. Item types are checked. Imports preserve Rules and `flags.core.sourceId`.
- Unidentified third-party packs without system metadata are not automatically considered safe.
- If a source is unavailable, the selection stays in the profile; effects are not invented. A previously applied Item is not deleted merely because its source is temporarily unavailable.
- A manual entry is a note and slot bookkeeping, not a functioning Rule Element.
- Additional slots can be assigned by an exact slug in the `slotGrantRules` setting or through the Item flag `flags.sf2e-missing-tech-pets.modificationSlots`.
- The generic `customization` slug does not grant slots by itself. Duplicate sources do not grant slots repeatedly, and a rule plus a flag on the same Item do not stack.
- Selections exceeding available slots are saved but skipped during synchronization. A catalog grade does not replace checking all gameplay prerequisites.

## Data Safety and Upgrading from 0.10.x

Synchronization is serialized for each controller/companion. Running it again does not recreate Items that have already been applied.

Only module-generated Items belonging to the relevant `controllerActorId` and matching their unchanged control snapshot can be deleted or replaced. Manually added Items, Items belonging to other controllers, and user-edited copies are retained.

**Items from 0.10.x do not have a snapshot.** They are protected from automatic replacement even if they have an old module marker. After making a backup, compare them against the new compendiums. To migrate, manually remove only confirmed old chassis copies and their related old actions, then select and synchronize again. Do not delete unrelated Items or clear flags in bulk.

Legacy entries without a `controllerActorId` are recognized only when the previous companion is confirmed through `lastAutomationSync`. A missing snapshot still prevents automatic deletion.

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

`createFamiliar` requires that no other familiar is already linked and does not grant a feat to the master. `linkFamiliar` does not take over an actor assigned to another master. `syncFamiliarAbilities` returns `{ created, removed, protected }` and rejects invalid selections with a localized error. These methods also require the mandatory dependency to be active.

## Development and Checks

The runtime code uses ES modules and does not require a JavaScript build step. For development, use Node.js 22+ and run `npm install`.

```sh
npm run build:packs
npm run check
npm test
```

Robot Item sources are defined in `data/robot-chassis.json` and `scripts/item-sources.mjs`. Familiar sources are defined in `data/familiar-abilities.json` and `scripts/familiar-sources.mjs`.

The build updates the four `packs/src/` directories, textual `.db` snapshots, and ready-to-use LevelDB directories. The manifest loads **LevelDB**. The `.db` files are retained as inspectable text snapshots, not as the runtime pack paths for v14.

Reproducibility is checked by document contents and IDs, not by byte-for-byte equality of LevelDB's internal files. The builder first compiles into a temporary directory, extracts and verifies the documents, then replaces the generated pack.


## Sources and Rights

- [PF2e Companion Compendia](https://github.com/TikaelSol/PF2e-Animal-Companions)
- [PF2e Runesmith Assistant](https://github.com/ChasarooniZ/pf2e-runesmith-assistant)
- [Robot Companions — Archives of Nethys](https://2e.aonsrd.com/companions/types/robot)
- [Robot Customizations — Archives of Nethys](https://2e.aonsrd.com/companions/types/robot/customizations)
- [Familiar Abilities — Archives of Nethys](https://2e.aonsrd.com/familiars/abilities)
- [Familiar Rules — Archives of Nethys](https://2e.aonsrd.com/rules/1437-familiars)
- [PF2e Familiar Ability Sources](https://github.com/foundryvtt/pf2e/tree/master/packs/familiar-abilities)

The interface is localized in English and Russian. Original rules and catalog names/descriptions are primarily in English. See `LICENSE.txt` for legal notices and caveats. The archive does not itself establish permission to redistribute third-party content publicly.
