import { rollMarvelDice, computeDamage, renderRollCard, resolveSuccess } from "../dice/marvel-roll.mjs";
import { syncAutomaticConditions } from "../helpers/conditions.mjs";

const ABILITIES = ["melee", "agility", "resilience", "vigilance", "ego", "logic"];

// Book p.40 Objects & Sizes table's Attack Modifier column, extended to
// characters via the `size` field: the bonus/penalty an attacker gets when
// targeting something of that size (bigger = easier to hit, smaller = harder).
const SIZE_ATTACK_MODIFIER = {
  microscopic: -5, miniature: -4, tiny: -3, little: -2, small: -1,
  average: 0, big: 1, huge: 2, gigantic: 3, titanic: 4, gargantuan: 5
};

function getSingleTarget() {
  const first = Array.from(game.user.targets)[0];
  return first?.actor ?? null;
}

function getTargets(max = 1) {
  return Array.from(game.user.targets).slice(0, max).map((t) => t.actor).filter(Boolean);
}

export default class D616Actor extends Actor {
  /** Layer item-driven passive bonuses on top of the base derived data. */
  prepareDerivedData() {
    super.prepareDerivedData(); // runs this.system.prepareDerivedData() internally
    if (this.type !== "character") return;

    const sys = this.system;

    // Per the book: "Powers or other things that grant bonuses to damage
    // multipliers do not stack" and the same for Damage Reduction and
    // Ability Defenses — the largest single bonus applies, the rest are
    // ignored (they do NOT add together). Damage Modifier bonuses (e.g.
    // Accuracy) and non-attack check bonuses aren't called out that way,
    // so those stay additive.
    const bestMultiplierBonus = Object.fromEntries(ABILITIES.map((a) => [a, 0]));
    const bestDefenseBonus = Object.fromEntries(ABILITIES.map((a) => [a, 0]));
    let bestDRBonus = 0;
    const standingEdges = new Set();

    for (const item of this.items) {
      // Powers and Gear (weapons/armor/gadgets) share the same passive-bonus
      // shape — see item-gear.mjs — so both aggregate the same way here.
      if (item.type !== "power" && item.type !== "gear") continue;
      const passive = item.system.passive;
      if (!passive?.enabled) continue;
      const ability = passive.ability;
      if (ABILITIES.includes(ability)) {
        bestMultiplierBonus[ability] = Math.max(bestMultiplierBonus[ability], passive.damageMultiplierBonus ?? 0);
        bestDefenseBonus[ability] = Math.max(bestDefenseBonus[ability], passive.defenseBonus ?? 0);
        sys.damageModifiers[ability] += passive.damageModifierBonus ?? 0;
        sys.nonAttackCheckBonuses[ability] += passive.nonAttackCheckBonus ?? 0;
      }
      // Passive Powers (like Sturdy) and Gear (like armor) can both add
      // flat Health Damage Reduction — same non-stacking rule, take the largest.
      if (passive.healthDamageReductionBonus) {
        bestDRBonus = Math.max(bestDRBonus, passive.healthDamageReductionBonus);
      }
      // A standing Edge on a specific roll type (e.g. Spider-Sense granting
      // Edge on Initiative checks, book p.20's "E" notation).
      if (passive.standingEdgeOn) {
        standingEdges.add(passive.standingEdgeOn);
      }
    }

    for (const ability of ABILITIES) {
      sys.damageMultipliers[ability] += bestMultiplierBonus[ability];
      sys.defenses[ability] += bestDefenseBonus[ability];
    }

    // A Team Maneuver's Defensive level (book p.39) adds flat Damage
    // Reduction for the round — folded into the same non-stacking pool as
    // Sturdy/armor. See helpers/team-maneuver.mjs for how the flag is set.
    const teamManeuver = this._activeTeamManeuver();
    if (teamManeuver?.type === "defensive") {
      const teamDR = { 1: 2, 2: 4, 3: 8 }[teamManeuver.level] ?? 0;
      bestDRBonus = Math.max(bestDRBonus, teamDR);
    }

    if (bestDRBonus) {
      sys.health.damageReduction = Math.max(sys.health.damageReduction ?? 0, bestDRBonus);
    }

    sys.standingEdges = standingEdges;
    sys.initiativeHasStandingEdge = standingEdges.has("initiative");
  }

  /**
   * Reads this actor's active Team Maneuver flag (if any) and confirms it's
   * still valid for the current combat round — maneuvers last "for this
   * round" (book p.38-39), and rather than needing a cleanup hook to clear
   * stale flags, an expired one is just treated as absent.
   */
  _activeTeamManeuver() {
    const tm = this.getFlag?.("d616", "teamManeuver");
    if (!tm) return null;
    const currentRound = game.combat?.round ?? null;
    if (tm.round !== currentRound) return null;
    return tm;
  }

  /**
   * Works out the effective Edge/Trouble (and any stacking) for a roll,
   * folding together: an explicit pre-roll choice, a standing Edge from a
   * passive Power/Gear (e.g. Spider-Sense on Initiative), a one-shot "Help"
   * Edge from a teammate (consumed once used), and an active Team Maneuver.
   * None of this attempts full book-accurate stacking math (multiple
   * independent Edges/Troubles canceling out 1-for-1, p.16) — this system
   * still models Edge/Trouble as a single resolved state per roll, just one
   * that can now come from more sources than a pre-roll dialog choice.
   */
  async _resolveEdgeTrouble(explicit, standingKey) {
    let mode = explicit && explicit !== "none" ? explicit : "none";
    let stacks = 1;
    let consumedHelp = false;

    if (mode === "none" && standingKey && this.system.standingEdges?.has(standingKey)) {
      mode = "edge";
    }
    if (mode === "none" && this.getFlag("d616", "helpedEdge")) {
      mode = "edge";
      consumedHelp = true;
    }
    const teamManeuver = this._activeTeamManeuver();
    if (teamManeuver?.type === "offensive" && standingKey === "attacks") {
      if (mode === "none") mode = "edge";
      if (mode === "edge") stacks = Math.max(stacks, teamManeuver.level >= 2 ? 2 : 1);
    }

    if (consumedHelp) await this.unsetFlag("d616", "helpedEdge");
    return { mode, stacks, teamManeuver };
  }

  /**
   * Checks whether an attack against this actor should have Trouble imposed
   * on the attacker — from actively Dodging (book p.30) or from a
   * teammate's Rally Team Maneuver Level 1 (book p.39, "all actions taken
   * against team members have trouble this round").
   */
  _incomingAttackModifier() {
    if (this.getFlag("d616", "dodging")) return "trouble";
    const tm = this._activeTeamManeuver();
    if (tm?.type === "rally" && tm.level >= 1) return "trouble";
    return null;
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
    const resolved = await this._resolveEdgeTrouble(edgeTrouble, abilityKey);
    const dice = await rollMarvelDice({ edgeTrouble: resolved.mode, stacks: resolved.stacks });
    const total = dice.diceTotal + abilityValue + checkBonus;

    const success = resolveSuccess({ total, targetNumber, isUltimate: dice.isUltimate });

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
      edgeTroubleApplied: resolved.mode
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
            edgeTroubleApplied: resolved.mode
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
    const resolved = await this._resolveEdgeTrouble(edgeTrouble, "initiative");
    const dice = await rollMarvelDice({ edgeTrouble: resolved.mode, stacks: resolved.stacks });
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
      edgeTroubleApplied: resolved.mode
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
            edgeTroubleApplied: resolved.mode
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
   *
   * If the roller has one or more tokens targeted (Foundry's own
   * targeting), this now also: looks up the target's Defense automatically
   * (instead of requiring a manual comparison), applies the target's
   * Health Damage Reduction to the damage multiplier (book p.36 — reducing
   * it below 1 means no damage at all, not even the ability-score bonus),
   * applies the target's size as an attack modifier (book p.40), checks
   * whether the target is Dodging or covered by a Rally Team Maneuver
   * (imposing Trouble), and applies the resulting damage to the target's
   * Health or Focus automatically. Shotgun/SMG-style Gear (multiTarget)
   * splits its damage across up to `maxTargets` currently-targeted tokens.
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

    // --- Targets (for auto-Defense lookup, size modifier, and Damage
    // Reduction / auto-damage-application) ---
    const isMultiTarget = item.type === "gear" && sys.attack?.multiTarget;
    const targets = isMultiTarget ? getTargets(sys.attack.maxTargets || 1) : [getSingleTarget()].filter(Boolean);
    const primaryTarget = targets[0] ?? null;

    // --- Attack roll (if this power makes one) ---
    let d1 = null, d2 = null, marvelValue = null, rawMarvel = null, isFantastic = false, isGreen = false, isUltimate = false;
    let attackTotal = null, targetNumber = null, success = null, abilityValue = null;
    let sizeModifier = 0;
    let incomingModifier = null;

    if (sys.attack?.enabled) {
      const ability = sys.attack.ability;
      abilityValue = ABILITIES.includes(ability) ? this.system.abilities[ability].value : 0;

      const resolved = await this._resolveEdgeTrouble(edgeTrouble, "attacks");
      incomingModifier = primaryTarget?._incomingAttackModifier?.() ?? null;
      const finalMode = incomingModifier === "trouble" && resolved.mode !== "edge" ? "trouble" : resolved.mode;

      const dice = await rollMarvelDice({ edgeTrouble: finalMode, stacks: resolved.stacks });
      d1 = dice.d1; d2 = dice.d2; marvelValue = dice.marvelValue; rawMarvel = dice.rawMarvel;
      isFantastic = dice.isFantastic; isGreen = dice.isGreen; isUltimate = dice.isUltimate;

      // Team Maneuver Offensive Level 3: turn the Marvel Die to a Fantastic
      // success against targets of equal or lower Rank (book p.39).
      if (resolved.teamManeuver?.type === "offensive" && resolved.teamManeuver.level >= 3
        && primaryTarget && (primaryTarget.system.rank ?? 1) <= this.system.rank) {
        isFantastic = true;
        marvelValue = 6;
      }

      if (primaryTarget) sizeModifier = SIZE_ATTACK_MODIFIER[primaryTarget.system.size] ?? 0;
      attackTotal = dice.diceTotal + abilityValue + sizeModifier;

      if (sys.attack.defenseTarget === "flat") {
        targetNumber = sys.attack.flatDC;
      } else if (ABILITIES.includes(sys.attack.defenseTarget)) {
        targetNumber = primaryTarget ? primaryTarget.system.defenses?.[sys.attack.defenseTarget] ?? null : null;
      }
      success = resolveSuccess({ total: attackTotal, targetNumber, isUltimate });
    }

    // --- Damage (if applicable) ---
    // Multiplier/modifier are computed whenever this attack deals damage at
    // all, even if this particular hit didn't land — they're stashed in the
    // chat message's flags so that adding Edge/Trouble after the fact (which
    // can turn a miss into a hit against a flat DC) can compute damage then
    // too, without needing to re-derive the actor's state later.
    const dealsDamageFlag = !!(sys.attack?.enabled && sys.attack?.dealsDamage);
    const damageType = sys.attack?.damageType === "focus" ? "focus" : "health";
    let damage = null;
    let damageParams = null;
    let drApplied = 0;
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
        // Per the book (p.36): Damage Reduction reduces the multiplier
        // itself, before the ability-score add; if that drops the
        // multiplier below 1, the attack does no damage at all.
        if (primaryTarget) drApplied = primaryTarget.system.health?.damageReduction ?? 0;
        const effectiveMultiplier = multiplier - drApplied;
        damage = effectiveMultiplier < 1 ? 0 : computeDamage({ marvelValue, multiplier: effectiveMultiplier, modifier, isFantastic });
      }
    }

    // --- Spend Focus ---
    if (focusCost > 0) {
      await this.update({ "system.focus.value": Math.max(0, this.system.focus.value - focusCost) });
    }

    // --- Apply damage to target(s), automatically ---
    let targetSummary = null;
    if (dealsDamageFlag && (success === null || success) && damage) {
      if (isMultiTarget && targets.length > 1) {
        const share = Math.floor(damage / targets.length);
        for (const t of targets) await this._applyDamageTo(t, share, damageType);
        targetSummary = targets.map((t) => t.name).join(", ") + ` (${share} each)`;
      } else if (primaryTarget) {
        await this._applyDamageTo(primaryTarget, damage, damageType);
        targetSummary = primaryTarget.name;
      }
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
      targetName: targetSummary,
      drApplied,
      success,
      isFantastic,
      isGreen,
      damage,
      damageType,
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
            targetActorId: primaryTarget?.id ?? null,
            isAttack: !!sys.attack?.enabled,
            dealsDamageFlag,
            damageParams,
            damage,
            damageType,
            fantasticEffect,
            focusCost,
            focusRemaining,
            edgeTroubleApplied: edgeTrouble
          }
        }
      }
    });
  }

  /** Subtracts damage from a target's Health or Focus and syncs its conditions. */
  async _applyDamageTo(targetActor, amount, pool = "health") {
    if (!targetActor || !amount) return;
    const path = pool === "focus" ? "system.focus.value" : "system.health.value";
    const current = pool === "focus" ? targetActor.system.focus.value : targetActor.system.health.value;
    await targetActor.update({ [path]: current - amount });
    await syncAutomaticConditions(targetActor);
  }

  /** @deprecated Back-compat alias — use rollItem(), which also handles Gear. */
  async rollPower(itemId, options = {}) {
    return this.rollItem(itemId, options);
  }

  // -------------------------------------------------------------------
  // Karma (book p.19, p.36)
  // -------------------------------------------------------------------

  /** Spend 1 Karma to add Edge to a roll already posted to chat. */
  async spendKarmaForEdgeOnMessage(message) {
    const { applyEdgeTroubleToMessage } = await import("../dice/marvel-roll.mjs");
    if (this.system.karma.value < 1) {
      ui.notifications.warn(game.i18n.localize("D616.Karma.NotEnough"));
      return;
    }
    const data = message.getFlag("d616", "roll");
    if (data?.edgeTroubleApplied && data.edgeTroubleApplied !== "none") {
      ui.notifications.warn(game.i18n.localize("D616.Roll.EdgeTroubleAlreadyApplied"));
      return;
    }
    await this.update({ "system.karma.value": this.system.karma.value - 1 });
    await applyEdgeTroubleToMessage(message, "edge");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Karma.SpentForEdge", { name: this.name })}</p>`
    });
  }

  /**
   * A target of an attack spends 1 Karma to impose Trouble on the
   * attacker's roll (book p.19). Only the actor whose Karma this is (or
   * the GM) can do this, and only against a roll that recorded them as its
   * target (see rollItem's targetActorId flag).
   */
  async imposeKarmaTrouble(message) {
    const { applyEdgeTroubleToMessage } = await import("../dice/marvel-roll.mjs");
    if (this.system.karma.value < 1) {
      ui.notifications.warn(game.i18n.localize("D616.Karma.NotEnough"));
      return;
    }
    const data = message.getFlag("d616", "roll");
    if (data?.edgeTroubleApplied && data.edgeTroubleApplied !== "none") {
      ui.notifications.warn(game.i18n.localize("D616.Roll.EdgeTroubleAlreadyApplied"));
      return;
    }
    await this.update({ "system.karma.value": this.system.karma.value - 1 });
    await applyEdgeTroubleToMessage(message, "trouble");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Karma.SpentForTrouble", { name: this.name })}</p>`
    });
  }

  /**
   * Karma-fueled recovery (book p.19, p.36): make a Resilience check (Health)
   * or Vigilance check (Focus) vs. TN 10. On success, gain back
   * (Marvel Die x Rank) points, doubled on a Fantastic. Normally costs 1
   * Karma; pass free:true for the version a Rally Team Maneuver Level 2
   * grants ("as if they had spent a point of Karma", without actually
   * spending one) or a teammate helping someone else recover.
   */
  async recoverPool(pool = "health", { free = false } = {}) {
    if (!free && this.system.karma.value < 1) {
      ui.notifications.warn(game.i18n.localize("D616.Karma.NotEnough"));
      return;
    }
    const abilityKey = pool === "focus" ? "vigilance" : "resilience";
    const abilityValue = this.system.abilities[abilityKey].value;
    const dice = await rollMarvelDice({});
    const total = dice.diceTotal + abilityValue;
    const success = resolveSuccess({ total, targetNumber: 10, isUltimate: dice.isUltimate });

    let healed = 0;
    if (success) {
      healed = dice.marvelValue * this.system.rank;
      if (dice.isFantastic) healed *= 2;
      const path = pool === "focus" ? "focus" : "health";
      const current = this.system[path].value;
      const max = this.system[path].max;
      await this.update({ [`system.${path}.value`]: Math.min(max, current + healed) });
    }
    if (!free) {
      await this.update({ "system.karma.value": this.system.karma.value - 1 });
    }

    const title = game.i18n.format(pool === "focus" ? "D616.Karma.RecoverFocusTitle" : "D616.Karma.RecoverHealthTitle", { name: this.name });
    const content = await renderRollCard({
      actor: this, title, d1: dice.d1, d2: dice.d2, marvelValue: dice.marvelValue, rawMarvel: dice.rawMarvel,
      abilityValue, checkBonus: 0, total, targetNumber: 10, success, isFantastic: dice.isFantastic, isGreen: dice.isGreen,
      isAttack: false, edgeTroubleApplied: "none",
      healed
    });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
    return healed;
  }

  /** Non-Karma natural healing (book p.36): Rank/hour resting, double while asleep. */
  async restRecover({ hours = 1, asleep = false } = {}) {
    const amount = this.system.rank * hours * (asleep ? 2 : 1);
    const health = Math.min(this.system.health.max, this.system.health.value + amount);
    const focus = Math.min(this.system.focus.max, this.system.focus.value + amount);
    await this.update({ "system.health.value": health, "system.focus.value": focus });
    if (asleep) await this.resetKarma();
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Karma.RestRecovered", { name: this.name, amount, hours })}</p>`
    });
  }

  /** Karma resets to its standard number (Rank, if Heroic) after a night's sleep — any unspent excess is lost. */
  async resetKarma() {
    await this.update({ "system.karma.value": this.system.karma.max });
  }

  /** GM (or anyone, at the table's discretion) awarding Karma for good play (book p.20). */
  async awardKarma(amount = 1) {
    await this.update({ "system.karma.value": this.system.karma.value + amount });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Karma.Awarded", { name: this.name, amount })}</p>`
    });
  }

  // -------------------------------------------------------------------
  // Standard Action maneuvers beyond Attack/Use a Power (book p.29-31)
  // -------------------------------------------------------------------

  /** Dodge: attacks against this character have Trouble until their next turn. */
  async dodge() {
    await this.setFlag("d616", "dodging", true);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Action.DodgeNote", { name: this.name })}</p>`
    });
  }

  /** Clears the Dodge flag — call at the start of this actor's next turn. */
  async clearDodge() {
    await this.unsetFlag("d616", "dodging");
  }

  /** Help: the targeted ally gets a one-shot Edge on their next action check. */
  async helpAlly(targetActor) {
    if (!targetActor) {
      ui.notifications.warn(game.i18n.localize("D616.Action.HelpNeedsTarget"));
      return;
    }
    await targetActor.setFlag("d616", "helpedEdge", true);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Action.HelpNote", { name: this.name, target: targetActor.name })}</p>`
    });
  }

  /**
   * Escape or Grab (book p.30-31): a Melee check against the other
   * character's Melee Defense. Grab success (or a Fantastic success)
   * applies the Grabbed/Pinned condition to the target; Escape success
   * clears Grabbed/Pinned from the roller.
   */
  async meleeContest(targetActor, { mode = "grab" } = {}) {
    if (!targetActor) {
      ui.notifications.warn(game.i18n.localize("D616.Action.NeedsTarget"));
      return;
    }
    const abilityValue = this.system.abilities.melee.value;
    const dice = await rollMarvelDice({});
    const total = dice.diceTotal + abilityValue;
    const targetNumber = targetActor.system.defenses.melee;
    const success = resolveSuccess({ total, targetNumber, isUltimate: dice.isUltimate });

    if (success) {
      if (mode === "grab") {
        const statusId = dice.isFantastic ? "d616-pinned" : "d616-grabbed";
        await targetActor.toggleStatusEffect(statusId, { active: true });
      } else {
        await this.toggleStatusEffect("d616-grabbed", { active: false });
        await this.toggleStatusEffect("d616-pinned", { active: false });
      }
    }

    const title = game.i18n.format(mode === "grab" ? "D616.Action.GrabTitle" : "D616.Action.EscapeTitle", { name: this.name, target: targetActor.name });
    const content = await renderRollCard({
      actor: this, title, d1: dice.d1, d2: dice.d2, marvelValue: dice.marvelValue, rawMarvel: dice.rawMarvel,
      abilityValue, checkBonus: 0, total, targetNumber, defenseTargetLabel: "Melee Defense", success,
      isFantastic: dice.isFantastic, isGreen: dice.isGreen, isAttack: false, edgeTroubleApplied: "none"
    });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
  }
}
