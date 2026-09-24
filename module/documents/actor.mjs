import { rollMarvelDice, renderRollCard, resolveSuccess, damageFromRoll, knockbackNoteFor } from "../dice/marvel-roll.mjs";
import { updateAnywhere, toggleStatusAnywhere, applyEdgeTroubleRouted } from "../helpers/gm-relay.mjs";
import { nonlethalCap } from "../helpers/damage.mjs";
import { isConcentrationPower, concentratingOn, startConcentration } from "../helpers/concentration.mjs";
import { computeTN } from "../helpers/tn-calculator.mjs";

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

/**
 * Whether a Power/Gear attack counts as "close"/melee for the Conditions
 * rules below (book p.37-38 repeatedly distinguishes close/Melee attacks
 * from ranged ones — e.g. Unconscious/Paralyzed auto-hit only to close
 * attacks, Prone gives an edge to close attackers but trouble to ranged
 * ones). Gear has an explicit category for this; Powers don't, so this
 * falls back to reading the free-text Range field the same way the sheet's
 * own default ("Melee") already implies.
 */
function isCloseRangeAttack(item) {
  const sys = item.system;
  if (item.type === "gear" && sys.category === "weaponRanged") return false;
  if (item.type === "gear" && sys.category === "weaponMelee") return true;
  const range = (sys.range ?? "").trim().toLowerCase();
  return range === "" || range === "melee" || range === "self" || range === "touch" || range.startsWith("melee");
}

/**
 * Lethal vs. nonlethal (book p.36): weaponless attacks are nonlethal unless
 * declared otherwise, weapon attacks are lethal. On "auto", Gear weapons and
 * powers from the Melee Weapons / Ranged Weapons sets count as weapons.
 */
function isNonlethalAttack(item) {
  const choice = item.system.attack?.lethality ?? "auto";
  if (choice !== "auto") return choice === "nonlethal";
  if (item.type === "gear") return !["weaponMelee", "weaponRanged"].includes(item.system.category);
  return !/\b(melee|ranged) weapons\b/i.test(item.system.powerSet ?? "");
}

/** Grid spaces between this user's token for `actor` and a targeted token, or null off-canvas. */
function spacesBetween(actor, targetToken) {
  const own = actor.getActiveTokens()[0];
  if (!own || !targetToken || !canvas?.grid) return null;
  // From the saved positions, not the drawn ones, which lag during a move animation.
  const center = (t) => {
    const d = t.document;
    return { x: d.x + (d.width * canvas.grid.sizeX) / 2, y: d.y + (d.height * canvas.grid.sizeY) / 2 };
  };
  const path = canvas.grid.measurePath([center(own), center(targetToken)]);
  return path.spaces ?? Math.round(path.distance / canvas.grid.distance);
}

export default class D616Actor extends Actor {
  /** Layer item-driven passive bonuses on top of the base derived data. */
  prepareDerivedData() {
    super.prepareDerivedData(); // runs this.system.prepareDerivedData() internally
    if (this.type !== "character") return;

    const sys = this.system;

    // Power-pick budget (book p.67): Rank x 4 powers. A validation aid at
    // character-creation time, not something live-enforced — nothing stops
    // a player from adding a 17th power on a Rank-4 sheet, this just shows
    // the count so it's easy to notice.
    sys.powerBudget = {
      used: this.items.filter((i) => i.type === "power").length,
      max: sys.rank * 4
    };

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
    let hasKnockback = false;

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
      // Book p.34: Knockback is only available to "a character with the
      // Mighty power" — whichever Power/Gear item represents that gets
      // this checked, surfacing the option on a Fantastic close attack.
      if (passive.grantsKnockback) {
        hasKnockback = true;
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
    sys.hasKnockback = hasKnockback;

    // Blinded (book p.37): "speed is reduced by half for all modes of travel."
    if (this.statuses?.has("d616-blinded") && sys.speeds) {
      for (const key of Object.keys(sys.speeds)) {
        sys.speeds[key] = Math.floor(sys.speeds[key] / 2);
      }
    }
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
   * Works out the effective Edge/Trouble (and any stacking) for a roll by
   * tallying every source as +1 Edge or +1 Trouble and netting them out
   * (book p.16: "these things cancel each other out in equal measure, so
   * you only need to deal with what's left"). Sources folded in: an
   * explicit pre-roll choice, a standing Edge from a passive Power/Gear
   * (e.g. Spider-Sense on Initiative), a one-shot "Help" Edge from a
   * teammate (consumed once used), an active Team Maneuver, this actor's
   * own active Conditions (e.g. Demoralized), and — for attacks — the
   * target's Conditions and Dodge/Rally state.
   *
   * `ability` is the actual ability being used (defaults to `standingKey`,
   * which already IS the ability key for a plain ability check); attacks
   * pass "attacks" as `standingKey` and their real ability separately, plus
   * `isCloseAttack` and `targetActor` so target-side Conditions can apply.
   */
  async _resolveEdgeTrouble(explicit, standingKey, { ability = standingKey, isCloseAttack = false, targetActor = null, extraTroubles = 0 } = {}) {
    let edges = 0;
    let troubles = extraTroubles;
    let consumedHelp = false;

    if (explicit === "edge") edges++;
    else if (explicit === "trouble") troubles++;

    if (standingKey && this.system.standingEdges?.has(standingKey)) edges++;
    if (this.getFlag("d616", "helpedEdge")) {
      edges++;
      consumedHelp = true;
    }

    const teamManeuver = this._activeTeamManeuver();
    // Offensive Team Maneuver: Edge on attacks at every level (its Level 2
    // reroll and Level 3 auto-Fantastic are applied in rollItem).
    if (teamManeuver?.type === "offensive" && standingKey === "attacks") edges++;

    const self = this._selfConditionModifiers(ability, standingKey === "attacks");
    edges += self.edges;
    troubles += self.troubles;

    if (targetActor) {
      const target = targetActor._targetConditionModifiers(isCloseAttack);
      edges += target.edges;
      troubles += target.troubles;
    }

    if (consumedHelp) await this.unsetFlag("d616", "helpedEdge");

    const net = edges - troubles;
    const mode = net > 0 ? "edge" : net < 0 ? "trouble" : "none";
    const stacks = mode === "none" ? 1 : Math.abs(net);
    return { mode, stacks, teamManeuver };
  }

  /**
   * This actor's own active Conditions that add Edge/Trouble to a roll it
   * is making (book p.37-38). `ability` is the ability being used;
   * `isAttack` distinguishes an attack roll from a plain ability check,
   * since a couple of these are worded around attacks specifically.
   * Deafened/Blinded's other, non-attack "requires hearing/sight" checks
   * aren't singled out here — there's no per-check flag for that in this
   * system yet, so those remain a manual GM call, same as before.
   */
  _selfConditionModifiers(ability, isAttack) {
    const statuses = this.statuses;
    let edges = 0;
    let troubles = 0;
    if (!statuses || statuses.size === 0) return { edges, troubles };

    if (statuses.has("d616-demoralized")) troubles++; // "trouble on all action checks"
    if (isAttack && statuses.has("d616-blinded")) troubles++; // approximates "trouble on checks requiring line of sight"
    if (isAttack && ability === "melee" && statuses.has("d616-prone")) troubles++; // "trouble on all Melee attacks"
    if ((ability === "melee" || ability === "agility") && statuses.has("d616-pinned")) troubles++; // "trouble on Melee and Agility checks"

    return { edges, troubles };
  }

  /**
   * Edge/Trouble this actor's active Conditions (plus Dodge/Rally) impose on
   * an attacker targeting it (book p.30, p.37-39). Unconscious/Paralyzed
   * aren't handled here — those force an outright hit/defense override,
   * applied directly in rollItem — and Grabbed/Pinned's full "attack against
   * the entangled pair might hit either one" rule (p.37) is approximated
   * here as flat Trouble on attacks against either member of the pair.
   */
  _targetConditionModifiers(isCloseAttack) {
    const statuses = this.statuses;
    let edges = 0;
    let troubles = 0;

    if (this.getFlag("d616", "dodging")) troubles++;
    const tm = this._activeTeamManeuver();
    if (tm?.type === "rally" && tm.level >= 1) troubles++;

    if (statuses?.has("d616-prone")) {
      if (isCloseAttack) edges++; // "close attacks against the character have an edge"
      else troubles++; // "ranged attacks against a prone character have trouble"
    }
    if (statuses?.has("d616-blinded")) edges++; // approximates "edge on checks against the character that require sight to defend"
    if (statuses?.has("d616-grabbed") || statuses?.has("d616-pinned")) troubles++;
    if (statuses?.has("d616-stunned")) edges++; // "all attacks against them have an edge"

    return { edges, troubles };
  }

  /**
   * Whether this actor's Conditions flat-out prevent it from taking the
   * action check it's about to make (book p.37-38) — Stunned, Unconscious
   * and Shattered block any action; Paralyzed blocks only Melee/Agility-
   * requiring ones. Returns a localization key to show, or null if allowed.
   * (Karma-fueled recovery is a separate code path — recoverPool — and
   * isn't gated by this, matching the book's explicit exception for it.)
   */
  _actionBlockReason(abilityKey = null) {
    const statuses = this.statuses;
    if (!statuses || statuses.size === 0) return null;
    if (statuses.has("d616-stunned")) return "D616.Condition.BlockedStunned";
    if (statuses.has("d616-unconscious")) return "D616.Condition.BlockedUnconscious";
    if (statuses.has("d616-shattered")) return "D616.Condition.BlockedShattered";
    if (statuses.has("d616-paralyzed") && (abilityKey === "melee" || abilityKey === "agility")) return "D616.Condition.BlockedParalyzed";
    return null;
  }

  /**
   * Roll a plain ability check: 2d6 + Marvel Die + Ability vs. an optional
   * target Defense/DC. Used for non-attack checks (Edge/Trouble from
   * Traits should be chosen by the roller when prompted).
   */
  async rollAbilityCheck(abilityKey, { targetNumber = null, flavor = null, edgeTrouble = "none", helperAction = null } = {}) {
    if (!ABILITIES.includes(abilityKey)) {
      ui.notifications.error(`Unknown ability: ${abilityKey}`);
      return;
    }
    const blockReason = this._actionBlockReason(abilityKey);
    if (blockReason) {
      ui.notifications.warn(game.i18n.format(blockReason, { name: this.name }));
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
      isAttack: false,
      edgeTroubleApplied: resolved.mode
    });

    const message = await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content,
      flags: {
        d616: {
          roll: {
            kind: "ability",
            total,
            success,
            // Stop Bleeding / Wake / Rally and the like: what a success does,
            // carried out now or when Edge added later turns it into one.
            helperAction,
            title,
            subtitle: null,
            d1: dice.d1,
            d2: dice.d2,
            rawMarvel: dice.rawMarvel,
            marvelValue: dice.marvelValue,
            isFantastic: dice.isFantastic,
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
            edgeTroubleApplied: resolved.mode
          }
        }
      }
    });
    if (helperAction && success) {
      const { resolveHelperAction } = await import("../helpers/helper-checks.mjs");
      await resolveHelperAction(message);
    }
    return message;
  }

  /**
   * Roll Initiative using this system's own 2d6 + Marvel Die engine (same
   * dice and Fantastic detection as every other roll here) rather
   * than Foundry's generic default, add the Vigilance-based Initiative
   * modifier, post the usual chat card, and feed the total straight into
   * the active Combat's tracker so turn order updates immediately, the
   * same as clicking the tracker's own "Roll Initiative" button would. If
   * this actor doesn't have a Combatant in the encounter yet, it's added
   * automatically (using its current token if one is placed on the scene);
   * if there's no active Combat at all, an error is shown instead, since
   * there's nothing to add this actor's initiative to.
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
            edgeTroubleApplied: resolved.mode
          }
        }
      }
    });

    const combat = game.combat;
    if (!combat) {
      ui.notifications.error(game.i18n.localize("D616.Roll.NoActiveCombat"));
      return total;
    }

    let combatant = combat.combatants.find((c) => c.actor?.id === this.id);
    if (!combatant) {
      const token = this.getActiveTokens(false, true)[0] ?? null;
      const combatantData = token
        ? { tokenId: token.id, sceneId: token.parent.id, actorId: this.id, hidden: token.hidden }
        : { actorId: this.id };
      try {
        [combatant] = await combat.createEmbeddedDocuments("Combatant", [combatantData]);
      } catch (err) {
        console.error(err);
        ui.notifications.error(game.i18n.localize("D616.Roll.CannotJoinCombat"));
        return total;
      }
    }

    await combat.setInitiative(combatant.id, total);

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

    const blockReason = this._actionBlockReason(sys.attack?.enabled ? sys.attack.ability : null);
    if (blockReason) {
      ui.notifications.warn(game.i18n.format(blockReason, { name: this.name }));
      return;
    }

    // --- Focus cost ---
    let focusCost = sys.cost.flat ?? 0;
    let bonusModifier = 0;
    if (sys.cost.scales && extraFocus > 0) {
      const ratio = sys.cost.ratio || 2;
      bonusModifier = Math.floor(extraFocus / ratio);
      focusCost += extraFocus;
    }
    // Spending Focus (book p.81): no more than 5 x Rank at once, and never
    // voluntarily down below 1.
    const maxSpend = 5 * this.system.rank;
    if (focusCost > maxSpend) {
      ui.notifications.warn(game.i18n.format("D616.Roll.FocusOverLimit", { cost: focusCost, max: maxSpend, rank: this.system.rank }));
      return;
    }
    if (focusCost > 0 && this.system.focus.value - focusCost < 1) {
      ui.notifications.warn(game.i18n.localize("D616.Roll.InsufficientFocus"));
      return;
    }

    // Concentration (book p.81): one power per point of Rank, each a
    // different power. Using one already held just re-uses it.
    const concentrates = isConcentrationPower(item);
    if (concentrates) {
      const held = concentratingOn(this);
      if (!held.some((c) => c.id === item.id) && held.length >= this.system.rank) {
        ui.notifications.warn(game.i18n.format("D616.Concentration.AtLimit", { name: this.name, rank: this.system.rank }));
        return;
      }
    }

    // --- Targets (for auto-Defense lookup, size modifier, and Damage
    // Reduction / auto-damage-application) ---
    const isMultiTarget = item.type === "gear" && sys.attack?.multiTarget;
    const targets = isMultiTarget ? getTargets(sys.attack.maxTargets || 1) : [getSingleTarget()].filter(Boolean);
    const primaryTarget = targets[0] ?? null;
    const notes = [];

    // Rifle / Submachine Gun (book p.36): Trouble against targets this close.
    let extraTroubles = 0;
    const closeLimit = item.type === "gear" ? sys.attack?.closeRangeTrouble ?? 0 : 0;
    if (sys.attack?.enabled && closeLimit > 0 && primaryTarget) {
      const spaces = spacesBetween(this, Array.from(game.user.targets)[0]);
      if (spaces !== null && spaces <= closeLimit) {
        extraTroubles = 1;
        notes.push(game.i18n.format("D616.Weapon.CloseRangeNote", { spaces, limit: closeLimit }));
      }
    }

    // --- Attack roll (if this power makes one) ---
    let d1 = null, d2 = null, marvelValue = null, rawMarvel = null, isFantastic = false, isUltimate = false;
    let attackTotal = null, targetNumber = null, success = null, abilityValue = null;
    let sizeModifier = 0;
    let forcedHit = false;
    let teamRerollNote = null;
    const isCloseAttack = isCloseRangeAttack(item);
    // What actually got applied to the dice — may differ from the raw
    // `edgeTrouble` argument once standing sources/Conditions are tallied in
    // (see _resolveEdgeTrouble) — this, not the raw argument, is what gets
    // shown on the card and stored so "Add Edge"/"Add Trouble" correctly
    // treat it as already-applied.
    let effectiveEdgeTrouble = edgeTrouble;

    if (sys.attack?.enabled) {
      const ability = sys.attack.ability;
      abilityValue = ABILITIES.includes(ability) ? this.system.abilities[ability].value : 0;

      const resolved = await this._resolveEdgeTrouble(edgeTrouble, "attacks", { ability, isCloseAttack, targetActor: primaryTarget, extraTroubles });
      effectiveEdgeTrouble = resolved.mode;

      if (primaryTarget) sizeModifier = SIZE_ATTACK_MODIFIER[primaryTarget.system.size] ?? 0;
      if (sys.attack.defenseTarget === "flat") {
        targetNumber = sys.attack.flatDC;
      } else if (ABILITIES.includes(sys.attack.defenseTarget)) {
        targetNumber = primaryTarget ? primaryTarget.system.defenses?.[sys.attack.defenseTarget] ?? null : null;
      }

      // Unconscious (book: "defenses are all reduced to 10") and Paralyzed
      // (book: "Agility defense reduced to 10 against ranged attacks") both
      // cap the relevant Defense at 10 for this attack, and either
      // Condition means a close attack automatically hits regardless.
      const targetStatuses = primaryTarget?.statuses;
      const targetUnconscious = !!targetStatuses?.has("d616-unconscious");
      const targetParalyzed = !!targetStatuses?.has("d616-paralyzed");
      if (targetNumber !== null && targetNumber !== undefined) {
        if (targetUnconscious) targetNumber = Math.min(targetNumber, 10);
        else if (targetParalyzed && sys.attack.defenseTarget === "agility" && !isCloseAttack) targetNumber = Math.min(targetNumber, 10);
      }
      forcedHit = !!primaryTarget && isCloseAttack && (targetUnconscious || targetParalyzed);

      // Offensive Team Maneuver (book p.39). Level 3: the Marvel Die becomes a
      // Fantastic success on attacks against targets of equal or higher Rank.
      // Applied to each candidate roll before judging it, so Level 2's
      // "keep the better" choice sees the result that will actually stand.
      const tm = resolved.teamManeuver?.type === "offensive" ? resolved.teamManeuver.level : 0;
      const autoFantastic = tm >= 3 && !!primaryTarget && (primaryTarget.system.rank ?? 1) >= this.system.rank;
      const judge = (raw) => {
        const dice = { ...raw };
        if (autoFantastic && !dice.isFantastic) {
          dice.diceTotal += 6 - dice.marvelValue;
          dice.isFantastic = true;
          dice.marvelValue = 6;
          dice.isUltimate = dice.d1 === 6 && dice.d2 === 6;
        }
        const total = dice.diceTotal + abilityValue + sizeModifier;
        return { dice, total, success: forcedHit || resolveSuccess({ total, targetNumber, isUltimate: dice.isUltimate }) };
      };
      let roll = judge(await rollMarvelDice({ edgeTrouble: resolved.mode, stacks: resolved.stacks }));

      // Level 2+: reroll all the dice and use the better result. "Better" =
      // a hit over a miss, then a Fantastic over not, then the higher total.
      if (tm >= 2) {
        const second = judge(await rollMarvelDice({ edgeTrouble: resolved.mode, stacks: resolved.stacks }));
        const score = (r) => [r.success === true ? 1 : 0, r.dice.isFantastic ? 1 : 0, r.total];
        const [x, y] = [score(roll), score(second)];
        const secondBetter = y[0] !== x[0] ? y[0] > x[0] : y[1] !== x[1] ? y[1] > x[1] : y[2] > x[2];
        const kept = secondBetter ? second : roll;
        teamRerollNote = game.i18n.format("D616.TeamManeuver.RerollNote", { kept: kept.total, other: (secondBetter ? roll : second).total });
        roll = kept;
      }

      ({ d1, d2, marvelValue, rawMarvel, isFantastic, isUltimate } = roll.dice);
      attackTotal = roll.total;
      success = roll.success;

      // Grenades (book p.36): the same roll is the Challenging Agility check
      // to land in the chosen space; short of that, it scatters 1d6 spaces.
      if (item.type === "gear" && sys.attack.scatters) {
        const landTN = computeTN(this.system.rank, "challenging");
        if (attackTotal < landTN) {
          const scatter = await new Roll("1d6").evaluate();
          notes.push(game.i18n.format("D616.Weapon.ScatterNote", { tn: landTN, spaces: scatter.total }));
        }
      }
    }

    // --- Damage (if applicable) ---
    // Multiplier/modifier are computed whenever this attack deals damage at
    // all, even if this particular hit didn't land — they're stashed in the
    // chat message's flags so that adding Edge/Trouble after the fact (which
    // can turn a miss into a hit against a flat DC) can compute damage then
    // too, without needing to re-derive the actor's state later.
    const dealsDamageFlag = !!(sys.attack?.enabled && sys.attack?.dealsDamage);
    const nonlethal = dealsDamageFlag && isNonlethalAttack(item);
    // Holding Back (book p.34): a Heroic attacker leaves the target 1 point
    // short of Killed or Shattered unless the attack was declared lethal.
    const holdBack = dealsDamageFlag && !!this.system.isHeroic && sys.attack?.lethality !== "lethal";
    const damageType = sys.attack?.damageType === "focus" ? "focus" : "health";
    let damage = null;
    let damageParams = null;
    let drApplied = 0;
    let knockbackNote = null;
    const knockbackEligible = isCloseAttack && !!this.system.hasKnockback;
    if (dealsDamageFlag) {
      const ability = sys.attack.ability;
      let multiplier = this.system.damageMultipliers?.[ability] ?? this.system.rank;
      // A weapon's own damage-multiplier bonus (Gear only) doesn't stack
      // with the character's other multiplier bonuses — use whichever is
      // greater, per the book's weapon rules.
      if (item.type === "gear" && sys.attack.damageMultiplierBonus) {
        multiplier = Math.max(multiplier, this.system.rank + sys.attack.damageMultiplierBonus);
      }
      // Grenades use their own multiplier in place of the attacker's (p.36).
      if (item.type === "gear" && sys.attack.ownMultiplier > 0) multiplier = sys.attack.ownMultiplier;
      const modifier = (this.system.damageModifiers?.[ability] ?? abilityValue ?? 0) + bonusModifier;
      damageParams = { multiplier, modifier };
      if (success === null || success) {
        // Per the book (p.36): Damage Reduction reduces the multiplier
        // itself, before the ability-score add; if that drops the
        // multiplier below 1, the attack does no damage at all.
        if (primaryTarget) drApplied = primaryTarget.system.health?.damageReduction ?? 0;
        const result = damageFromRoll({ damageParams, drApplied, marvelValue, isFantastic });
        damage = result.damage;

        // Knockback (book p.34): on a Fantastic close attack, a character
        // with the Mighty power can choose knockback instead of the power's
        // own Fantastic effect. Only the option and distance are shown —
        // the choice is the player's.
        knockbackNote = knockbackNoteFor({ eligible: knockbackEligible, isFantastic, multiplier: result.multiplier });
      }
    }

    // --- Spend Focus ---
    if (focusCost > 0) {
      await this.update({ "system.focus.value": Math.max(0, this.system.focus.value - focusCost) });
    }

    // --- Apply damage to target(s), automatically ---
    // Only to targets this user may edit: a player can't update a GM-owned
    // villain, and trying would throw before the chat card got posted.
    // Anything skipped is left to the card's Apply Damage button. Whatever
    // is applied is recorded on the message so the card's Undo can reverse it.
    let targetSummary = null;
    let damageNotApplied = false;
    const applied = [];
    if (dealsDamageFlag && (success === null || success) && damage !== null && (damage || isMultiTarget)) {
      const pool = damageType === "focus" ? "focus" : "health";
      const split = sys.attack.splitDamage ?? true;
      const divisor = isMultiTarget && split && targets.length > 1 ? targets.length : 1;
      // Each target's own Damage Reduction applies to its share.
      const againstTarget = (t) => damageFromRoll({ damageParams, drApplied: t.system.health?.damageReduction ?? 0, marvelValue, isFantastic }).damage;
      const hits = isMultiTarget && targets.length > 1
        ? targets.map((t) => ({ actor: t, amount: Math.floor(againstTarget(t) / divisor) }))
        : primaryTarget ? [{ actor: primaryTarget, amount: damage }] : [];
      for (const hit of hits) {
        if (!hit.actor.isOwner) {
          damageNotApplied = true;
          continue;
        }
        hit.amount = nonlethalCap(hit.actor, hit.amount, pool, { nonlethal, holdBack });
        await this._applyDamageTo(hit.actor, hit.amount, damageType);
        if (hit.amount) applied.push({ uuid: hit.actor.uuid, amount: hit.amount, pool, divisor });
      }
      if (hits.length > 1) targetSummary = hits.map((h) => `${h.actor.name} (${h.amount})`).join(", ");
      else if (hits.length === 1) targetSummary = hits[0].actor.name;
    }
    // Name the target even when no damage landed (a miss, DR soaking it all,
    // or a non-damaging attack) — the card's "Spend Karma: Trouble" button,
    // for the target's owner, only shows when a target is named.
    if (!targetSummary && primaryTarget && sys.attack?.enabled) targetSummary = primaryTarget.name;
    const canApplyDamage = dealsDamageFlag && damage !== null;

    // Concentration starts once the power has actually been used.
    if (concentrates) await startConcentration(this, item);

    const capLabel = nonlethal ? "D616.Damage.Nonlethal" : holdBack ? "D616.Damage.HoldingBack" : null;
    const subtitle = [sys.range, sys.duration, capLabel ? game.i18n.localize(capLabel) : null]
      .filter(Boolean).join(" · ");
    const extraNote = notes.join(" ") || null;
    const defenseTargetLabel = sys.attack?.defenseTarget && sys.attack.defenseTarget !== "flat"
      ? game.i18n.localize(`D616.Ability.${sys.attack.defenseTarget}`) + " Defense"
      : null;
    const fantasticEffect = sys.attack?.fantasticEffect;

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
      damage,
      damageType,
      fantasticEffect,
      knockbackNote,
      teamRerollNote,
      extraNote,
      canApplyDamage,
      damageNotApplied,
      focusCost,
      edgeTroubleApplied: effectiveEdgeTrouble
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
            isFantastic,
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
            knockbackNote,
            teamRerollNote,
            extraNote,
            nonlethal,
            holdBack,
            applied,
            // Everything the card needs to be re-judged and re-rendered
            // identically if Edge/Trouble is added after the fact.
            targetName: targetSummary,
            drApplied,
            sizeModifier,
            forcedHit,
            knockbackEligible,
            damageNotApplied,
            focusCost,
            edgeTroubleApplied: effectiveEdgeTrouble
          }
        }
      }
    });
  }

  /**
   * Subtracts damage from a target's Health or Focus. The resulting
   * Unconscious/Demoralized/etc. sync happens in the updateActor hook, on a
   * single client — calling it here too would race that.
   */
  async _applyDamageTo(targetActor, amount, pool = "health") {
    if (!targetActor || !amount) return;
    const path = pool === "focus" ? "system.focus.value" : "system.health.value";
    const current = pool === "focus" ? targetActor.system.focus.value : targetActor.system.health.value;
    await targetActor.update({ [path]: current - amount });
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
    return this._spendKarmaOnMessage(message, "edge", "D616.Karma.SpentForEdge");
  }

  /**
   * Shared by both Karma buttons: only this actor's owner may spend its
   * Karma; the Edge/Trouble is applied first — through the GM when the card
   * isn't this user's (e.g. Trouble on the GM's own attack card) — and the
   * Karma is only deducted once that has actually happened.
   */
  async _spendKarmaOnMessage(message, mode, noteKey) {
    if (!this.isOwner) {
      ui.notifications.warn(game.i18n.format("D616.Karma.NotYours", { name: this.name }));
      return;
    }
    if (this.system.karma.value < 1) {
      ui.notifications.warn(game.i18n.localize("D616.Karma.NotEnough"));
      return;
    }
    const data = message.getFlag("d616", "roll");
    if (data?.edgeTroubleApplied && data.edgeTroubleApplied !== "none") {
      ui.notifications.warn(game.i18n.localize("D616.Roll.EdgeTroubleAlreadyApplied"));
      return;
    }
    const applied = await applyEdgeTroubleRouted(message, mode, { othersCard: mode === "trouble" });
    if (!applied) return;
    await this.update({ "system.karma.value": this.system.karma.value - 1 });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format(noteKey, { name: this.name })}</p>`
    });
  }

  /**
   * A target of an attack spends 1 Karma to impose Trouble on the
   * attacker's roll (book p.19). Only the actor whose Karma this is (or
   * the GM) can do this, and only against a roll that recorded them as its
   * target (see rollItem's targetActorId flag).
   */
  async imposeKarmaTrouble(message) {
    return this._spendKarmaOnMessage(message, "trouble", "D616.Karma.SpentForTrouble");
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
      // Like a damage roll (errata p.19, p.36): Marvel die x Rank + the ability.
      healed = dice.marvelValue * this.system.rank + abilityValue;
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
      abilityValue, checkBonus: 0, total, targetNumber: 10, success, isFantastic: dice.isFantastic,
      isAttack: false, edgeTroubleApplied: "none", noEdgeTrouble: true,
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

  /**
   * Clears the Dodge flag — called automatically at the start of this
   * actor's next turn (book: "until their next turn"; see the
   * `updateCombat` hook in d616.mjs), or by hand via the sheet's "Clear
   * Dodge" button. A no-op (and silent) if Dodge isn't actually active, so
   * the automatic call doesn't spam a chat note every single turn.
   */
  async clearDodge() {
    if (!this.getFlag("d616", "dodging")) return;
    await this.unsetFlag("d616", "dodging");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Action.DodgeClearedNote", { name: this.name })}</p>`
    });
  }

  /** Help: the targeted ally gets a one-shot Edge on their next action check. */
  async helpAlly(targetActor) {
    if (!targetActor) {
      ui.notifications.warn(game.i18n.localize("D616.Action.HelpNeedsTarget"));
      return;
    }
    // The ally is usually someone else's character — relayed through the GM if so.
    if (!(await updateAnywhere(targetActor, { "flags.d616.helpedEdge": true }))) return;
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
    const blockReason = this._actionBlockReason("melee");
    if (blockReason) {
      ui.notifications.warn(game.i18n.format(blockReason, { name: this.name }));
      return;
    }
    const abilityValue = this.system.abilities.melee.value;
    const dice = await rollMarvelDice({});
    const total = dice.diceTotal + abilityValue;
    const targetNumber = targetActor.system.defenses.melee;
    const success = resolveSuccess({ total, targetNumber, isUltimate: dice.isUltimate });

    if (success) {
      if (mode === "grab") {
        // The target is usually someone else's — relayed through the GM if
        // so. If that isn't possible the roll still posts; the relay has warned.
        const statusId = dice.isFantastic ? "d616-pinned" : "d616-grabbed";
        await toggleStatusAnywhere(targetActor, statusId, true);
      } else {
        await this.toggleStatusEffect("d616-grabbed", { active: false });
        await this.toggleStatusEffect("d616-pinned", { active: false });
      }
    }

    const title = game.i18n.format(mode === "grab" ? "D616.Action.GrabTitle" : "D616.Action.EscapeTitle", { name: this.name, target: targetActor.name });
    const content = await renderRollCard({
      actor: this, title, d1: dice.d1, d2: dice.d2, marvelValue: dice.marvelValue, rawMarvel: dice.rawMarvel,
      abilityValue, checkBonus: 0, total, targetNumber, defenseTargetLabel: "Melee Defense", success,
      isFantastic: dice.isFantastic, isAttack: false, edgeTroubleApplied: "none", noEdgeTrouble: true
    });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content });
  }
}
