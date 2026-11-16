import test from "node:test";
import assert from "node:assert/strict";
import { assertReferenceFree } from "../tools/reference-check.mjs";

test("Reference validation rejects linked domains, aliases and localized names", () => {
  const samples = [
    "https://2e." + "ao" + "nsrd.com/rules/example",
    "https://2e." + "ao" + "nprd.com/",
    "Archives of " + "Neth" + "ys",
    "AO" + "N",
    "Архивы Не" + "фиса",
  ];
  for (const text of samples)
    assert.throws(() => assertReferenceFree(text, "fixture"), /External rules reference in fixture/);
});
test("Local UUIDs, publication notices and module names remain allowed", () => {
  for (const text of [
    "Compendium.sf2e.feats.Item.Lxp9qwru0FVWmoE7",
    "Compendium.sf2e-missing-tech-pets.robot-chassis.Item.665ae48461a79f96",
    "Starfinder Tech Core; publication license ORC",
    "Manual automation requires confirmation",
  ]) assert.doesNotThrow(() => assertReferenceFree(text, "fixture"));
});
