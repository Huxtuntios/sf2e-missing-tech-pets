// Единая строка действия/способности в стиле PF2e: иконка, название, мета и
// элементы управления в заголовке; описание раскрывается прямо под строкой.
// Весь заголовок — цель клика; вложенные ссылки/кнопки/поля не переключают раскрытие.
import { escapeHTML } from "./rich-text.mjs";

const INTERACTIVE = "a, button, input, select, textarea, label, [data-sfmtp-no-toggle]";

export function abilityRow({
  rowId = "",
  icon = "",
  name = "",
  meta = [],
  controls = "",
  body = "",
  expanded = false,
  enrich = false,
  rowAttrs = "",
} = {}) {
  const chips = (Array.isArray(meta) ? meta : [meta])
    .filter((part) => part !== null && part !== undefined && part !== "")
    .map((part) => `<span class="sfmtp-row-meta">${part}</span>`)
    .join("");
  const bodyAttrs = enrich ? " data-sfmtp-enrich" : "";
  return `<div class="sfmtp-row${expanded ? " sfmtp-row-expanded" : ""}" data-sfmtp-row="${escapeHTML(rowId)}"${rowAttrs ? ` ${rowAttrs}` : ""}>
<div class="sfmtp-row-header" role="button" tabindex="0" aria-expanded="${expanded ? "true" : "false"}">
${icon ? `<img class="sfmtp-row-icon" src="${escapeHTML(icon)}" alt="" loading="lazy">` : ""}
<span class="sfmtp-row-name">${escapeHTML(name)}</span>
${chips}
<span class="sfmtp-row-spacer"></span>
${controls ? `<span class="sfmtp-row-controls">${controls}</span>` : ""}
<span class="sfmtp-row-chevron" aria-hidden="true"></span>
</div>
<div class="sfmtp-row-body"${bodyAttrs}${expanded ? "" : " hidden"}>${body}</div>
</div>`;
}

function isInteractive(node) {
  return Boolean(node?.closest?.(INTERACTIVE));
}

function toggle(header) {
  const row = header.closest("[data-sfmtp-row]");
  const body = row?.querySelector(":scope > .sfmtp-row-body");
  if (!row || !body) return;
  const expanded = header.getAttribute("aria-expanded") === "true";
  header.setAttribute("aria-expanded", expanded ? "false" : "true");
  body.hidden = expanded;
  row.classList.toggle("sfmtp-row-expanded", !expanded);
}

const bound = new WeakSet();

export function bindAbilityRows(root) {
  if (!root || bound.has(root)) return;
  bound.add(root);
  root.addEventListener("click", (event) => {
    const header = event.target.closest?.(".sfmtp-row-header");
    if (!header || !root.contains(header)) return;
    if (isInteractive(event.target)) return;
    event.preventDefault();
    toggle(header);
  });
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
    const header = event.target.closest?.(".sfmtp-row-header");
    if (!header || !root.contains(header)) return;
    if (event.target !== header && isInteractive(event.target)) return;
    event.preventDefault();
    toggle(header);
  });
}