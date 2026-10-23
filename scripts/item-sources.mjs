// Единый источник предметов: используется и сборкой, и резервной загрузкой в мире.
export const MODULE_ID = "sf2e-missing-tech-pets";
export const COMPANION_CLASS_UUID =
  "Compendium.pf2e-animal-companions.sf-AC-Features.Item.KKOgokqHa7RjVDN6";
export const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const slugify = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const publication = {
  title: "Tech Core",
  authors: "",
  license: "ORC",
  remaster: true,
};
const conditionIds = {
  "off-guard": "AJh5ex99aV6VTggg",
  prone: "j91X7x0XSomq8d60",
  dazzled: "TkIyaNPgTZFBCCuh",
};
// UUID состояний сверены с извлечённым паком conditions SF2e 1.6.0.
export function ruleText(text) {
  return escapeHTML(text).replace(
    /\b(off-guard|prone|dazzled)\b/g,
    (word) =>
      `@UUID[Compendium.sf2e.conditions.Item.${conditionIds[word]}]{${word}}`,
  );
}
export function allowedSizes(entry) {
  if (entry.id === "imitator-chassis") return [];
  return /Small or Medium/i.test(entry.size)
    ? ["sm", "med"]
    : /Medium or Large/i.test(entry.size)
      ? ["med", "lg"]
      : ["sm"];
}
export function buildChassisSource(entry) {
  const sizes = allowedSizes(entry);
  const size = sizes.includes("med") ? "med" : (sizes[0] ?? "med");
  const rules = [
    {
      key: "GrantItem",
      uuid: COMPANION_CLASS_UUID,
      flag: "techPetCompanionClass",
      allowDuplicate: false,
    },
    {
      key: "ActorTraits",
      add: ["construct", "robot", "tech"],
      remove: ["animal"],
    },
  ];
  for (const [ability, value] of Object.entries(entry.abilities)) {
    // Прибавление к нулевой базе компаньона, а не override поверх улучшений его ступени.
    rules.push({
      key: "ActiveEffectLike",
      mode: "add",
      path: `system.abilities.${ability}.mod`,
      value,
    });
  }
  for (const [speed, value] of Object.entries(entry.speeds ?? {})) {
    if (speed !== "land")
      rules.push({ key: "BaseSpeed", selector: speed, value });
  }
  for (const skill of entry.skills ?? [])
    rules.push({
      key: "ActiveEffectLike",
      mode: "upgrade",
      path: `system.skills.${slugify(skill)}.rank`,
      value: 1,
    });
  if (sizes.length > 1)
    rules.push(
      {
        key: "ChoiceSet",
        flag: "chassisSize",
        adjustName: false,
        prompt: "SFMTP.ChooseSize",
        choices: sizes.map((value) => ({
          value,
          label: `SFMTP.Size.${value}`,
        })),
      },
      {
        key: "CreatureSize",
        value: "{item|flags.sf2e.rulesSelections.chassisSize}",
      },
    );
  for (const attack of entry.id === "imitator-chassis"
    ? []
    : (entry.attacks ?? [])) {
    const match = attack.damage.match(/(\d+)d(\d+) (\w+)/);
    const traits = [
      ...new Set([
        "unarmed",
        ...(attack.traits ?? []).map((x) =>
          slugify(x).replace("versatile-piercing", "versatile-p"),
        ),
      ]),
    ].filter((x) => x !== "ranged");
    rules.push({
      key: "Strike",
      slug: slugify(attack.name),
      category: "unarmed",
      label: attack.name,
      group: "brawling",
      replaceBasicUnarmed: true,
      traits,
      range: attack.range
        ? { increment: Number(attack.range.match(/\d+/)[0]) }
        : null,
      damage: {
        base: {
          dice: Number(match[1]),
          die: `d${match[2]}`,
          damageType: match[3] === "electric" ? "electricity" : match[3],
        },
      },
    });
  }
  const description = `<p>${escapeHTML(entry.special ?? entry.name)}</p><p><strong>Support Benefit:</strong> ${ruleText(entry.supportBenefit)}</p><p><strong>Advanced Maneuver:</strong> ${escapeHTML(entry.advancedManeuver)}</p><p>${escapeHTML(entry.rulesNote)}</p><p><a href="${escapeHTML(entry.sourceUrl)}">Archives of Nethys · Tech Core, p. 73</a></p>`;
  return {
    name: entry.name,
    type: "ancestry",
    img: "icons/commodities/tech/circuit-board.webp",
    effects: [],
    ownership: { default: 0 },
    system: {
      slug: entry.id,
      description: { value: description },
      publication: { ...publication },
      traits: {
        rarity: "common",
        value: ["construct", "robot", "tech"],
        otherTags: [],
      },
      hp: entry.hp,
      size,
      speed: entry.speeds?.land ?? 25,
      reach: 5,
      vision: entry.senses?.includes("darkvision")
        ? "darkvision"
        : "low-light-vision",
      boosts: { 0: { value: [] }, 1: { value: [] }, 2: { value: [] } },
      flaws: { 0: { value: [] } },
      languages: { value: [], custom: "" },
      additionalLanguages: { count: 0, value: [], custom: "" },
      items: {},
      rules,
    },
    flags: {
      [MODULE_ID]: { moduleProvided: true, chassisId: entry.id },
      sf2e: { rulesSelections: { chassisSize: null } },
    },
  };
}
export function buildManeuverSource(entry) {
  return buildAction(
    entry,
    entry.advancedManeuver,
    entry.advancedManeuverId,
    entry.advancedManeuverActions,
    entry.advancedManeuverTraits,
    entry.advancedManeuverDescription,
    "robot-maneuver",
  );
}
export function buildSupportSource(entry) {
  return buildAction(
    entry,
    `${entry.name}: Support`,
    `${entry.id}-support`,
    1,
    [],
    entry.supportBenefit,
    "robot-support",
  );
}
function buildAction(entry, name, slug, actions, traits, description, kind) {
  return {
    name,
    type: "action",
    img: "icons/svg/target.svg",
    effects: [],
    ownership: { default: 0 },
    system: {
      slug,
      actionType: { value: "action" },
      actions: { value: actions },
      category: "offensive",
      publication: { ...publication },
      description: {
        value: `<p>${ruleText(description)}</p><p>@Localize[SFMTP.ManualActionHint]</p><p><a href="${escapeHTML(entry.sourceUrl)}">Archives of Nethys · Tech Core, p. 73</a></p>`,
      },
      rules: [],
      traits: { rarity: "common", value: traits ?? [], otherTags: [] },
    },
    flags: {
      [MODULE_ID]: {
        moduleProvided: true,
        chassisId: entry.id,
        itemKind: kind,
      },
    },
  };
}
// Поддерживаются только явные данные происхождения/животного, без вычисления чужих RE.
export function imitationOptions(source) {
  const system = source.system ?? {};
  if (
    source.type !== "ancestry" ||
    !["tiny", "sm", "med", "lg", "huge", "grg"].includes(system.size)
  )
    return null;
  if (
    (system.traits?.value ?? []).some((x) =>
      ["construct", "undead"].includes(x),
    )
  )
    return null;
  const speeds = { land: system.speed };
  for (const rule of system.rules ?? []) {
    if (rule.key === "BaseSpeed") {
      if (rule.predicate?.length || typeof rule.value !== "number") return null;
      speeds[rule.selector] = rule.value;
    }
    if (["CreatureSize", "BattleForm"].includes(rule.key)) return null;
  }
  if (
    !Object.values(speeds).every(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value >= 0,
    )
  )
    return null;
  const attacks = (system.rules ?? [])
    .filter(
      (rule) =>
        rule.key === "Strike" &&
        rule.category === "unarmed" &&
        !rule.range &&
        !rule.predicate?.length &&
        typeof rule.label === "string" &&
        [
          "bludgeoning",
          "piercing",
          "slashing",
          "acid",
          "cold",
          "electricity",
          "fire",
          "sonic",
          "poison",
          "spirit",
          "mental",
          "force",
          "vitality",
          "void",
          "bleed",
        ].includes(rule.damage?.base?.damageType),
    )
    .map((rule) => ({
      name: rule.label,
      damageType: rule.damage.base.damageType,
    }));
  return attacks.length ? { size: system.size, speeds, attacks } : null;
}
export function validImitationChoice(choice) {
  return Boolean(
    choice?.sourceUuid?.startsWith("Compendium.") &&
    typeof choice.attack?.name === "string" &&
    [
      "bludgeoning",
      "piercing",
      "slashing",
      "acid",
      "cold",
      "electricity",
      "fire",
      "sonic",
      "poison",
      "spirit",
      "mental",
      "force",
      "vitality",
      "void",
      "bleed",
    ].includes(choice.attack.damageType) &&
    ["tiny", "sm", "med", "lg", "huge", "grg"].includes(choice.size) &&
    choice.speeds &&
    typeof choice.speeds.land === "number" &&
    Object.entries(choice.speeds).every(
      ([key, value]) =>
        ["land", "climb", "swim", "fly", "burrow"].includes(key) &&
        Number.isFinite(value) &&
        value >= 0,
    ),
  );
}
export function applyChassisChoices(source, entry, data) {
  source = structuredClone(source);
  const sizes = allowedSizes(entry);
  if (sizes.length > 1 && sizes.includes(data.chassisSizes?.[entry.id])) {
    const value = data.chassisSizes[entry.id];
    source.system.size = value;
    source.flags.sf2e ??= {};
    source.flags.sf2e.rulesSelections ??= {};
    source.flags.sf2e.rulesSelections.chassisSize = value;
    source.system.rules.find(
      (rule) => rule.key === "ChoiceSet" && rule.flag === "chassisSize",
    ).selection = value;
  }
  if (entry.id !== "imitator-chassis" || !data.imitation) return source;
  const choice = data.imitation;
  if (!validImitationChoice(choice)) return source;
  source.system.size = choice.size;
  source.system.speed = choice.speeds.land;
  for (const [selector, value] of Object.entries(choice.speeds))
    if (selector !== "land")
      source.system.rules.push({ key: "BaseSpeed", selector, value });
  source.system.rules.push({
    key: "Strike",
    slug: "imitated-attack",
    label: choice.attack.name,
    category: "unarmed",
    group: "brawling",
    range: null,
    replaceBasicUnarmed: true,
    traits: ["unarmed", "agile", "finesse"],
    damage: {
      base: { dice: 1, die: "d4", damageType: choice.attack.damageType },
    },
  });
  return source;
}
