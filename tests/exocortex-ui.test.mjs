import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
globalThis.foundry = { applications: { api: { DialogV2: class {} } } };
const { renderExocortexSheet } = await import("../scripts/exocortex-ui.mjs");
const ID = "sf2e-missing-tech-pets";
let owner, root, nodes, writes, resourceRows, resources, hasNativeResources, insertedResources;
beforeEach(() => {
  writes = [];
  nodes = [];
  resourceRows = [];
  insertedResources = [];
  hasNativeResources = true;
  owner = { id: "mechanic", type: "character", name: "Mechanic", level: 1, isOwner: true, system: { abilities: { int: { mod: 4 } } }, items: [{ type: "class", system: { slug: "mechanic" } }, { type: "feat", system: { slug: "mine", traits: { otherTags: ["mechanic-exocortex"] } } }], getStatistic: () => ({ dc: { value: 19 } }), getFlag: (scope, key) => key === "exocortex" ? { mines: { prepared: 14, deployed: [{ id: "existing", label: "Mine" }] } } : undefined, setFlag: async (...args) => writes.push(args) };
  const target = { prepend: panel => { nodes.unshift(panel); } };
  const resourceList = { append: row => resourceRows.push(row) };
  resources = { querySelector: selector => selector === "ol" ? resourceList : null };
  const perceptionHeader = { before: section => insertedResources.push(section) };
  const perception = { previousElementSibling: perceptionHeader };
  root = { querySelector: selector => selector.includes('data-tab="actions"') ? target : selector === ".subsection.resources" ? (hasNativeResources ? resources : insertedResources.at(-1) ?? null) : selector === "section.perception" ? perception : null, querySelectorAll: selector => selector === ".sfmtp-exocortex-inline" ? [...nodes] : selector === ".sfmtp-mine-resource" ? [...resourceRows] : [] };
  globalThis.game = { system: { id: "sf2e" }, actors: new Map(), scenes: [], modules: new Map(), i18n: { localize: key => key } };
  globalThis.document = { createElement: tag => ({ tagName: tag.toUpperCase(), innerHTML: "", dataset: {}, children: [], listeners: new Map(), append(...children) { this.children.push(...children); }, addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }, querySelector(selector) { return selector === "ol" ? this.children.find(child => child.tagName === "OL") : { value: "14", addEventListener: () => {} }; }, remove() { const index = nodes.indexOf(this); if (index >= 0) nodes.splice(index, 1); const row = resourceRows.indexOf(this); if (row >= 0) resourceRows.splice(row, 1); } }) };
  globalThis.foundry = { utils: { escapeHTML: value => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"), randomID: () => "resource-id" } };
});
test("mechanic sheet displays real carried count even when above the limit", () => {
  const panel = renderExocortexSheet({ actor: owner, render: () => {} }, root);
  assert.ok(panel.innerHTML.includes("14 / 8"));
  assert.ok(panel.innerHTML.includes("data-exo-count"));
  assert.ok(panel.innerHTML.includes("data-exo-sheet=\"mine-place\""));
  assert.equal(resourceRows.length, 1);
  assert.ok(resourceRows[0].innerHTML.includes('value="14"'));
  assert.ok(resourceRows[0].innerHTML.includes("/ 8"));
  assert.ok(resourceRows[0].innerHTML.includes('max="8"'));
  assert.equal(nodes.length, 1);
  assert.equal(writes.length, 0);
});

test("turret array can be changed directly from the mechanic sheet", () => {
  owner.items.push({ type: "feat", system: { slug: "turret", traits: { otherTags: ["mechanic-exocortex"] } } });
  const panel = renderExocortexSheet({ actor: owner, render: () => {} }, root);
  assert.ok(panel.innerHTML.includes("data-exo-array"));
  assert.ok(panel.innerHTML.includes('value="laser" selected'));
  assert.ok(panel.innerHTML.includes('data-exo-sheet="turret-array"'));
});

test("mine resource creates a native resources block when the sheet has none", () => {
  hasNativeResources = false;
  renderExocortexSheet({ actor: owner, render: () => {} }, root);
  assert.equal(insertedResources.length, 1);
  assert.equal(insertedResources[0].className, "subsection resources");
  assert.equal(insertedResources[0].children.length, 2);
  assert.equal(insertedResources[0].children[1].children.length, 1);
});
test("rerender replaces only its own panel without adding duplicate controls", () => {
  renderExocortexSheet({ actor: owner, render: () => {} }, root);
  renderExocortexSheet({ actor: owner, render: () => {} }, root);
  assert.equal(nodes.length, 1);
  assert.equal(writes.length, 0);
});
test("read-only character gets disabled controls and never writes on render", () => {
  owner.isOwner = false;
  const panel = renderExocortexSheet({ actor: owner, render: () => {} }, root);
  assert.ok(panel.innerHTML.includes("disabled"));
  assert.equal(writes.length, 0);
});
test("non-mechanics and sheets without the verified actions container stay untouched", () => {
  const app = { actor: { type: "character", items: [] } };
  assert.equal(renderExocortexSheet(app, root), null);
  assert.equal(renderExocortexSheet({ actor: owner }, { ...root, querySelector: () => null }), null);
  assert.equal(nodes.length, 0);
});
