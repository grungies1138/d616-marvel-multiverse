/**
 * Core dice engine for the Marvel Die ("dM") mechanic:
 *   Roll 2 ordinary d6 plus 1 special d6 (the Marvel Die).
 *   - If the Marvel Die shows its marked face (we use a raw roll of 1 to
 *     represent the "Marvel symbol" face), its value counts as 6 AND the
 *     result is FANTASTIC (an extra-good effect).
 *   - If the Marvel Die shows a plain 6, the result is GREEN — even a
 *     success comes with a complication the GM introduces.
 *   Total = die1 + die2 + (translated Marvel Die value) + relevant Ability.
 *
 * Edge/Trouble (book p.15-16): reroll a single d6 of the three and keep the
 * better (Edge) or worse (Trouble) result. Either die — including the
 * Marvel Die itself — is eligible: Edge can turn a plain Marvel Die into a
 * Fantastic one, and Trouble can force a Fantastic Marvel Die to be
 * rerolled away. Which die actually gets targeted is automated here rather
 * than left to player choice (the book leaves it to the player, e.g. to
 * play it safe instead of gambling on the Marvel Die) — Edge always targets
 * whichever die is currently worst, Trouble whichever is currently best,
 * with ties preferring an ordinary die over the Marvel Die. "An M is always
 * considered the best die number" (p.16), so Trouble targets the Marvel Die
 * outright whenever the roll is currently Fantastic, regardless of the
 * ordinary dice.
 */
export async function rollMarvelDice({ edgeTrouble = "none", stacks = 1 } = {}) {
  const baseRoll = new Roll("1d6 + 1d6 + 1d6");
  await baseRoll.evaluate();
  const dice = baseRoll.dice; // three separate 1d6 terms
  const [d1, d2, rawDm] = dice.map((d) => d.total);

  const state = { d1, d2, rawMarvel: rawDm, isFantastic: rawDm === 1, isGreen: rawDm === 6 };
  state.marvelValue = state.isFantastic ? 6 : state.rawMarvel;

  if (edgeTrouble === "edge" || edgeTrouble === "trouble") {
    // `stacks` lets a Team Maneuver's higher levels, or multiple independent
    // sources netting out, apply Edge/Trouble more than once (book p.16's
    // "stacking edges"/"stacking trouble") — each pass rerolls one die and
    // keeps it only if it actually helps (Edge) or hurts (Trouble).
    for (let i = 0; i < Math.max(1, stacks); i++) {
      if (edgeTrouble === "trouble" && state.isFantastic && state.d1 === 6 && state.d2 === 6) {
        // Ultimate Fantastic (book p.15): once reached, ignore any remaining Trouble.
        break;
      }
      await applyEdgeTroubleAdjustment(state, edgeTrouble);
    }
  }

  const isUltimate = state.isFantastic && state.d1 === 6 && state.d2 === 6;

  return {
    d1: state.d1,
    d2: state.d2,
    rawMarvel: state.rawMarvel,
    marvelValue: state.marvelValue,
    isFantastic: state.isFantastic,
    isGreen: state.isGreen,
    isUltimate,
    diceTotal: state.d1 + state.d2 + state.marvelValue
  };
}

/**
 * Given a d616 roll's total/target number (as already computed) and whether
 * it was an Ultimate Fantastic roll, determine success — Ultimate Fantastic
 * always succeeds regardless of the target number (book p.15).
 */
export function resolveSuccess({ total, targetNumber, isUltimate }) {
  if (isUltimate) return true;
  return targetNumber === null || targetNumber === undefined ? null : total >= targetNumber;
}

/**
 * Damage = (Marvel Die value * Damage Multiplier) + Damage Modifier.
 * Fantastic doubles the total unless a power's own text overrides that.
 */
export function computeDamage({ marvelValue, multiplier, modifier, isFantastic }) {
  const base = marvelValue * multiplier + modifier;
  return isFantastic ? base * 2 : base;
}

/**
 * An attack's damage against the target recorded on the roll: Damage
 * Reduction comes off the multiplier first, and below 1 means no damage at
 * all (book p.36). Shared by rollItem and by adding Edge/Trouble after the
 * fact, so both land on the same number.
 */
export function damageFromRoll({ damageParams, drApplied = 0, marvelValue, isFantastic }) {
  const multiplier = damageParams.multiplier - drApplied;
  if (multiplier < 1) return { damage: 0, multiplier };
  return { damage: computeDamage({ marvelValue, multiplier, modifier: damageParams.modifier, isFantastic }), multiplier };
}

/** Book p.34: 5 spaces per point of (DR-reduced) damage multiplier. */
export function knockbackNoteFor({ eligible, isFantastic, multiplier }) {
  if (!eligible || !isFantastic || multiplier < 1) return null;
  return game.i18n.format("D616.Roll.KnockbackAvailable", { distance: multiplier * 5 });
}

export async function renderRollCard(context) {
  const renderFn = foundry.applications?.handlebars?.renderTemplate ?? renderTemplate;
  return renderFn("systems/d616/templates/chat/roll-card.hbs", context);
}

/**
 * Picks which die Edge should target (the worst of the three, ties
 * preferring an ordinary die) and applies one reroll to `state` in place,
 * keeping the reroll only if it's a strict improvement. Shared by
 * rollMarvelDice's stacking loop and applyEdgeTroubleToMessage's single
 * after-the-fact application.
 */
async function applyEdgeTroubleAdjustment(state, mode) {
  const target = mode === "edge"
    ? pickEdgeTarget(state.d1, state.d2, state.marvelValue)
    : pickTroubleTarget(state.d1, state.d2, state.marvelValue, state.isFantastic);

  const oldValue = target === "marvel" ? state.marvelValue : state[target];
  const extra = await new Roll("1d6").evaluate();
  const rerollRaw = extra.total;
  const rerollValue = target === "marvel" ? (rerollRaw === 1 ? 6 : rerollRaw) : rerollRaw;

  const improves = mode === "edge" ? rerollValue > oldValue : rerollValue < oldValue;
  if (improves) {
    if (target === "marvel") {
      state.rawMarvel = rerollRaw;
      state.isFantastic = rerollRaw === 1;
      state.isGreen = rerollRaw === 6;
      state.marvelValue = state.isFantastic ? 6 : rerollRaw;
    } else {
      state[target] = rerollRaw;
    }
  }
  return { target, rerollRaw, applied: improves };
}

/** The worst of the three dice (by translated value); ties prefer an ordinary die. */
function pickEdgeTarget(d1, d2, marvelValue) {
  const worstOrdinaryKey = d1 <= d2 ? "d1" : "d2";
  const worstOrdinaryValue = d1 <= d2 ? d1 : d2;
  return marvelValue < worstOrdinaryValue ? "marvel" : worstOrdinaryKey;
}

/** The best of the three dice; the Marvel Die is always "best" when the roll is currently Fantastic (book p.16). */
function pickTroubleTarget(d1, d2, marvelValue, isFantastic) {
  if (isFantastic) return "marvel";
  const bestOrdinaryKey = d1 >= d2 ? "d1" : "d2";
  const bestOrdinaryValue = d1 >= d2 ? d1 : d2;
  return marvelValue > bestOrdinaryValue ? "marvel" : bestOrdinaryKey;
}

/**
 * Adds Edge or Trouble to a roll that has already been posted to chat: rolls
 * one extra d6, applies it with the same targeting rule as choosing Edge/
 * Trouble before rolling (including the Marvel Die itself), recomputes the
 * total/success/damage, and rewrites that chat message's card in place.
 * Only the roll's owner or the GM may do this, and it can only be applied
 * once per roll — Edge and Trouble aren't meant to stack, and neither is
 * Edge/Trouble with itself.
 */
export async function applyEdgeTroubleToMessage(message, mode) {
  const data = message.getFlag("d616", "roll");
  if (!data) return false;

  if (data.edgeTroubleApplied && data.edgeTroubleApplied !== "none") {
    ui.notifications.warn(game.i18n.localize("D616.Roll.EdgeTroubleAlreadyApplied"));
    return false;
  }
  const canModify = game.user.isGM || message.isOwner || message.author?.id === game.user.id;
  if (!canModify) {
    ui.notifications.warn(game.i18n.localize("D616.Roll.EdgeTroubleNoPermission"));
    return false;
  }

  const state = {
    d1: data.d1,
    d2: data.d2,
    rawMarvel: data.rawMarvel,
    marvelValue: data.marvelValue,
    isFantastic: data.isFantastic,
    isGreen: data.isGreen
  };
  const { rerollRaw } = await applyEdgeTroubleAdjustment(state, mode);

  // Everything the original roll folded in is on the flags, so the new
  // result is judged exactly like the original: the attack's size modifier,
  // a forced hit (close attack on an Unconscious/Paralyzed target), and the
  // target's Damage Reduction.
  const total = state.d1 + state.d2 + state.marvelValue
    + (data.abilityValue ?? 0) + (data.checkBonus ?? 0) + (data.sizeModifier ?? 0);
  const isUltimate = state.isFantastic && state.d1 === 6 && state.d2 === 6;
  const success = data.forcedHit || resolveSuccess({ total, targetNumber: data.targetNumber ?? null, isUltimate });

  let damage = null;
  let knockbackNote = null;
  if (data.isAttack && data.dealsDamageFlag && data.damageParams && success !== false) {
    const result = damageFromRoll({ damageParams: data.damageParams, drApplied: data.drApplied, marvelValue: state.marvelValue, isFantastic: state.isFantastic });
    damage = result.damage;
    knockbackNote = knockbackNoteFor({ eligible: data.knockbackEligible, isFantastic: state.isFantastic, multiplier: result.multiplier });
  }

  const updatedRollData = {
    ...data,
    d1: state.d1,
    d2: state.d2,
    rawMarvel: state.rawMarvel,
    marvelValue: state.marvelValue,
    isFantastic: state.isFantastic,
    isGreen: state.isGreen,
    total,
    success,
    damage,
    knockbackNote,
    edgeTroubleApplied: mode,
    extraDie: rerollRaw
  };

  // Damage already applied to targets from this card moves with the new
  // result (including back to nothing if the hit became a miss).
  const { reconcileAppliedDamage } = await import("../helpers/damage.mjs");
  const reconciled = await reconcileAppliedDamage(updatedRollData);
  updatedRollData.applied = reconciled.applied;

  const content = await renderRollCard(rollCardContext(updatedRollData, { staleApplied: reconciled.stale }));
  await message.update({ content, "flags.d616.roll": updatedRollData });

  const noteKey = mode === "edge" ? "D616.Roll.EdgeAppliedNote" : "D616.Roll.TroubleAppliedNote";
  ChatMessage.create({
    speaker: message.speaker,
    content: `<p class="d616-edge-trouble-note">${game.i18n.format(noteKey, { die: rerollRaw, total })}</p>`
  });
  if (reconciled.lines.length) {
    ChatMessage.create({
      speaker: message.speaker,
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Damage.AdjustedNote", { lines: reconciled.lines.join(", ") })}</p>`
    });
  }
  return true;
}

/**
 * The roll-card template context for a roll, built purely from its stored
 * flags — used when re-rendering a card after the fact so it shows the same
 * lines (target, DR, knockback, Apply/Undo) as when it was first posted.
 */
export function rollCardContext(data, extra = {}) {
  return {
    title: data.title,
    subtitle: data.subtitle,
    d1: data.d1,
    d2: data.d2,
    marvelValue: data.marvelValue,
    rawMarvel: data.rawMarvel,
    abilityValue: data.abilityValue,
    checkBonus: data.checkBonus,
    sizeModifier: data.sizeModifier,
    total: data.total,
    targetNumber: data.targetNumber,
    defenseTargetLabel: data.defenseTargetLabel,
    targetName: data.targetName,
    drApplied: data.drApplied,
    success: data.success,
    isFantastic: data.isFantastic,
    isGreen: data.isGreen,
    damage: data.damage,
    damageType: data.damageType,
    knockbackNote: data.knockbackNote,
    teamRerollNote: data.teamRerollNote,
    canApplyDamage: !!data.dealsDamageFlag && data.damage !== null && data.damage !== undefined,
    damageNotApplied: data.damageNotApplied,
    fantasticEffect: data.fantasticEffect,
    focusCost: data.focusCost,
    focusRemaining: data.focusRemaining,
    isAttack: data.isAttack,
    edgeTroubleApplied: data.edgeTroubleApplied,
    ...extra
  };
}
