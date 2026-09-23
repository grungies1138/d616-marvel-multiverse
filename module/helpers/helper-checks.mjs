/**
 * Checks that end a Condition on someone (book p.36-37):
 *   - Bleeding: anyone, the victim included, uses an action on a Logic
 *     check against TN 10 to stop it.
 *   - Ablaze: anyone, the victim included, smothers the fire with an
 *     Agility check against TN 10.
 *   - Unconscious: outside combat, a helper within reach makes a Challenging
 *     Logic check; on a success the character's Health returns to 1.
 *   - Demoralized: outside combat, a helper who can communicate with them
 *     makes a Challenging Ego check; on a success their Focus returns to 1.
 * "Challenging" is the Challenging TN for the helper's Rank (tn-calculator.mjs).
 *
 * The check is an ordinary ability-check card for the helper, carrying
 * `flags.d616.roll.helperAction`. A success carries it out straight away;
 * a failure that Add Edge later turns into a success carries it out then
 * (see applyEdgeTroubleToMessage). Reach, line of sight and whether it's an
 * action are left to the table.
 */
import { computeTN } from "./tn-calculator.mjs";
import { updateAnywhere, toggleStatusAnywhere } from "./gm-relay.mjs";
import { renderRollCard, rollCardContext } from "../dice/marvel-roll.mjs";

export const HELPER_CHECKS = {
  bleeding: { status: "d616-bleeding", ability: "logic", tn: () => 10, selfAllowed: true, outOfCombat: false },
  ablaze: { status: "d616-ablaze", ability: "agility", tn: () => 10, selfAllowed: true, outOfCombat: false },
  awaken: { status: "d616-unconscious", ability: "logic", tn: (helper) => computeTN(helper.system.rank, "challenging"), selfAllowed: false, outOfCombat: true },
  rally: { status: "d616-demoralized", ability: "ego", tn: (helper) => computeTN(helper.system.rank, "challenging"), selfAllowed: false, outOfCombat: true }
};

/** The helper checks that currently apply to `victim`, for its sheet. */
export function availableHelperChecks(victim) {
  return Object.entries(HELPER_CHECKS)
    .filter(([, def]) => victim.statuses?.has(def.status))
    .map(([kind]) => kind);
}

function inActiveCombat(actor) {
  const combat = game.combat;
  return !!combat?.started && combat.combatants.some((c) => c.actor?.id === actor.id);
}

/** Characters this user could make the check with, the likeliest first. */
function helperCandidates(victim, def) {
  const preferred = [canvas?.tokens?.controlled?.[0]?.actor, game.user.character].filter(Boolean);
  const pool = game.user.isGM
    ? [...preferred, victim, ...(canvas?.tokens?.placeables ?? []).map((t) => t.actor)]
    : [...preferred, victim, ...game.actors.filter((a) => a.isOwner)];
  const seen = new Set();
  return pool.filter((a) => {
    if (!a || a.type !== "character" || !a.isOwner || seen.has(a.id)) return false;
    if (!def.selfAllowed && a.id === victim.id) return false;
    seen.add(a.id);
    return true;
  });
}

export async function openHelperCheck(victim, kind) {
  const def = HELPER_CHECKS[kind];
  if (!def) return;
  if (def.outOfCombat && inActiveCombat(victim)) {
    ui.notifications.warn(game.i18n.format("D616.HelperCheck.OutOfCombatOnly", { name: victim.name }));
    return;
  }
  const candidates = helperCandidates(victim, def);
  if (!candidates.length) {
    ui.notifications.warn(game.i18n.localize("D616.HelperCheck.NoHelper"));
    return;
  }

  const title = game.i18n.format(`D616.HelperCheck.${kind}.Title`, { name: victim.name });
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title },
    content: `
      <p>${game.i18n.format(`D616.HelperCheck.${kind}.Hint`, { name: victim.name })}</p>
      <div class="form-group">
        <label>${game.i18n.localize("D616.HelperCheck.Who")}</label>
        <select name="helper">
          ${candidates.map((a) => `<option value="${a.id}">${a.name} (${game.i18n.localize(`D616.Ability.${def.ability}`)} ${a.system.abilities[def.ability].value}, TN ${def.tn(a)})</option>`).join("")}
        </select>
      </div>`,
    ok: { callback: (event, button) => new FormDataExtended(button.form).object }
  }).catch(() => null);
  if (!result) return;

  const helper = game.actors.get(result.helper);
  if (!helper) return;
  return helper.rollAbilityCheck(def.ability, {
    targetNumber: def.tn(helper),
    flavor: title,
    helperAction: { kind, victimUuid: victim.uuid, victimName: victim.name, done: false }
  });
}

/** Carries out a successful helper check recorded on `message`. */
export async function resolveHelperAction(message) {
  const data = message.getFlag("d616", "roll");
  const action = data?.helperAction;
  if (!action || action.done || !data.success) return;
  const victim = await fromUuid(action.victimUuid);
  if (!victim) return;

  let ok = true;
  if (action.kind === "bleeding" || action.kind === "ablaze") {
    ok = await toggleStatusAnywhere(victim, HELPER_CHECKS[action.kind].status, false);
  } else if (action.kind === "awaken") {
    if (victim.system.health.value < 1) ok = await updateAnywhere(victim, { "system.health.value": 1 });
  } else if (action.kind === "rally") {
    if (victim.system.focus.value < 1) ok = await updateAnywhere(victim, { "system.focus.value": 1 });
  }
  if (!ok) return;

  const updated = {
    ...data,
    helperAction: { ...action, done: true, doneNote: game.i18n.format(`D616.HelperCheck.${action.kind}.Done`, { name: action.victimName }) }
  };
  const content = await renderRollCard(rollCardContext(updated));
  await message.update({ content, "flags.d616.roll": updated });
}
