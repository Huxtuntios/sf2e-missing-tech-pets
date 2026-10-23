# 0.16.0 — PF2e Dailies integration

- Optional PF2e Dailies 4.23.1+ integration: prepare the 38 Tech Core familiar abilities in its normal daily workflow.
- Explicit per-owner/familiar connection in the existing familiar abilities section; no new character-header buttons.
- Only the owner's standard familiar set is disabled, with safe restoration on disconnect. The local editor is hidden while connected.
- Capacity, known prerequisites, duplicate prevention, stable UUIDs and protected Items are handled by the existing synchronizer.
- Rest removes only this module's unchanged managed daily Items; innate, manual, edited and third-party Items remain protected.
- Local selection remains available without a compatible Dailies API. Companion Compendia 7.6.3+ remains required.

Close existing preparation windows before switching modes. If temporary abilities from the standard Dailies set are present, rest through Dailies first. This integration does not automate all active ability effects or repeatable Skilled variants.

GitHub release tag: `v0.16.0`.
