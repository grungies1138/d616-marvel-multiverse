import { applySheetTheme, toggleSheetTheme } from "../helpers/theme.mjs";
import { openTeamManeuverDialog } from "../helpers/team-maneuver.mjs";
import { rollMarvelDice, computeDamage } from "../dice/marvel-roll.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const SIZE_CHOICES = [
  "microscopic", "miniature", "tiny", "little", "small",
  "average", "big", "huge", "gigantic", "titanic", "gargantuan"
];

function getSingleTarget() {
  const first = Array.from(game.user.targets)[0];
  return first?.actor ?? null;
}

export default class D616CharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** Currently active tab; kept on the instance so re-renders don't reset it. */
  _tab = "main";

  /**
   * Just the codename in the window title bar — override the base sheet's
   * default, which otherwise prefixes/suffixes it with the document type
   * (e.g. "Character: Amberlight" or "Amberlight [Character]").
   */
  get title() {
    return this.document.name;
  }

  static DEFAULT_OPTIONS = {
    classes: ["d616", "sheet", "actor", "character"],
    position: { width: 700, height: 780 },
    window: { resizable: true, title: "" },
    form: { submitOnChange: true },
    actions: {
      setTab: D616CharacterSheet.#onSetTab,
      rollAbility: D616CharacterSheet.#onRollAbility,
      rollInitiative: D616CharacterSheet.#onRollInitiative,
      usePower: D616CharacterSheet.#onUsePower,
      useGear: D616CharacterSheet.#onUseGear,
      useTrait: D616CharacterSheet.#onUseTrait,
      addPower: D616CharacterSheet.#onAddPower,
      addGear: D616CharacterSheet.#onAddGear,
      addTrait: D616CharacterSheet.#onAddTrait,
      editItem: D616CharacterSheet.#onEditItem,
      deleteItem: D616CharacterSheet.#onDeleteItem,
      editImage: D616CharacterSheet.#onEditImage,
      toggleTheme: D616CharacterSheet.#onToggleTheme,
      recoverHealth: D616CharacterSheet.#onRecoverHealth,
      recoverFocus: D616CharacterSheet.#onRecoverFocus,
      restRecover: D616CharacterSheet.#onRestRecover,
      resetKarma: D616CharacterSheet.#onResetKarma,
      awardKarma: D616CharacterSheet.#onAwardKarma,
      actionDodge: D616CharacterSheet.#onActionDodge,
      actionClearDodge: D616CharacterSheet.#onActionClearDodge,
      actionHelp: D616CharacterSheet.#onActionHelp,
      actionGrab: D616CharacterSheet.#onActionGrab,
      actionEscape: D616CharacterSheet.#onActionEscape,
      openTeamManeuver: D616CharacterSheet.#onOpenTeamManeuver,
      fallingDamage: D616CharacterSheet.#onFallingDamage
    }
  };

  /** Re-apply the player's chosen Light/Dark theme class after every render. */
  _onRender(context, options) {
    super._onRender(context, options);
    applySheetTheme(this);
  }

  static PARTS = {
    header: { template: "systems/d616/templates/actor/parts/header.hbs" },
    tabs: { template: "systems/d616/templates/actor/parts/tabs.hbs" },
    // `scrollable: [""]` marks each tab body's own root element as the scrolling
    // region, which is also what lets Foundry remember/restore scroll position
    // across re-renders (e.g. after every keystroke, since form.submitOnChange
    // triggers a re-render).
    main: { template: "systems/d616/templates/actor/parts/main.hbs", scrollable: [""] },
    powers: { template: "systems/d616/templates/actor/parts/powers.hbs", scrollable: [""] },
    gear: { template: "systems/d616/templates/actor/parts/gear.hbs", scrollable: [""] },
    traits: { template: "systems/d616/templates/actor/parts/traits.hbs", scrollable: [""] },
    biography: { template: "systems/d616/templates/actor/parts/biography.hbs", scrollable: [""] }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    context.actor = actor;
    context.system = actor.system;
    context.editable = this.isEditable;
    context.tab = this._tab;
    context.abilities = ["melee", "agility", "resilience", "vigilance", "ego", "logic"];
    context.powers = actor.items
      .filter((i) => i.type === "power")
      .map((i) => ({
        id: i.id,
        name: i.name,
        img: i.img,
        powerSet: i.system.powerSet,
        actionLabel: game.i18n.localize(`D616.Action.${i.system.action}`),
        costLabel: `${i.system.cost.flat}${i.system.cost.scales ? "+" : ""} Focus`
      }));
    context.gear = actor.items
      .filter((i) => i.type === "gear")
      .map((i) => ({
        id: i.id,
        name: i.name,
        img: i.img,
        categoryLabel: game.i18n.localize(`D616.Category.${i.system.category}`),
        isAttack: !!i.system.attack?.enabled,
        costLabel: i.system.cost.flat || i.system.cost.scales
          ? `${i.system.cost.flat}${i.system.cost.scales ? "+" : ""} Focus`
          : null
      }));
    context.traits = actor.items
      .filter((i) => i.type === "trait")
      .map((i) => ({
        id: i.id,
        name: i.name,
        img: i.img,
        situation: i.system.situation
      }));

    context.mainActive = this._tab === "main";
    context.powersActive = this._tab === "powers";
    context.gearActive = this._tab === "gear";
    context.traitsActive = this._tab === "traits";
    context.biographyActive = this._tab === "biography";

    context.themeDark = game.settings.get("d616", "sheetTheme") === "dark";
    context.initiativeDisplay = (actor.system.initiative >= 0 ? "+" : "") + actor.system.initiative;
    context.initiativeHasStandingEdge = !!actor.system.initiativeHasStandingEdge;
    context.defenseList = context.abilities.map((key) => ({
      key,
      label: game.i18n.localize(`D616.Ability.${key}`),
      value: actor.system.defenses[key]
    }));
    context.abilityList = context.abilities.map((key) => ({
      key,
      label: game.i18n.localize(`D616.Ability.${key}`),
      value: actor.system.abilities[key].value,
      display: (actor.system.abilities[key].value >= 0 ? "+" : "") + actor.system.abilities[key].value,
      damageMultiplier: actor.system.damageMultipliers?.[key] ?? actor.system.rank,
      damageModifier: actor.system.damageModifiers?.[key] ?? actor.system.abilities[key].value
    }));

    // Size / Heroic tag / Tags (book p.19, p.21, p.40, p.63).
    context.sizeChoices = SIZE_CHOICES.map((s) => ({ key: s, label: game.i18n.localize(`D616.Size.${s}`) }));
    context.isHeroic = actor.system.isHeroic;
    context.tags = actor.system.tags;

    // Movement modes (book p.31-32): the four automatic ones are always
    // shown; the four power-granted ones only show once a value is set (0
    // means "doesn't have this mode").
    const speeds = actor.system.speeds ?? {};
    context.movementList = [
      { key: "run", label: game.i18n.localize("D616.Movement.Run"), value: speeds.run },
      { key: "climb", label: game.i18n.localize("D616.Movement.Climb"), value: speeds.climb },
      { key: "jump", label: game.i18n.localize("D616.Movement.Jump"), value: speeds.jump },
      { key: "swim", label: game.i18n.localize("D616.Movement.Swim"), value: speeds.swim }
    ];
    context.grantedMovementList = [
      { key: "glide", label: game.i18n.localize("D616.Movement.Glide"), value: speeds.glide },
      { key: "swingline", label: game.i18n.localize("D616.Movement.Swingline"), value: speeds.swingline },
      { key: "fly", label: game.i18n.localize("D616.Movement.Fly"), value: speeds.fly },
      { key: "teleport", label: game.i18n.localize("D616.Movement.Teleport"), value: speeds.teleport }
    ].filter((m) => m.value > 0);

    context.isDodging = !!actor.getFlag("d616", "dodging");
    context.isGM = game.user.isGM;

    return context;
  }

  /** Only re-render the parts that actually need to change when swapping tabs. */
  static #onSetTab(event, target) {
    this._tab = target.dataset.tab;
    this.render({ parts: ["tabs", "main", "powers", "gear", "traits", "biography"] });
  }

  static #onRollAbility(event, target) {
    const ability = target.dataset.ability;
    this.document.rollAbilityCheck(ability);
  }

  static #onRollInitiative() {
    this.document.rollInitiative();
  }

  /** Shared Edge/Trouble (+ optional scaling-Focus) prompt for Power and Gear rolls. */
  static async #promptRollOptions(item) {
    const sys = item.system;
    if (!sys.cost?.scales && !sys.attack?.enabled) return { edgeTrouble: "none", extraFocus: 0 };

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: `${item.name}` },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("D616.Roll.EdgeTrouble")}</label>
          <select name="edgeTrouble">
            <option value="none">${game.i18n.localize("D616.Roll.None")}</option>
            <option value="edge">${game.i18n.localize("D616.Roll.Edge")}</option>
            <option value="trouble">${game.i18n.localize("D616.Roll.Trouble")}</option>
          </select>
        </div>
        ${sys.cost.scales ? `
        <div class="form-group">
          <label>${game.i18n.localize("D616.Roll.SpendFocus")}</label>
          <input type="number" name="extraFocus" value="0" min="0" step="${sys.cost.ratio}">
          <p class="hint">${game.i18n.localize("D616.Roll.SpendFocusHint")}</p>
        </div>` : ""}
      `,
      ok: {
        callback: (event, button) => new FormDataExtended(button.form).object
      }
    }).catch(() => null);

    if (result === null) return null; // cancelled
    return { edgeTrouble: result.edgeTrouble ?? "none", extraFocus: Number(result.extraFocus ?? 0) };
  }

  static async #onUsePower(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const item = this.document.items.get(itemId);
    const options = await D616CharacterSheet.#promptRollOptions(item);
    if (!options) return; // cancelled
    this.document.rollItem(itemId, options);
  }

  static async #onUseGear(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!itemId) return;
    const item = this.document.items.get(itemId);
    if (!item) return;
    if (!item.system.attack?.enabled) {
      // Not a weapon — just post its effect text to chat, same as a Trait.
      return item.use();
    }
    const options = await D616CharacterSheet.#promptRollOptions(item);
    if (!options) return; // cancelled
    this.document.rollItem(itemId, options);
  }

  static #onUseTrait(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    this.document.items.get(itemId)?.use();
  }

  static async #onAddPower() {
    const item = await Item.create({ name: "New Power", type: "power" }, { parent: this.document });
    item.sheet.render(true);
  }

  static async #onAddGear() {
    const item = await Item.create({ name: "New Gear", type: "gear" }, { parent: this.document });
    item.sheet.render(true);
  }

  static async #onAddTrait() {
    const item = await Item.create({ name: "New Trait", type: "trait" }, { parent: this.document });
    item.sheet.render(true);
  }

  static #onEditItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    this.document.items.get(itemId)?.sheet.render(true);
  }

  static #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    this.document.items.get(itemId)?.delete();
  }

  static #onToggleTheme() {
    toggleSheetTheme();
  }

  static #onRecoverHealth() {
    this.document.recoverPool("health");
  }

  static #onRecoverFocus() {
    this.document.recoverPool("focus");
  }

  static async #onRestRecover() {
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("D616.Karma.RestRecoverTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("D616.Karma.HoursResting")}</label>
          <input type="number" name="hours" value="1" min="1" />
        </div>
        <div class="form-group">
          <label class="checkbox">
            <input type="checkbox" name="asleep" />
            ${game.i18n.localize("D616.Karma.WasAsleep")}
          </label>
        </div>
      `,
      ok: { callback: (event, button) => new FormDataExtended(button.form).object }
    }).catch(() => null);
    if (!result) return;
    this.document.restRecover({ hours: Number(result.hours ?? 1), asleep: !!result.asleep });
  }

  static #onResetKarma() {
    this.document.resetKarma();
  }

  static async #onAwardKarma() {
    if (!game.user.isGM) return;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("D616.Karma.AwardTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("D616.Karma.AwardAmount")}</label>
          <input type="number" name="amount" value="1" min="1" />
        </div>
      `,
      ok: { callback: (event, button) => new FormDataExtended(button.form).object }
    }).catch(() => null);
    if (!result) return;
    this.document.awardKarma(Number(result.amount ?? 1));
  }

  static #onActionDodge() {
    this.document.dodge();
  }

  static #onActionClearDodge() {
    this.document.clearDodge();
  }

  static #onActionHelp() {
    const target = getSingleTarget();
    this.document.helpAlly(target);
  }

  static #onActionGrab() {
    const target = getSingleTarget();
    this.document.meleeContest(target, { mode: "grab" });
  }

  static #onActionEscape() {
    const target = getSingleTarget();
    this.document.meleeContest(target, { mode: "escape" });
  }

  static #onOpenTeamManeuver() {
    openTeamManeuverDialog(this.document);
  }

  /**
   * Falling damage (book p.32-33): damage multiplier is 1 per 3 spaces
   * fallen (capped at x20); a controlled landing (a successful Acrobatics-
   * style check, adjudicated by the GM) reduces that multiplier by the
   * faller's Jump Speed. This is a standalone calculator — it doesn't touch
   * the actor's Health directly, since exactly how a fall interacts with a
   * grid/scene is outside what this sheet tracks.
   */
  static async #onFallingDamage() {
    const jumpSpeed = this.document.system.speeds?.jump ?? 0;
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("D616.Action.FallingDamageTitle") },
      content: `
        <div class="form-group">
          <label>${game.i18n.localize("D616.Action.SpacesFallen")}</label>
          <input type="number" name="spaces" value="3" min="0" />
        </div>
        <div class="form-group">
          <label class="checkbox">
            <input type="checkbox" name="controlled" />
            ${game.i18n.format("D616.Action.ControlledLanding", { jump: jumpSpeed })}
          </label>
        </div>
      `,
      ok: { callback: (event, button) => new FormDataExtended(button.form).object }
    }).catch(() => null);
    if (!result) return;

    const spaces = Number(result.spaces ?? 0);
    let multiplier = Math.min(20, Math.floor(spaces / 3));
    if (result.controlled) multiplier = Math.max(0, multiplier - jumpSpeed);

    if (multiplier <= 0) {
      ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.document }),
        content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Action.FallingDamageNone", { name: this.document.name })}</p>`
      });
      return;
    }

    const dice = await rollMarvelDice({});
    const damage = computeDamage({ marvelValue: dice.marvelValue, multiplier, modifier: 0, isFantastic: dice.isFantastic });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.document }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Action.FallingDamageResult", {
        name: this.document.name, multiplier, damage
      })}</p>`
    });
  }

  static #onEditImage() {
    const FP = foundry.applications?.apps?.FilePicker ?? FilePicker;
    new FP({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    }).browse();
  }
}
