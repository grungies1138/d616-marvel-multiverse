const { SchemaField, NumberField, StringField, HTMLField, BooleanField } = foundry.data.fields;

const SIZE_CHOICES = [
  "microscopic", "miniature", "tiny", "little", "small",
  "average", "big", "huge", "gigantic", "titanic", "gargantuan"
];

/**
 * Data model for the "character" Actor type.
 * Implements the six MARVEL abilities, Rank-scaled Health/Focus/Karma,
 * and the Defense/Speed/Initiative formulas described in the ruleset:
 *   Defense        = 10 + Ability value (+ any passive Defense bonus)
 *   Health (max)   = max(10, Resilience * 30)
 *   Focus (max)    = max(10, Vigilance * 30)
 *   Karma (max)    = Rank, if Heroic; 0 otherwise (book p.19 — non-Heroic
 *                    characters can still earn Karma during play, they just
 *                    don't have a standing pool of it)
 *   Speed          = 5, or 6 if Agility >= 5 (+ speedBonus, +1/-1 for Big/Small size)
 *   Initiative mod = Vigilance
 *   Damage         = (Marvel Die value * Damage Multiplier) + Damage Modifier
 *     Damage Multiplier starts at Rank; Damage Modifier starts at the
 *     relevant Ability's value. Owned "power" Items with a passive bonus
 *     can raise either — see documents/actor.mjs for the aggregation pass.
 *
 * Health/Focus can go negative (down to -max) rather than floor at 0 — per
 * the book (p.33-34), a character isn't Killed/Shattered until they hit a
 * negative value equal in magnitude to their maximum. See
 * module/helpers/conditions.mjs for how those thresholds get applied.
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
        value: new NumberField({ required: true, integer: true, initial: 10, min: -9999 }),
        max: new NumberField({ required: true, integer: true, initial: 10, min: 0 }),
        damageReduction: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      focus: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 10, min: -9999 }),
        max: new NumberField({ required: true, integer: true, initial: 10, min: 0 })
      }),

      karma: new SchemaField({
        value: new NumberField({ required: true, integer: true, initial: 2, min: 0 }),
        max: new NumberField({ required: true, integer: true, initial: 2, min: 0 })
      }),

      speedBonus: new NumberField({ required: true, integer: true, initial: 0 }),

      // Power-granted movement modes beyond the automatic Run/Climb/Jump/Swim
      // (book p.31-32) — these are 0 ("doesn't have this mode") unless a
      // power grants one. Filled in by hand on the sheet when a relevant
      // power (Flight, Webslinging, Teleportation...) is taken, since each
      // power specifies its own explicit speed rather than a fixed formula.
      movement: new SchemaField({
        glide: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        swingline: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        fly: new NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        teleport: new NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),

      size: new StringField({ required: true, initial: "average", choices: SIZE_CHOICES }),

      // Free-text narrative Tags (book p.21, p.63+) — distinct from Traits:
      // tags have no mechanical effect of their own (Rich, Secret Identity,
      // Backup...), they're just labels. A simple comma-separated field
      // rather than full items, matching how lightweight they are in the book.
      tags: new StringField({ required: false, initial: "" }),

      // Whether this character has the Heroic tag (book p.63) — gates
      // whether they start with a standing Karma pool and whether their
      // attacks automatically pull back from a killing/shattering blow
      // (Holding Back, p.35). See documents/actor.mjs.
      isHeroic: new BooleanField({ required: true, initial: true }),

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

    // Defenses: 10 + ability value. (Passive defense bonuses like
    // Spider-Sense are layered on top in D616Actor#prepareDerivedData.)
    this.defenses = {};
    for (const [key, ability] of Object.entries(abilities)) {
      this.defenses[key] = 10 + ability.value;
    }

    // Health / Focus maximums.
    this.health.max = Math.max(10, abilities.resilience.value * 30);
    this.focus.max = Math.max(10, abilities.vigilance.value * 30);

    // Karma maximum: Rank if Heroic, 0 otherwise (book p.19). Non-Heroic
    // characters can still accumulate Karma earned during play — this only
    // sets what they reset back down to after a night's sleep.
    this.karma.max = this.isHeroic ? this.rank : 0;

    // Speed: 5 base, +1 for every full 5 points of Agility, +1/-1 for
    // Big/Small size, plus any manual bonus (powers that grant extra speed).
    const sizeSpeedMod = this.size === "big" ? 1 : this.size === "small" ? -1 : 0;
    this.speed = 5 + Math.floor(abilities.agility.value / 5) + sizeSpeedMod + this.speedBonus;

    // Climb/Jump/Swim default to half Run Speed (book p.31); Glide/
    // Swingline/Fly/Teleport are 0 unless a power grants them (see the
    // `movement` schema field above).
    this.speeds = {
      run: this.speed,
      climb: Math.floor(this.speed / 2),
      jump: Math.floor(this.speed / 2),
      swim: Math.floor(this.speed / 2),
      glide: this.movement.glide,
      swingline: this.movement.swingline,
      fly: this.movement.fly,
      teleport: this.movement.teleport
    };

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
