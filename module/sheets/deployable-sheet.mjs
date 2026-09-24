import { applySheetTheme } from "../helpers/theme.mjs";
import { recallDeployable } from "../helpers/deployables.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** A small sheet for deployables: who deployed it, its Health, Defense, speed and effect. */
export default class D616DeployableSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["d616", "sheet", "actor", "deployable"],
    position: { width: 420, height: 460 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: { recall: D616DeployableSheet.#onRecall }
  };

  static PARTS = {
    body: { template: "systems/d616/templates/actor/deployable-sheet.hbs", scrollable: [""] }
  };

  _onRender(context, options) {
    super._onRender(context, options);
    applySheetTheme(this);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    context.actor = actor;
    context.system = actor.system;
    context.editable = this.isEditable;
    context.ownerName = actor.system.ownerUuid ? (fromUuidSync(actor.system.ownerUuid)?.name ?? "—") : "—";
    context.sizeLabel = game.i18n.localize(`D616.Size.${actor.system.size}`);
    context.deployed = actor.getActiveTokens(false, true).length > 0
      || game.scenes.some((s) => s.tokens.some((t) => t.actorId === actor.id));
    return context;
  }

  static #onRecall() {
    recallDeployable(this.document);
  }
}
