export default class D616Item extends Item {
  /** Convenience passthrough so an Item can be rolled/used directly. */
  async use(options = {}) {
    if (this.type === "power" && this.actor) {
      return this.actor.rollItem(this.id, options);
    }
    if (this.type === "gear" && this.actor) {
      // A weapon (attack.enabled) rolls just like a Power. A passive item or
      // one with no attack (a gadget, a suit of armor, a consumable) just
      // posts its effect text as a reminder card, like a Trait.
      if (this.system.attack?.enabled) {
        return this.actor.rollItem(this.id, options);
      }
      const content = `<div class="d616-trait-card"><h3>${this.name}</h3>${this.system.effect || ""}</div>`;
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content
      });
    }
    if (this.type === "trait") {
      const content = `<div class="d616-trait-card"><h3>${this.name}</h3>${this.system.mechanicalEffect || ""}</div>`;
      return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content
      });
    }
  }
}
