import { rollMarvelDice, computeDamage, renderRollCard } from "../dice/marvel-roll.mjs";

const ABILITIES = ["melee", "agility", "resilience", "vigilance", "ego", "logic"];

export default class D616Actor extends Actor {
  /** Layer item-driven passive bonuses on top of the base derived data. */
  prepareDerivedData() {
    super.prepareDerivedData(); // runs this.system.prepareDerivedData() internally
    if (this.type !== "character") return;

    const sys = this.system;

    // Per the book: "Powers or other things that grant bonuses to damage
    // multipliers do not stack" and the same for Damage Reduction — the
    // largest single bonus applies, the rest are ignored (they do NOT add
    // together). Damage Modifier bonuses (e.g. Accuracy) and non-attack
    // check bonuses aren't called out that way, so those stay additive.
    const bestMultiplierBonus = Object.fromEntries(ABILITIES.map((a) => [a, 0]));
    let bestDRBonus = 0;

    for (const item of this.items) {
      // Powers and Gear (weapons/armor/gadgets) share the same passive-bonus
      // shape — see item-gear.mjs — so both aggregate the same way here.
      if (item.type !== "power" && item.type !== "gear") continue;
      const passive = item.system.passive;
      if (!passive?.enabled) continue;
      const ability = passive.ability;
      if (ABILITIES.includes(ability)) {
        bestMultiplierBonus[ability] = Math.max(bestMultiplierBonus[ability], passive.damageMultiplierBonus ?? 0);
        sys.damageModifiers[ability] += passive.damageModifierBonus ?? 0;
        sys.nonAttackCheckBonuses[ability] += passive.nonAttackCheckBonus ?? 0;
      }
      // Passive Powers (like Sturdy) and Gear (like armor) can both add
      // flat Health Damage Reduction — same non-stacking rule, take the largest.
      if (passive.healthDamageReductionBonus) {
        bestDRBonus = Math.max(bestDRBonus, passive.healthDamageReductionBonus);
      }
    }

    for (const ability of ABILITIES) {
      sys.damageMultipliers[ability] += bestMultiplierBonus[ability];
    }
    if (bestDRBonus) {
      sys.health.damageReduction = Math.max(sys.health.damageReduction ?? 0, bestDRBonus);
    }
  }

  /**
   * Roll a plain ability check: 2d6 + Marvel Die + Ability vs. an optional
   * target Defense/DC. Used for non-attack checks (Edge/Trouble from
   * Traits should be chosen by the roller when prompted).
   */
  async rollAbilityCheck(abilityKey, { targetNumber = null, flavor = null, edgeTrouble = "none" } = {}) {
    if (!ABILITIES.includes(abilityKey)) {
      ui.notifications.error(`Unknown ability: ${abilityKey}`);
      return;
    }
    const abilityValue = this.system.abilities[abilityKey].value;
    const checkBonus = this.system.nonAttackCheckBonuses?.[abilityKey] ?? 0;
    const dice = await rollMarvelDice({ edgeTrouble });
    const total = dice.diceTotal + abilityValue + checkBonus;

    const success = targetNumber === null ? null : total >= targetNumber;

    const title = flavor ?? game.i18n.format("D616.Roll.AbilityCheck", { ability: game.i18n.localize(`D616.Ability.${abilityKey}`) });

    const content = await renderRollCard({
      actor: this,
      title,
      d1: dice.d1,
      d2: dice.d2,
      marvelValue: dice.marvelValue,
      rawMarvel: dice.rawMarvel,
      abilityValue,
      checkBonus,
      total,
      targetNumber,
      success,
      isFantastic: dice.isFantastic,
      isGreen: dice.isGreen,
      isAttack: false,
      edgeTroubleApplied: edgeTrouble
    });

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: {
        d616: {
          roll: {
            kind: "ability",
            title,
            subtitle: null,
            d1: dice.d1,
            d2: dice.d2,
            rawMarvel: dice.rawMarvel,
            marvelValue: dice.marvelValue,
            isFantastic: dice.isFantastic,
            isGreen: dice.isGreen,
            abilityValue,
            checkBonus,
            targetNumber,
            defenseTargetLabel: null,
            isAttack: false,
            dealsDamageFlag: false,
            damageParams: null,
            damage: null,
            fantasticEffect: null,
            focusCost: null,
            focusRemaining: null,
            edgeTroubleApplied: edgeTrouble
          }
        }
      }
    });
  }

  /**
   * Roll Initiative using this system's own 2d6 + Marvel Die engine (same
   * dice and Fantastic/Green detection as every other roll here) rather
   * than Foundry's generic default, add the Vigilance-based Initiative
   * modifier, post the usual chat card, and — if this actor has a
   * Combatant in the currently active Combat — feed the total straight
   * into the tracker so turn order updates immediately, the same as
   * clicking the tracker's own "Roll Initiative" button would.
   * (system.json's own `initiative` formula covers rolling directly from
   * the Combat Tracker without opening a sheet at all; this covers rolling
   * it from the character sheet itself, with the full chat card.)
   */
  async rollInitiative({ edgeTrouble = "none" } = {}) {
    const abilityValue = this.system.initiative; // Initiative modifier = Vigilance
    const dice = await rollMarvelDice({ edgeTrouble });
    const total = dice.diceTotal + abilityValue;

    const title = game.i18n.localize("D616.Roll.Initiative");

    const content = await renderRollCard({
      actor: this,
      title,
      d1: dice.d1,
      d2: dice.d2,
      marvelValue: dice.marvelValue,
      rawMarvel: dice.rawMarvel,
      abilityValue,
      checkBonus: 0,
      total,
      targetNumber: null,
      success: null,
      isFantastic: dice.isFantastic,
      isGreen: dice.isGreen,
      isAttack: false,
      edgeTroubleApplied: edgeTrouble
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: {
        d616: {
          roll: {
            kind: "initiative",
            title,
            subtitle: null,
            d1: dice.d1,
            d2: dice.d2,
            rawMarvel: dice.rawMarvel,
            marvelValue: dice.marvelValue,
            isFantastic: dice.isFantastic,
            isGreen: dice.isGreen,
            abilityValue,
            checkBonus: 0,
            targetNumber: null,
            defenseTargetLabel: null,
            isAttack: false,
            dealsDamageFlag: false,
            damageParams: null,
            damage: null,
            fantasticEffect: null,
            focusCost: null,
            focusRemaining: null,
            edgeTroubleApplied: edgeTrouble
          }
        }
      }
    });

    const combat = game.combat;
    if (combat) {
      const combatant = combat.combatants.find((c) => c.actor?.id === this.id);
      if (combatant) await combat.setInitiative(combatant.id, total);
    }

    return total;
  }

  /**
   * Roll a Power OR a piece of Gear (weapon/gadget): handles Focus cost
   * (including optional Focus-scaling bonus, 5-or-more style — Gear
   * defaults to a flat cost of 0 so mundane weapons don't touch Focus at
   * all), the attack roll vs. the chosen Defense/DC, and (if it deals
   * damage) the real damage formula:
   *   Damage = (Marvel Die value * Damage Multiplier) + Damage Modifier
   * with a Fantastic result doubling the total by default.
   * Powers and Gear share the same cost/attack schema shape (see
   * item-power.mjs / item-gear.mjs), so one implementation drives both.
   */
  async rollItem(itemId, { edgeTrouble = "none", extraFocus = 0 } = {}) {
    const item = this.items.get(itemId);
    if (!item || (item.type !== "power" && item.type !== "gear")) {
      ui.notifications.error("That power or gear item could not be found on this actor.");
      return;
    }
    const sys = item.system;

    // --- Focus cost ---
    let focusCost = sys.cost.flat ?? 0;
    let bonusModifier = 0;
    if (sys.cost.scales && extraFocus > 0) {
      const ratio = sys.cost.ratio || 2;
      bonusModifier = Math.floor(extraFocus / ratio);
      focusCost += extraFocus;
    }
    if (focusCost > this.system.focus.value) {
      ui.notifications.warn(game.i18n.localize("D616.Roll.InsufficientFocus"));
      return;
    }

    // --- Attack roll (if this power makes one) ---
    let d1 = null, d2 = null, marvelValue = null, rawMarvel = null, isFantastic = false, isGreen = false;
    let attackTotal = null, targetNumber = null, success = null, abilityValue = null;

    if (sys.attack?.enabled) {
      const ability = sys.attack.ability;
      abilityValue = ABILITIES.includes(ability) ? this.system.abilities[ability].value : 0;
      const dice = await rollMarvelDice({ edgeTrouble });
      d1 = dice.d1; d2 = dice.d2; marvelValue = dice.marvelValue; rawMarvel = dice.rawMarvel;
      isFantastic = dice.isFantastic; isGreen = dice.isGreen;
      attackTotal = dice.diceTotal + abilityValue;

      if (sys.attack.defenseTarget === "flat") {
        targetNumber = sys.attack.flatDC;
      } else if (ABILITIES.includes(sys.attack.defenseTarget)) {
        targetNumber = null; // GM/player compares to the target token's Defense manually or via the card note
      }
      success = targetNumber === null ? null : attackTotal >= targetNumber;
    }

    // --- Damage (if applicable) ---
    // Multiplier/modifier are computed whenever this attack deals damage at
    // all, even if this particular hit didn't land — they're stashed in the
    // chat message's flags so that adding Edge/Trouble after the fact (which
    // can turn a miss into a hit against a flat DC) can compute damage then
    // too, without needing to re-derive the actor's state later.
    const dealsDamageFlag = !!(sys.attack?.enabled && sys.attack?.dealsDamage);
    let damage = null;
    let damageParams = null;
    if (dealsDamageFlag) {
      const ability = sys.attack.ability;
      let multiplier = this.system.damageMultipliers?.[ability] ?? this.system.rank;
      // A weapon's own damage-multiplier bonus (Gear only) doesn't stack
      // with the character's other multiplier bonuses — use whichever is
      // greater, per the book's weapon rules.
      if (item.type === "gear" && sys.attack.damageMultiplierBonus) {
        multiplier = Math.max(multiplier, this.system.rank + sys.attack.damageMultiplierBonus);
      }
      const modifier = (this.system.damageModifiers?.[ability] ?? abilityValue ?? 0) + bonusModifier;
      damageParams = { multiplier, modifier };
      if (success === null || success) {
        damage = computeDamage({ marvelValue, multiplier, modifier, isFantastic });
      }
    }

    // --- Spend Focus ---
    if (focusCost > 0) {
      await this.update({ "system.focus.value": Math.max(0, this.system.focus.value - focusCost) });
    }

    const subtitle = `${sys.range ?? ""} · ${sys.duration ?? ""}`;
    const defenseTargetLabel = sys.attack?.defenseTarget && sys.attack.defenseTarget !== "flat"
      ? game.i18n.localize(`D616.Ability.${sys.attack.defenseTarget}`) + " Defense"
      : null;
    const fantasticEffect = sys.attack?.fantasticEffect;
    const focusRemaining = this.system.focus.value;

    const content = await renderRollCard({
      actor: this,
      title: item.name,
      subtitle,
      isAttack: !!sys.attack?.enabled,
      d1, d2, marvelValue, rawMarvel,
      abilityValue,
      checkBonus: 0,
      total: attackTotal,
      targetNumber,
      defenseTargetLabel,
      success,
      isFantastic,
      isGreen,
      damage,
      fantasticEffect,
      focusCost,
      focusRemaining,
      edgeTroubleApplied: edgeTrouble
    });

    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: {
        d616: {
          roll: {
            kind: "item",
            title: item.name,
            subtitle,
            d1, d2, rawMarvel, marvelValue,
            isFantastic, isGreen,
            abilityValue,
            checkBonus: 0,
            targetNumber,
            defenseTargetLabel,
            isAttack: !!sys.attack?.enabled,
            dealsDamageFlag,
            damageParams,
            damage,
            fantasticEffect,
            focusCost,
            focusRemaining,
            edgeTroubleApplied: edgeTrouble
          }
        }
      }
    });
  }

  /** @deprecated Back-compat alias — use rollItem(), which also handles Gear. */
  async rollPower(itemId, options = {}) {
    return this.rollItem(itemId, options);
  }
}
