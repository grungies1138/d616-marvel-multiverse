const { SchemaField, NumberField, StringField, HTMLField, BooleanField } = foundry.data.fields;

const ABILITY_CHOICES = ["", "melee", "agility", "resilience", "vigilance", "ego", "logic"];
const CATEGORY_CHOICES = ["weaponMelee", "weaponRanged", "armor", "gadget", "consumable", "vehicle", "other"];

/**
 * Data model for "gear" Items: mundane/tech equipment — weapons, armor,
 * gadgets, vehicles. Deliberately mirrors PowerData's cost/attack/passive
 * shape (see item-power.mjs) so the same roll/aggregation code in
 * documents/actor.mjs can drive both: a weapon's attack block works exactly
 * like a Power's attack block, and a piece of armor's passive block works
 * exactly like a passive Power, plus one gear-only field — a flat bonus to
 * Health Damage Reduction — for body armor.
 */
export default class GearData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new StringField({ required: true, initial: "weaponMelee", choices: CATEGORY_CHOICES }),
      availability: new StringField({ required: false, initial: "" }),
      range: new StringField({ required: false, initial: "Melee" }),

      cost: new SchemaField({
        flat: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        scales: new BooleanField({ required: true, initial: false }),
        ratio: new NumberField({ required: true, integer: true, initial: 2, min: 1 }),
        minimum: new NumberField({ required: true, integer: true, initial: 5, min: 0 })
      }),

      attack: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false }),
        ability: new StringField({ required: false, initial: "melee", choices: ABILITY_CHOICES }),
        defenseTarget: new StringField({ required: false, initial: "resilience", choices: [...ABILITY_CHOICES, "flat"] }),
        flatDC: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        dealsDamage: new BooleanField({ required: true, initial: true }),
        fantasticEffect: new StringField({ required: false, initial: "Double damage." }),
        // A weapon's own bonus to the wielder's damage multiplier for THIS
        // attack only (e.g. a Sword's +2) — per the book, this does not
        // stack with any other damage-multiplier bonus the character has;
        // whichever is greater applies. See documents/actor.mjs#rollItem.
        damageMultiplierBonus: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      passive: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false }),
        ability: new StringField({ required: false, initial: "melee", choices: ABILITY_CHOICES }),
        damageMultiplierBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        damageModifierBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        nonAttackCheckBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        healthDamageReductionBonus: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      effect: new HTMLField({ required: false })
    };
  }
}
