import { applySheetTheme } from "../helpers/theme.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

class BaseD616ItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["d616", "sheet", "item"],
    position: { width: 520, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  /** Item sheets don't have their own theme toggle button — they just follow
   *  whatever Light/Dark preference the player already set on their
   *  character sheet (it's the same client-scoped setting). */
  _onRender(context, options) {
    super._onRender(context, options);
    applySheetTheme(this);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.document;
    context.system = this.document.system;
    context.editable = this.isEditable;
    context.abilities = ["melee", "agility", "resilience", "vigilance", "ego", "logic"];
    return context;
  }
}

export class D616PowerSheet extends BaseD616ItemSheet {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    classes: ["d616", "sheet", "item", "power"]
  };

  static PARTS = {
    body: { template: "systems/d616/templates/item/power-sheet.hbs", scrollable: [""] }
  };
}

export class D616TraitSheet extends BaseD616ItemSheet {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    classes: ["d616", "sheet", "item", "trait"]
  };

  static PARTS = {
    body: { template: "systems/d616/templates/item/trait-sheet.hbs", scrollable: [""] }
  };
}

export class D616GearSheet extends BaseD616ItemSheet {
  static DEFAULT_OPTIONS = {
    ...super.DEFAULT_OPTIONS,
    classes: ["d616", "sheet", "item", "gear"]
  };

  static PARTS = {
    body: { template: "systems/d616/templates/item/gear-sheet.hbs", scrollable: [""] }
  };
}
