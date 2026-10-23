# 0.13.0 — Mechanic Exocortex

- New **Tech Pets → Mechanic: Exocortex** manager recognizes the native Drone, Mine and Turret features, including multiple legitimately owned variants.
- Imports missing native SF2e actions without replacing or duplicating existing Items. Opens rules and sends them to chat.
- Drone: two additional commercial-only customization slots, saved Command cost, and confirmed repair / emergency-reboot HP updates for the linked character companion.
- Mines: carried supply and named deployed-mine ledger, daily replacement, crafting and collection. Detonation rolls native typed fire or piercing damage and spends only the selected mine.
- Turret: level-scaled HP, broken threshold, Hardness, mechanic-DC AC, base saves, six arrays, stored/deployed state and once-per-turn confirmed stored recovery.
- Class progression and archetype differences are shown without granting feats or silently applying mods.
- Existing robot/familiar data, compendiums, localization fixes, button settings and public API are preserved.

**Automation boundaries:** no scene placement, distance enforcement, automatic reactions, target selection, save rolls or damage application. Turret Strikes/upgrades/shared MAP and mod effects/durations remain manual. State operations are queued within one client, not transaction-locked across clients.

Requires Foundry VTT v14, Starfinder 2e 1.6.0+ and active PF2e Companion Compendia 7.6.3+.

Reload the world page after updating. Choose the exocortex through the native class feature before opening its manager. For a drone, create a reciprocal character-companion link in Tech Pets.
