export const referencePattern = new RegExp([
  "ao" + "n(?:srd|prd)",
  "archives\\s+of\\s+" + "neth" + "ys",
  "\\bao" + "n\\b",
  "архив\\S*\\s+(?:не" + "фис\\S*|не" + "тис\\S*)",
].join("|"), "i");

export function assertReferenceFree(text, filename) {
  if (referencePattern.test(text))
    throw new Error(`External rules reference in ${filename}`);
}
