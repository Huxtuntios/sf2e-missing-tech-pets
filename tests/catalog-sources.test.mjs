import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { catalogDocument, openCatalogSource } from "../scripts/catalog-sources.mjs";

const custom = JSON.parse(await readFile(new URL("../data/robot-customizations.json", import.meta.url), "utf8"));
const entry = custom.entries[0];
let rendered;
class TemporaryItem {
  constructor(source) { this.source = structuredClone(source); }
  toObject() { return structuredClone(this.source); }
  get sheet() { return { render: (open) => { rendered = { open, document: this }; return this; } }; }
  static create() { throw new Error("A source viewer must not create world documents"); }
}
function setup(system = "sf2e") {
  rendered = null;
  globalThis.game = { system: { id: system }, packs: new Map(), i18n: { localize: (key) => key } };
  globalThis.CONFIG = { Item: { documentClass: TemporaryItem } };
}
for (const system of ["sf2e", "pf2e"]) {
  test(`${system}: native pack document is opened without copying or writing`, async () => {
    setup(system);
    const document = new TemporaryItem({ name: "Pack document", type: "feat", system: { slug: entry.id, description: { value: "<p>Pack rules</p>" } } });
    let requested;
    const collection = "sf2e-missing-tech-pets." + (system === "pf2e" ? "pf2e-" : "") + "robot-customizations";
    game.packs.set(collection, {
      getIndex: async () => [{ _id: "local", type: "feat", system: { slug: entry.id } }],
      getDocument: async (id) => { requested = id; return document; },
    });
    assert.equal(await catalogDocument("robot-customizations", entry), document);
    await openCatalogSource("robot-customizations", entry);
    assert.equal(requested, "local");
    assert.deepEqual(rendered, { open: true, document });
  });
  test(`${system}: missing pack shows temporary catalog Item without world writes`, async () => {
    setup(system);
    const document = await catalogDocument("robot-customizations", entry);
    assert.ok(document instanceof TemporaryItem);
    assert.equal(document.source.system.slug, entry.id);
    assert.equal(game.packs.size, 0);
    assert.match(document.source.flags.core.sourceId, system === "pf2e" ? /\.pf2e-robot-customizations\./ : /\.robot-customizations\./);
    await openCatalogSource("robot-customizations", entry);
    assert.equal(rendered.open, true);
  });
}
test("A similar name or incorrect document type never substitutes a different catalog source", async () => {
  setup();
  let calls = 0;
  game.packs.set("sf2e-missing-tech-pets.robot-customizations", {
    getIndex: async () => [{ _id: "other", name: entry.name, type: "action", system: { slug: entry.id } }],
    getDocument: async () => { calls++; },
  });
  const document = await catalogDocument("robot-customizations", entry);
  assert.equal(calls, 0);
  assert.equal(document.source.type, "feat");
});
test("Invalid source category or missing entry is rejected without writes", async () => {
  setup();
  await assert.rejects(catalogDocument("__proto__", entry), /SourceUnavailable/);
  await assert.rejects(catalogDocument("robot-customizations", null), /SourceUnavailable/);
});
