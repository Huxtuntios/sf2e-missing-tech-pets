import { t } from "./i18n.mjs";
// Небольшой DOM-адаптер позволяет сохранить обработчики окон без jQuery и ApplicationV1.
export class DomQuery {
  constructor(nodes) {
    this.nodes = Array.isArray(nodes) ? nodes : [nodes].filter(Boolean);
  }
  find(selector) {
    return new DomQuery(
      this.nodes.flatMap((node) => [...node.querySelectorAll(selector)]),
    );
  }
  val(value) {
    if (value === undefined) return this.nodes[0]?.value;
    for (const node of this.nodes) node.value = value;
    return this;
  }
  html(value) {
    if (value === undefined) return this.nodes[0]?.innerHTML;
    for (const node of this.nodes) node.innerHTML = value;
    return this;
  }
  on(type, selector, callback) {
    if (typeof selector === "function") {
      callback = selector;
      selector = null;
    }
    for (const node of this.nodes)
      node.addEventListener(type, (event) => {
        const target = selector ? event.target.closest(selector) : node;
        if (!target || !node.contains(target)) return;
        const proxy = new Proxy(event, {
          get: (original, property) =>
            property === "currentTarget"
              ? target
              : typeof original[property] === "function"
                ? original[property].bind(original)
                : original[property],
        });
        Promise.resolve(callback(proxy)).catch((error) => {
          console.error("sf2e-missing-tech-pets | Ошибка действия", error);
          ui.notifications.error(t("AddFailed"));
        });
      });
    return this;
  }
}

export class TechPetsDialog extends foundry.applications.api.DialogV2 {
  static openWindows = new Map();
  constructor(configuration, options = {}) {
    super({
      classes: ["sfmtp-dialog"],
      window: {
        title: configuration.title,
        resizable: options.resizable ?? true,
      },
      position: {
        width: Math.min(
          options.width ?? 700,
          Math.max(240, (globalThis.innerWidth ?? 1200) - 32),
        ),
        height:
          typeof options.height === "number"
            ? Math.min(
                options.height,
                Math.max(180, (globalThis.innerHeight ?? 900) - 48),
              )
            : "auto",
      },
      content: `<div class="sfmtp-window">${configuration.content}</div>`,
      buttons: Object.entries(configuration.buttons ?? {}).map(
        ([action, button]) => ({
          action,
          label: button.label,
          callback: (_event, _button, dialog) =>
            button.callback?.(new DomQuery(dialog.element)),
        }),
      ),
    });
    this.legacyConfiguration = configuration;
  }
  render(options = {}) {
    const title = this.legacyConfiguration.title;
    const previous = TechPetsDialog.openWindows.get(title);
    if (previous && previous !== this) void previous.close();
    TechPetsDialog.openWindows.set(title, this);
    return super.render(
      typeof options === "boolean" ? { force: options } : options,
    );
  }
  _onRender(context, options) {
    super._onRender(context, options);
    this.legacyConfiguration.render?.(new DomQuery(this.element));
  }
  async close(options) {
    const title = this.legacyConfiguration.title;
    if (TechPetsDialog.openWindows.get(title) === this)
      TechPetsDialog.openWindows.delete(title);
    return super.close(options);
  }
}
