const { SchemaField, NumberField, StringField, HTMLField } = foundry.data.fields;

const SIZE_CHOICES = ["microscopic", "miniature", "tiny", "little", "small", "average", "big", "huge", "gigantic", "titanic", "gargantuan"];

/**
 * Data model for "deployable" Actors: something a character puts on the
 * battlefield with a Power or Gear item (Circuit's support drone, a turret,
 * a decoy). One world actor per source item, created and refreshed from the
 * item's Deploy settings by helpers/deployables.mjs; the owner controls its
 * token. It can be targeted and damaged like anyone else, using a single
 * Defense for all six abilities, and is destroyed at 0 Health.
 */
export default class DeployableData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      ownerUuid: new StringField({ required: false, blank: true, initial: "" }),
      sourceItemId: new StringField({ required: false, blank: true, initial: "" }),
      rank: new NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      size: new StringField({ required: true, initial: "small", choices: SIZE_CHOICES }),
      defense: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
      speed: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      health: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 10 }),
        max: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        damageReduction: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      // Deployables have no mind to attack; Focus damage is ignored (see
      // D616Actor#_applyDamageTo). Kept so shared damage code can read it.
      focus: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 0 }),
        max: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      effect: new HTMLField({ required: false })
    };
  }

  prepareDerivedData() {
    // Attack code reads target.system.defenses[ability]; one value covers all.
    const d = this.defense;
    this.defenses = { melee: d, agility: d, resilience: d, vigilance: d, ego: d, logic: d };
  }
}
