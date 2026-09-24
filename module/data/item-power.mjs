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
        ability: new StringField({ required: false, blank: true, initial: "melee", choices: ABILITY_CHOICES }),
        defenseTarget: new StringField({ required: false, blank: true, initial: "melee", choices: [...ABILITY_CHOICES, "flat"] }),
        flatDC: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        dealsDamage: new BooleanField({ required: true, initial: true }),
        // Per the book (p.34), Health damage and Focus damage are distinct —
        // physical attacks hurt Health, mental/psychic ones hurt Focus.
        damageType: new StringField({ required: true, initial: "health", choices: ["health", "focus"] }),
        // How damage is worked out: "formula" is the book's (Marvel die x
        // multiplier) + modifier; "static" is a fixed amount; "roll" is a dice
        // formula rolled from the chat card's Roll Damage button.
        damageMode: new StringField({ required: true, initial: "formula", choices: ["formula", "static", "roll"] }),
        staticDamage: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        damageRoll: new StringField({ required: false, blank: true, initial: "" }),
        fantasticEffect: new StringField({ required: false, initial: "Double damage." }),
        // Lethal vs. nonlethal (book p.36): weaponless attacks are nonlethal
        // unless declared otherwise, weapons are lethal. "auto" follows that
        // rule (see isNonlethalAttack in documents/actor.mjs); a nonlethal
        // hit stops 1 Health short of Killed.
        lethality: new StringField({ required: true, initial: "auto", choices: ["auto", "lethal", "nonlethal"] })
      }),

      passive: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false }),
        ability: new StringField({ required: false, blank: true, initial: "melee", choices: ABILITY_CHOICES }),
        damageMultiplierBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        damageModifierBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        nonAttackCheckBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        // Matches Gear's passive.healthDamageReductionBonus (item-gear.mjs) —
        // lets a passive Power like Sturdy grant flat Health Damage
        // Reduction the same automated way armor does.
        healthDamageReductionBonus: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        // A flat bonus to one Ability Defense (e.g. Spider-Sense's +2 Agility
        // Defense, book p.19). Applies to `ability` above. Non-stacking with
        // other defense-bonus sources on the same ability — largest wins.
        defenseBonus: new NumberField({ required: true, integer: true, initial: 0 }),
        // A standing/always-on Edge on a specific kind of roll — the book's
        // own example is Spider-Sense granting Edge on Initiative checks
        // (p.20, the "E" notation). "attacks" covers any Power/Gear attack
        // roll; the six ability keys cover that ability's checks.
        standingEdgeOn: new StringField({
          required: false,
          blank: true,
          initial: "",
          choices: ["", "initiative", "attacks", ...ABILITY_CHOICES.filter((a) => a)]
        }),
        // The book ties Knockback to "a character with the Mighty power"
        // (p.34) — check this on whichever Power represents that (Mighty,
        // or a similar raw-strength power) so a Fantastic close attack
        // shows the option. See D616Actor#rollItem.
        grantsKnockback: new BooleanField({ required: true, initial: false })
      }),

      // Using this item puts something on the battlefield that its user
      // controls, like Circuit's support drone. See helpers/deployables.mjs.
      deploy: new SchemaField({
        enabled: new BooleanField({ required: true, initial: false }),
        name: new StringField({ required: false, blank: true, initial: "" }),
        img: new StringField({ required: false, blank: true, initial: "" }),
        health: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        defense: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        size: new StringField({ required: true, initial: "small", choices: ["microscopic", "miniature", "tiny", "little", "small", "average", "big", "huge", "gigantic", "titanic", "gargantuan"] }),
        speed: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      effect: new HTMLField({ required: false })
    };
  }
}
