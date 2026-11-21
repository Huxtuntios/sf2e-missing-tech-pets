import { systemId } from "./system-context.mjs";

// Допустимый выбор ChoiceSet — не ручная правка. Снимок сверяется с подстановкой
// каждого объявленного варианта, поэтому подходят и снимки прежних версий.
// Общий помощник для синхронизации кастомизаций и способностей фамильяров.
export function choiceVariants(source, system = systemId()) {
  const rules = (source.system?.rules ?? []).filter(
    (rule) =>
      rule?.key === "ChoiceSet" &&
      typeof rule.flag === "string" &&
      Array.isArray(rule.choices) &&
      rule.choices.length,
  );
  if (!rules.length) return [];
  const selections = source.flags?.[system]?.rulesSelections ?? {};
  const valid = (rule, value) =>
    value === undefined ||
    value === null ||
    rule.choices.some((choice) => choice?.value === value);
  if (
    rules.some(
      (rule) => !valid(rule, rule.selection) || !valid(rule, selections[rule.flag]),
    )
  )
    return [];
  const options = rules.map((rule) => [
    undefined,
    null,
    ...rule.choices.map((choice) => choice.value),
  ]);
  if (options.reduce((total, list) => total * list.length, 1) > 256) return [];
  let combinations = [[]];
  for (const list of options)
    combinations = combinations.flatMap((prefix) =>
      list.map((value) => [...prefix, value]),
    );
  return combinations.map((values) => {
    const variant = foundry.utils.deepClone(source);
    const variantRules = variant.system.rules.filter(
      (rule) =>
        rule?.key === "ChoiceSet" &&
        typeof rule.flag === "string" &&
        Array.isArray(rule.choices) &&
        rule.choices.length,
    );
    // Сохранённый null-флаг остаётся пустым даже при выбранном rule.selection.
    const flags = variant.flags?.[system]?.rulesSelections;
    variantRules.forEach((rule, index) => {
      const value = values[index];
      if (value === undefined) delete rule.selection;
      else rule.selection = value;
      if (flags && Object.hasOwn(flags, rule.flag) && flags[rule.flag] !== null) {
        if (value === undefined) delete flags[rule.flag];
        else flags[rule.flag] = value;
      }
    });
    return variant;
  });
}

// Переносит подтверждённые выборы ChoiceSet из прежнего Item в целевой источник,
// чтобы обновление содержимого не сбрасывало выбор и не ломало снимок.
export function preserveRuleChoices(target, previous, system = systemId()) {
  const choices = previous?.flags?.[system]?.rulesSelections;
  const previousRules = previous?.system?.rules ?? [];
  for (const rule of target.system?.rules ?? []) {
    if (rule.key !== "ChoiceSet" || !rule.flag || !Array.isArray(rule.choices))
      continue;
    const priorRule = previousRules.find(
      (candidate) => candidate?.key === "ChoiceSet" && candidate.flag === rule.flag,
    );
    const value = priorRule?.selection ?? choices?.[rule.flag];
    if (value === undefined || value === null) continue;
    if (!rule.choices.some((choice) => choice?.value === value)) continue;
    rule.selection = value;
    target.flags ??= {};
    target.flags[system] ??= {};
    target.flags[system].rulesSelections ??= {};
    target.flags[system].rulesSelections[rule.flag] = value;
  }
  return target;
}