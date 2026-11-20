import { MODULE_ID } from "./item-sources.mjs";

const publication = { title: "Tech Core", authors: "", license: "ORC", remaster: true };
const provided = { moduleProvided: true, minibot: true };

// Существо Minibot: нативный стат-блок NPC SF2e. Иммунитеты/слабости заданы явно
// по стат-блоку Tech Core; система дополнительно выводит иммунитеты construct.
export function buildMinibotCreatureSource(creature) {
  const abilities = Object.fromEntries(
    Object.entries(creature.abilities).map(([key, mod]) => [key, { mod }]),
  );
  const saves = Object.fromEntries(
    Object.entries(creature.saves).map(([key, value]) => [
      key,
      { saveDetail: "", value },
    ]),
  );
  const skills = Object.fromEntries(
    Object.entries(creature.skills).map(([key, base]) => [key, { base }]),
  );
  return {
    name: creature.name,
    type: "npc",
    img: "icons/svg/mystery-man.svg",
    effects: [],
    items: [],
    ownership: { default: 0 },
    system: {
      abilities,
      attributes: {
        ac: { details: "", value: creature.ac },
        allSaves: { value: "" },
        hp: { details: "", max: creature.hp, temp: 0, value: creature.hp },
        immunities: creature.immunities.map((entry) => ({ ...entry })),
        weaknesses: creature.weaknesses.map((entry) => ({ ...entry })),
        resistances: [],
        speed: {
          otherSpeeds: creature.speed.otherSpeeds.map((entry) => ({ ...entry })),
          value: creature.speed.value,
        },
      },
      details: {
        blurb: "",
        languages: { details: "", value: [...creature.languages] },
        level: { value: creature.level },
        privateNotes: "",
        publicNotes: creature.description,
        publication: { ...publication },
      },
      initiative: { statistic: "perception" },
      perception: {
        details: "",
        mod: creature.perception.mod,
        senses: creature.perception.senses.map((entry) => ({ ...entry })),
      },
      resources: {},
      saves,
      skills,
      traits: {
        rarity: creature.rarity,
        size: { value: creature.size },
        value: [...creature.traits],
      },
    },
    flags: { [MODULE_ID]: { ...provided } },
  };
}

// Предметы minibot: нативная схема equipment SF2e (цена в sp = кредиты).
// Способности активации описаны в тексте по образцу системных предметов;
// автоматизация ограничена нативными полями, эффекты остаются ручными.
export function buildMinibotEquipmentSource(item) {
  return {
    name: item.name,
    type: "equipment",
    img: "icons/commodities/tech/electronics-tech-sensor-orange-teal.webp",
    effects: [],
    ownership: { default: 0 },
    system: {
      baseItem: null,
      bulk: { value: item.bulk },
      containerId: null,
      description: { value: item.description },
      hardness: 0,
      hp: { max: 0, value: 0 },
      level: { value: item.level },
      material: { grade: null, type: null },
      price: { value: { sp: item.price } },
      publication: { ...publication },
      quantity: 1,
      rules: [],
      size: "med",
      traits: { rarity: "common", value: [...item.traits] },
      usage: { value: item.usage },
      slug: item.slug,
      equipped: { carryType: "held" },
    },
    flags: { [MODULE_ID]: { ...provided, group: item.group } },
  };
}

export function buildMinibotActionSource(action) {
  return {
    name: action.name,
    type: "action",
    img: "icons/svg/target.svg",
    effects: [],
    ownership: { default: 0 },
    system: {
      slug: action.slug,
      actionType: { value: action.actionType },
      actions: { value: action.actions },
      category: "interaction",
      publication: { ...publication },
      description: {
        value: `${action.description}<p>@Localize[SFMTP.ManualActionHint]</p>`,
      },
      rules: [],
      traits: { rarity: "common", value: [...action.traits], otherTags: [] },
    },
    flags: { [MODULE_ID]: { ...provided, itemKind: "minibot-action" } },
  };
}