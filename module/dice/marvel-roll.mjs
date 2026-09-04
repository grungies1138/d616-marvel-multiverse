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
 * Edge/Trouble here are applied to the two ordinary d6 only (the Marvel
 * Die's face is left alone so its Fantastic/Green trigger stays meaningful):
 *   Edge    = roll one extra d6, replace whichever ordinary die it improves.
 *   Trouble = roll one extra d6, replace whichever ordinary die it worsens.
 * This is a reasonable, table-friendly implementation of Edge/Trouble; if
 * your group plays it differently, this is the one function to adjust.
 */
export async function rollMarvelDice({ edgeTrouble = "none" } = {}) {
  const baseRoll = new Roll("1d6 + 1d6 + 1d6");
  await baseRoll.evaluate();

  const dice = baseRoll.dice; // three separate 1d6 terms
  let [d1, d2, dm] = dice.map((d) => d.total);

  if (edgeTrouble === "edge" || edgeTrouble === "trouble") {
    const extra = await new Roll("1d6").evaluate();
    ({ d1, d2 } = adjustDiceForEdgeTrouble(d1, d2, edgeTrouble, extra.total));
  }

  const rawMarvel = dm;
  const isFantastic = rawMarvel === 1;
  const isGreen = rawMarvel === 6;
  const marvelValue = isFantastic ? 6 : rawMarvel;

  return {
    d1,
    d2,
    rawMarvel,
    marvelValue,
    isFantastic,
    isGreen,
    diceTotal: d1 + d2 + marvelValue
  };
}

/**
 * Damage = (Marvel Die value * Damage Multiplier) + Damage Modifier.
 * Fantastic doubles the total unless a power's own text overrides that.
 */
export function computeDamage({ marvelValue, multiplier, modifier, isFantastic }) {
  const base = marvelValue * multiplier + modifier;
  return isFantastic ? base * 2 : base;
}

export async function renderRollCard(context) {
  const renderFn = foundry.applications?.handlebars?.renderTemplate ?? renderTemplate;
  return renderFn("systems/d616/templates/chat/roll-card.hbs", context);
}

/**
 * Given a pair of already-rolled ordinary dice, apply the one-extra-d6
 * Edge/Trouble adjustment: roll one more d6 and, if it can improve (Edge)
 * or worsen (Trouble) the pair, swap it in for whichever of the two it
 * affects. Shared by the up-front edgeTrouble option on rollMarvelDice()
 * above and by applyEdgeTroubleToMessage() below, which applies the same
 * adjustment retroactively to a roll that's already been posted to chat.
 */
function adjustDiceForEdgeTrouble(d1, d2, mode, extraVal) {
  if (mode === "edge") {
    if (extraVal > Math.min(d1, d2)) {
      if (d1 <= d2) d1 = extraVal;
      else d2 = extraVal;
    }
  } else if (mode === "trouble") {
    if (extraVal < Math.max(d1, d2)) {
      if (d1 >= d2) d1 = extraVal;
      else d2 = extraVal;
    }
  }
  return { d1, d2 };
}

/**
 * Adds Edge or Trouble to a roll that has already been posted to chat:
 * rolls one extra d6, applies it with the same rule as choosing Edge/
 * Trouble before rolling, recomputes the total (and success/damage where
 * relevant — the Marvel Die itself, and therefore Fantastic/Green and any
 * damage value derived from it, never changes), and rewrites that chat
 * message's card in place. Only the roll's owner or the GM may do this,
 * and it can only be applied once per roll — Edge and Trouble aren't
 * meant to stack, and neither is Edge/Trouble with itself.
 */
export async function applyEdgeTroubleToMessage(message, mode) {
  const data = message.getFlag("d616", "roll");
  if (!data) return;

  if (data.edgeTroubleApplied && data.edgeTroubleApplied !== "none") {
    ui.notifications.warn(game.i18n.localize("D616.Roll.EdgeTroubleAlreadyApplied"));
    return;
  }
  const canModify = game.user.isGM || message.isOwner || message.author?.id === game.user.id;
  if (!canModify) {
    ui.notifications.warn(game.i18n.localize("D616.Roll.EdgeTroubleNoPermission"));
    return;
  }

  const extraRoll = await new Roll("1d6").evaluate();
  const extraVal = extraRoll.total;
  const { d1, d2 } = adjustDiceForEdgeTrouble(data.d1, data.d2, mode, extraVal);

  const total = d1 + d2 + data.marvelValue + (data.abilityValue ?? 0) + (data.checkBonus ?? 0);
  const success = (data.targetNumber ?? null) === null ? null : total >= data.targetNumber;

  let damage = data.damage ?? null;
  if (data.isAttack && data.dealsDamageFlag && (success === null || success) && data.damageParams) {
    damage = computeDamage({
      marvelValue: data.marvelValue,
      multiplier: data.damageParams.multiplier,
      modifier: data.damageParams.modifier,
      isFantastic: data.isFantastic
    });
  }

  const updatedRollData = { ...data, d1, d2, total, success, damage, edgeTroubleApplied: mode, extraDie: extraVal };

  const content = await renderRollCard({
    title: data.title,
    subtitle: data.subtitle,
    d1, d2,
    marvelValue: data.marvelValue,
    rawMarvel: data.rawMarvel,
    abilityValue: data.abilityValue,
    checkBonus: data.checkBonus,
    total,
    targetNumber: data.targetNumber,
    defenseTargetLabel: data.defenseTargetLabel,
    success,
    isFantastic: data.isFantastic,
    isGreen: data.isGreen,
    damage,
    fantasticEffect: data.fantasticEffect,
    focusCost: data.focusCost,
    focusRemaining: data.focusRemaining,
    isAttack: data.isAttack,
    edgeTroubleApplied: mode
  });

  await message.update({ content, "flags.d616.roll": updatedRollData });

  const noteKey = mode === "edge" ? "D616.Roll.EdgeAppliedNote" : "D616.Roll.TroubleAppliedNote";
  ChatMessage.create({
    speaker: message.speaker,
    content: `<p class="d616-edge-trouble-note">${game.i18n.format(noteKey, { die: extraVal, total })}</p>`
  });
}
