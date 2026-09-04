const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

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
      editImage: D616CharacterSheet.#onEditImage
    }
  };

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

    context.initiativeDisplay = (actor.system.initiative >= 0 ? "+" : "") + actor.system.initiative;
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

  static #onEditImage() {
    const FP = foundry.applications?.apps?.FilePicker ?? FilePicker;
    new FP({
      type: "image",
      current: this.document.img,
      callback: (path) => this.document.update({ img: path })
    }).browse();
  }
}
