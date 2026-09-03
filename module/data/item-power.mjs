const { SchemaField, NumberField, StringField, HTMLField, BooleanField } = foundry.data.fields;

const ABILITY_CHOICES = ["", "melee", "agility", "resilience", "vigilance", "ego", "logic"];
const ACTION_CHOICES = ["standard", "move", "reaction", "passive", "free"];

/**
 * Data model for "power" Items: a single named Power (optionally grouped
 * under a Power Set name), following the book's own field layout —
 * Power Set / Prerequisites / Action / Duration / Range / Cost / Effect —
 * plus structured fields so the sheet can roll the attack and apply the
 * real damage formula automatically.
 */
export default class PowerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      powerSet: new StringField({ required: false, initial: "" }),
      prerequisites: new StringField({ required: false, initial: "" }),
      action: new StringField({ required: true, initial: "standard", choices: ACTION_CHOICES }),
      duration: new StringField({ required: false, initial: "Instant" }),
      range: new StringField({ required: false, initial: "Melee" }),

      cost: new SchemaField({
        flat: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        scales: new BooleanField({ required: true, initial: false }),
        ratio: new NumberField({ required: true, integer: true, initial: 2, min: 1 }),
        minimum: new NumberField({ required: true, integer: true, initial: 5, min: 0 })
      }),

      attack: new SchemaField({
        enabled: new BooleanField({ required: true, initial: true }),
        ability: new StringField({ required: false, initial: "melee", choices: ABILITY_CHOICES }),
        defenseTarget: new StringField({ required: false, initial: "resilience", choices: [...ABILITY_CHOICES, "flat"] }),
        flatDC: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        dealsDamage: new BooleanField({ required: true, initial: true }),
        fantasticEffect: new StringField({ required: false, initial: "Double damage." })
      }),

      passive: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false }),
        ability: new StringField({ required: false, initial: "melee", choices: ABILITY_CHOICES }),
        damageMultiplierBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        damageModifierBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        nonAttackCheckBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        // Matches Gear's passive.healthDamageReductionBonus (item-gear.mjs) —
        // lets a passive Power like Sturdy grant flat Health Damage
        // Reduction the same automated way armor does.
        healthDamageReductionBonus: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      effect: new HTMLField({ required: false })
    };
  }
}
