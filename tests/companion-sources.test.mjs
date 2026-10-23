// Проверки источников и чистых расчётов по снимку реальных предметов SF2e.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  COMPANION_SOURCES,
  matchesCompanionSource,
  ownedCompanionSources,
  sourceFamiliarAllowance,
  sourceCustomizationSlots,
  sourceWarnings,
} from "../scripts/companion-sources.mjs";
import { customizationCapacity } from "../scripts/exocortex-rules.mjs";
import {
  familiarAllowance,
  linkFamiliar,
  createFamiliar,
} from "../scripts/familiars.mjs";
const ID = "sf2e-missing-tech-pets";
const fixture = JSON.parse(
  await readFile(
    new URL("fixtures/native-companion-sources.json", import.meta.url),
    "utf8",
  ),
);
function native(slug) {
  const f = fixture.items.find((f) => f.item.system.slug === slug);
  const item = structuredClone(f.item);
  item.flags ??= {};
  item.flags.core = { sourceId: f.uuid };
  return item;
}
function actor(slugs = [], flags = {}) {
  return {
    id: "owner",
    type: "character",
    isOwner: true,
    items: slugs.map(native),
    system: { attributes: { familiarAbilities: { value: 0 } } },
    getFlag: (scope, key) => (scope === ID ? flags[key] : null),
  };
}
test("12 источников существуют в SF2e 1.6.0, точные UUID и типы не выдуманы", () => {
  for (const row of COMPANION_SOURCES.filter((row) => row.uuid)) {
    const fixtureRow = fixture.items.find((f) => f.uuid === row.uuid);
    assert.ok(fixtureRow, row.slug);
    assert.equal(fixtureRow.item.type, row.type);
    assert.equal(fixtureRow.item.system.slug, row.slug);
    assert.ok(matchesCompanionSource(native(row.slug), row));
  }
  assert.equal(COMPANION_SOURCES.find((row) => row.slug === "pet").uuid, null);
});
test("Имя, slug PF2e, action и неопределённая копия не дают источник", () => {
  const row = COMPANION_SOURCES[0];
  for (const item of [
    { name: "Familiar", type: "feat", system: {} },
    { type: "feat", system: { slug: "familiar" } },
    { ...native("familiar"), type: "action" },
    {
      ...native("familiar"),
      flags: { core: { sourceId: "Compendium.pf2e.feats.Item.x" } },
    },
    {
      ...native("familiar"),
      flags: {
        core: { sourceId: "Compendium.pf2e-animal-companions.AC-Feats.Item.x" },
      },
    },
  ])
    assert.equal(matchesCompanionSource(item, row), false);
  const copy = native("familiar");
  delete copy.flags.core;
  assert.equal(matchesCompanionSource(copy, row), true);
});
test("2/4/6 — абсолютный лимит; дубликаты и native не суммируются; ручной лимит приоритетен", () => {
  const familiar = { getFlag: () => undefined };
  const owner = actor(["familiar", "enhanced-familiar", "incredible-familiar"]);
  owner.items.push(native("enhanced-familiar"));
  assert.equal(sourceFamiliarAllowance(owner), 6);
  assert.equal(familiarAllowance(owner, familiar), 6);
  owner.system.attributes.familiarAbilities.value = 8;
  assert.equal(familiarAllowance(owner, familiar), 8);
  assert.equal(familiarAllowance(owner, { getFlag: () => 0 }), 0);
  assert.equal(sourceFamiliarAllowance(actor(["enhanced-familiar"])), 4);
});
test("Класс техноманта и Devoted Pet Owner сами не дают фамильяра/питомца", () => {
  const owner = actor(["devoted-pet-owner"]);
  owner.items.push({ type: "class", system: { slug: "technomancer" } });
  assert.deepEqual(
    ownedCompanionSources(owner).map((row) => row.kind),
    ["care"],
  );
  assert.equal(sourceFamiliarAllowance(owner), 2);
});
test("Источники с нарушенными требованиями дают предупреждение, не выдачу предметов", () => {
  assert.deepEqual(
    sourceWarnings(actor(["incredible-familiar", "tactical-drone"])),
    ["SourceMissingEnhanced", "SourceMissingDrone"],
  );
  const owner = actor(["familiar"]);
  owner.items.push({
    type: "feat",
    system: {
      slug: "pet",
      traits: { value: ["general"] },
      publication: { title: "Starfinder Tech Core" },
    },
  });
  assert.deepEqual(sourceWarnings(owner), ["SourcePetConflict"]);
  assert.equal(owner.items.length, 2);
});
test("Дрон: +2 своей ступени за каждое развитие и +1 за customization; Superior не суммируется", () => {
  const owner = actor([
    "drone",
    "tactical-drone",
    "advanced-drone",
    "superior-drone",
    "tactical-customization",
  ]);
  owner.items.push(native("superior-drone"), native("tactical-customization"));
  assert.deepEqual(sourceCustomizationSlots(owner), {
    slots: { commercial: 0, tactical: 3, advanced: 2, superior: 2 },
    grade: "superior",
  });
  assert.deepEqual(
    sourceCustomizationSlots(actor(["tactical-customization"])).slots,
    { commercial: 0, tactical: 0, advanced: 0, superior: 0 },
  );
});
test("Подтверждённые повторные выборы ограничены тремя; правило/флаг не начисляются повторно", () => {
  const owner = actor(["drone", "commercial-customization"], {
    sourceCounts: { "commercial-customization": 3 },
  });
  assert.equal(sourceCustomizationSlots(owner).slots.commercial, 3);
  assert.equal(
    sourceCustomizationSlots(owner, { "commercial-customization": 2 }).slots
      .commercial,
    0,
  );
  owner.items[1].flags[ID] = { modificationSlots: 2 };
  assert.equal(sourceCustomizationSlots(owner).slots.commercial, 0);
  const invalid = actor(["drone", "commercial-customization"], {
    sourceCounts: { "commercial-customization": 300 },
  });
  assert.equal(sourceCustomizationSlots(invalid).slots.commercial, 1);
});
test("Ограниченный слот не принимает другую ступень и ручную заметку", () => {
  const mod = (grade) => ({ grade, catalogId: grade, cost: 1 });
  const commercial = mod("commercial"),
    tactical = mod("tactical"),
    advanced = mod("advanced"),
    manual = { manual: true, cost: 1 };
  const capacity = customizationCapacity(
    [commercial, tactical, advanced, manual],
    0,
    1,
    { tactical: 1 },
  );
  assert.deepEqual(capacity.accepted, [commercial, tactical]);
  assert.deepEqual(capacity.rejected, [advanced, manual]);
  assert.equal(capacity.free, 0);
});
test("При активном ручном Pet familiar не создаётся/не связывается, данные сохраняются", async () => {
  globalThis.game = {
    system: { id: "sf2e" },
    modules: new Map([["pf2e-animal-companions", { active: true }]]),
    actors: new Map(),
    i18n: { localize: (key) => key, translations: {} },
  };
  const profile = {
    enabled: true,
    name: "Test",
    abilities: ["flier", "darkvision"],
  };
  const owner = actor([], { petProfile: profile });
  await assert.rejects(createFamiliar(owner));
  await assert.rejects(linkFamiliar(owner, { ...actor(), type: "familiar" }));
  assert.equal(profile.enabled, true);
});
