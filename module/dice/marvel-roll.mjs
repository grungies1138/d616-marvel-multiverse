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
    const extraVal = extra.total;
    if (edgeTrouble === "edge") {
      if (extraVal > Math.min(d1, d2)) {
        if (d1 <= d2) d1 = extraVal;
        else d2 = extraVal;
      }
    } else {
      if (extraVal < Math.max(d1, d2)) {
        if (d1 >= d2) d1 = extraVal;
        else d2 = extraVal;
      }
    }
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
