// Обогащение текста Foundry: ссылки @UUID, @Check, @Damage и локализация сохраняются.
const editor = () => foundry?.applications?.ux?.TextEditor?.implementation;

export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// После отрисовки обогащаем тела строк, помеченные data-sfmtp-enrich.
// data-sfmtp-relative хранит UUID документа для разрешения ссылок @UUID.
export async function enrichRowBodies(root, { relativeTo = null, secrets = false } = {}) {
  const implementation = editor();
  if (!implementation?.enrichHTML) return;
  const nodes = [...root.querySelectorAll("[data-sfmtp-enrich]")];
  await Promise.all(
    nodes.map(async (node) => {
      let relative = relativeTo;
      if (node.dataset.sfmtpRelative)
        relative = (await fromUuid(node.dataset.sfmtpRelative)) ?? relativeTo;
      node.innerHTML = await implementation.enrichHTML(node.innerHTML, {
        relativeTo: relative,
        secrets,
        async: true,
      });
      node.removeAttribute("data-sfmtp-enrich");
    }),
  );
}