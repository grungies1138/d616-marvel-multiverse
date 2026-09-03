const { SchemaField, NumberField, StringField, HTMLField, BooleanField } = foundry.data.fields;

/**
 * Data model for the "character" Actor type.
 * Implements the six MARVEL abilities, Rank-scaled Health/Focus/Karma,
 * and the Defense/Speed/Initiative formulas described in the ruleset:
 *   Defense        = 10 + Ability value
 *   Health (max)   = max(10, Resilience * 30)
 *   Focus (max)    = max(10, Vigilance * 30)
 *   Karma (max)    = Rank
 *   Speed          = 5, or 6 if Agility >= 5 (+ speedBonus)
 *   Initiative mod = Vigilance
 *   Damage         = (Marvel Die value * Damage Multiplier) + Damage Modifier
 *     Damage Multiplier starts at Rank; Damage Modifier starts at the
 *     relevant Ability's value. Owned "power" Items with a passive bonus
 *     can raise either — see documents/actor.mjs for the aggregation pass.
 */
export default class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const abilityField = () =>
      new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 0, min: -3, max: 12 })
      });

    return {
      rank: new NumberField({ required: true, integer: true, initial: 2, min: 1, max: 6 }),

      abilities: new SchemaField({
        melee: abilityField(),
        agility: abilityField(),
        resilience: abilityField(),
        vigilance: abilityField(),
        ego: abilityField(),
        logic: abilityField()
      }),

      health: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        max: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        damageReduction: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      focus: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        max: new NumberField({ required: true, integer: true, initial: 10, min: 0 })
      }),

      karma: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 2, min: 0 }),
        max: new NumberField({ required: true, integer: true, initial: 2, min: 0 })
      }),

      speedBonus: new NumberField({ required: true, integer: true, initial: 0 }),

      identity: new SchemaField({
        realName: new StringField({ required: false, initial: "" }),
        occupation: new StringField({ required: false, initial: "" }),
        origin: new StringField({ required: false, initial: "" }),
        team: new StringField({ required: false, initial: "" }),
        height: new StringField({ required: false, initial: "" }),
        weight: new StringField({ required: false, initial: "" }),
        eyeColor: new StringField({ required: false, initial: "" }),
        hairColor: new StringField({ required: false, initial: "" })
      }),

      isHeroic: new BooleanField({ required: true, initial: true }),

      history: new HTMLField({ required: false }),
      personality: new HTMLField({ required: false })
    };
  }

  /**
   * Derived data that depends only on this actor's own fields (no items
   * required). Item-driven bonuses (passive powers) are layered on top by
   * D616Actor#prepareDerivedData, which runs afterward and has access to
   * this.parent.items.
   */
  prepareDerivedData() {
    super.prepareDerivedData();
    const abilities = this.abilities;

    // Defenses: 10 + ability value.
    this.defenses = {};
    for (const [key, ability] of Object.entries(abilities)) {
      this.defenses[key] = 10 + ability.value;
    }

    // Health / Focus maximums.
    this.health.max = Math.max(10, abilities.resilience.value * 30);
    this.focus.max = Math.max(10, abilities.vigilance.value * 30);

    // Karma maximum equals Rank.
    this.karma.max = this.rank;

    // Speed: 5 base, +1 for every full 5 points of Agility, plus any manual
    // bonus (Big/Small size, powers that grant extra speed, etc).
    this.speed = 5 + Math.floor(abilities.agility.value / 5) + this.speedBonus;

    // Initiative modifier equals Vigilance.
    this.initiative = abilities.vigilance.value;

    // Baseline damage multiplier/modifier per ability before item bonuses.
    // (Overwritten/extended in the Actor document class once items are available.)
    this.damageMultipliers = {};
    this.damageModifiers = {};
    this.nonAttackCheckBonuses = {};
    for (const [key, ability] of Object.entries(abilities)) {
      this.damageMultipliers[key] = this.rank;
      this.damageModifiers[key] = ability.value;
      this.nonAttackCheckBonuses[key] = 0;
    }
  }
}
