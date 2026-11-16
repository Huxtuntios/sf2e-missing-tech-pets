import test from "node:test";
import assert from "node:assert/strict";
const hooks = new Map();
globalThis.Hooks = { once: (name, callback) => hooks.set(name, callback) };
const { registerBabeleTranslation } = await import("../scripts/babele.mjs");
test("Babele bootstrap hook uses the public API once, including frozen facades", () => {
  const calls = [];
  const api = Object.freeze({ register: data => calls.push(data) });
  assert.equal(hooks.get("babele.init"), registerBabeleTranslation);
  assert.equal(registerBabeleTranslation(api), true);
  assert.equal(registerBabeleTranslation(api), false);
  assert.deepEqual(calls, [{ module: "sf2e-missing-tech-pets", dir: "lang/babele/ru", lang: "ru" }]);
  assert.deepEqual(Object.keys(api), ["register"]);
});
test("Absent or incomplete Babele does not block local translation", () => {
  assert.equal(registerBabeleTranslation(null), false);
  assert.equal(registerBabeleTranslation({}), false);
  assert.equal(registerBabeleTranslation({ register: true }), false);
});
test("Rejected bootstrap registration changes no foreign API or settings", () => {
  const api = Object.freeze({ register() { throw new Error("runtime already initialized"); } });
  const warning = console.warn; const warnings = [];
  console.warn = (...args) => warnings.push(args);
  try { assert.equal(registerBabeleTranslation(api), false); }
  finally { console.warn = warning; }
  assert.equal(warnings.length, 1);
  assert.deepEqual(Object.keys(api), ["register"]);
});
