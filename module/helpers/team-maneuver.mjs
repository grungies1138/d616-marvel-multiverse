/**
 * Team Maneuvers (book p.38-39): a group of teammates pool their Focus to
 * grant the whole team an Offensive, Defensive, or Rally effect for the
 * round. Usable once per battle per team. The level cap and per-member
 * Focus cost are driven by the participating team's AVERAGE Rank:
 *   Average Rank 1-2 -> Level 1 available, costs 5 Focus/member
 *   Average Rank 3-4 -> Level 2 available, costs 10 Focus/member
 *   Average Rank 5-6 -> Level 3 available, costs 15 Focus/member
 * A member short on Focus may cover their share with 1 Karma instead
 * (book p.39, "a character without enough Focus may spend a point of
 * Karma instead"). Effects last "for this round":
 *   Offensive L1/L2 -> Edge on the team's attacks this round (L2 stacks it)
 *                       — read by D616Actor#_resolveEdgeTrouble.
 *   Offensive L3    -> attacks against equal-or-lower-Rank targets are an
 *                       automatic Fantastic success — read by rollItem.
 *   Defensive L1/L2/L3 -> flat Health Damage Reduction (2/4/8) this round
 *                       — folded into prepareDerivedData's DR pool.
 *   Rally L1        -> Trouble on all attacks made against team members
 *                       this round — read by D616Actor#_targetConditionModifiers.
 *   Rally L2        -> every member immediately makes a free Karma-style
 *                       recovery roll (no Karma spent) for Health or Focus.
 *   Rally L3        -> revives one Killed or Shattered team member back to
 *                       1 Health/Focus (book: "one unconscious or dying
 *                       teammate returns to the fight").
 * Participants come from the initiator's Team / Affiliation field: every
 * character sharing a team name with them (comma-separated for characters
 * on several teams, matched case-insensitively) is offered in a checklist,
 * pre-checked if they're in the active combat. Anyone currently targeted is
 * added too, for team-ups with outsiders (book p.38). With no team set, it
 * falls back to the initiator plus whoever's targeted.
 */

import { asGM, updateAnywhere } from "./gm-relay.mjs";

const LEVEL_TABLE = [
  { maxAvgRank: 2, level: 1, cost: 5 },
  { maxAvgRank: 4, level: 2, cost: 10 },
  { maxAvgRank: 6, level: 3, cost: 15 }
];

function levelInfoFor(averageRank) {
  return LEVEL_TABLE.find((row) => averageRank <= row.maxAvgRank) ?? LEVEL_TABLE[LEVEL_TABLE.length - 1];
}

function teamNames(actor) {
  return (actor.system.identity?.team ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The actor whose Focus/Karma a member's share should come from: the copy
 * actually fighting (a combatant's or placed token's actor — which differs
 * from the sidebar actor for unlinked tokens), else the sidebar actor.
 */
function fightingCopy(actor) {
  const combatant = game.combat?.combatants.find((c) => c.actor?.id === actor.id);
  if (combatant?.actor) return combatant.actor;
  return actor.getActiveTokens?.(false, true)[0]?.actor ?? actor;
}

/**
 * Candidate participants and whether each starts checked. Keyed by actor id
 * so a teammate who's also targeted only appears once.
 */
function gatherCandidates(initiator) {
  const candidates = new Map();
  const inCombat = (a) => !!game.combat?.combatants.some((c) => c.actor?.id === a.id);
  if (initiator) candidates.set(initiator.id, { actor: initiator, checked: true });

  const mine = new Set(teamNames(initiator));
  if (mine.size) {
    for (const a of game.actors) {
      if (a.type !== "character" || candidates.has(a.id)) continue;
      if (!teamNames(a).some((t) => mine.has(t))) continue;
      candidates.set(a.id, { actor: fightingCopy(a), checked: !game.combat || inCombat(a) });
    }
  }
  for (const t of game.user.targets) {
    const a = t.actor;
    if (a?.type === "character") candidates.set(a.id, { actor: a, checked: true });
  }
  return { list: Array.from(candidates.values()), hasTeam: mine.size > 0 };
}

async function chooseParticipants(initiator) {
  const { list, hasTeam } = gatherCandidates(initiator);
  if (list.length < 2) {
    ui.notifications.warn(game.i18n.localize("D616.TeamManeuver.NeedsTargets"));
    return null;
  }
  // No team roster to choose from — same as before: initiator + targets.
  if (!hasTeam) return list.map((c) => c.actor);

  const rows = list.map((c, i) => `
    <label>
      <input type="checkbox" name="m${i}" ${c.checked ? "checked" : ""} ${c.actor === initiator ? "disabled checked" : ""} />
      <span>${Handlebars.escapeExpression(c.actor.name)}</span>
      <span class="d616-roster-rank">${game.i18n.localize("D616.Sheet.Rank")} ${c.actor.system.rank ?? 1}</span>
    </label>`).join("");
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("D616.TeamManeuver.DialogTitle") },
    content: `<p>${game.i18n.localize("D616.TeamManeuver.ChooseMembers")}</p><div class="d616-team-roster">${rows}</div>`,
    ok: { label: game.i18n.localize("D616.TeamManeuver.Next"), callback: (event, button) => new FormDataExtended(button.form).object }
  }).catch(() => null);
  if (!result) return null;

  const chosen = list.filter((c, i) => c.actor === initiator || result[`m${i}`]).map((c) => c.actor);
  if (chosen.length < 2) {
    ui.notifications.warn(game.i18n.localize("D616.TeamManeuver.NeedsTwo"));
    return null;
  }
  return chosen;
}

/** A member can cover their share with Focus, or 1 Karma if short (book p.39). */
function canAfford(actor, focusCost) {
  return actor.system.focus.value >= focusCost || actor.system.karma.value >= 1;
}

/** Charges a member's share (Focus, or 1 Karma if short). Call only after canAfford. */
async function payShare(actor, focusCost) {
  if (actor.system.focus.value >= focusCost) {
    return updateAnywhere(actor, { "system.focus.value": actor.system.focus.value - focusCost });
  }
  const ok = await updateAnywhere(actor, { "system.karma.value": actor.system.karma.value - 1 });
  if (ok) {
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TeamManeuver.PaidWithKarma", { name: actor.name })}</p>`
    });
  }
  return ok;
}

export async function openTeamManeuverDialog(initiator) {
  const participants = await chooseParticipants(initiator);
  if (!participants) return;
  const averageRank = participants.reduce((sum, a) => sum + (a.system.rank ?? 1), 0) / participants.length;
  const info = levelInfoFor(averageRank);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("D616.TeamManeuver.DialogTitle") },
    content: `
      <p>${game.i18n.format("D616.TeamManeuver.Participants", { names: participants.map((a) => a.name).join(", ") })}</p>
      <p>${game.i18n.format("D616.TeamManeuver.LevelCap", { level: info.level, cost: info.cost })}</p>
      <div class="form-group">
        <label>${game.i18n.localize("D616.TeamManeuver.Type")}</label>
        <select name="type">
          <option value="offensive">${game.i18n.localize("D616.TeamManeuver.Offensive")}</option>
          <option value="defensive">${game.i18n.localize("D616.TeamManeuver.Defensive")}</option>
          <option value="rally">${game.i18n.localize("D616.TeamManeuver.Rally")}</option>
        </select>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("D616.TeamManeuver.Level")}</label>
        <select name="level">
          ${Array.from({ length: info.level }, (_, i) => i + 1)
            .map((l) => `<option value="${l}">${game.i18n.format("D616.TeamManeuver.LevelOption", { level: l, cost: info.cost * l })}</option>`)
            .join("")}
        </select>
      </div>
    `,
    ok: { callback: (event, button) => new FormDataExtended(button.form).object }
  }).catch(() => null);
  if (!result) return;

  const level = Number(result.level);
  const type = result.type;
  const cost = info.cost * level;

  // Everything that could stop the maneuver is checked before anyone is
  // charged: other players' characters need a GM connected to relay the
  // change, and every member must be able to pay.
  const needsGM = !game.user.isGM && participants.some((a) => !a.isOwner);
  if (needsGM && !game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("D616.Relay.NoGM"));
    return;
  }
  const broke = participants.find((a) => !canAfford(a, cost));
  if (broke) {
    ui.notifications.warn(game.i18n.format("D616.TeamManeuver.CantAfford", { name: broke.name }));
    return;
  }
  for (const actor of participants) {
    if (!(await payShare(actor, cost))) return;
  }

  const round = game.combat?.round ?? null;

  if (type === "rally" && level >= 2) {
    // Rally L2 resolves immediately: everyone makes a free recovery roll.
    for (const actor of participants) {
      if (actor.isOwner) await actor.recoverPool("health", { free: true });
      else await asGM("recoverPool", { uuid: actor.uuid, pool: "health", free: true });
    }
    if (level >= 3) {
      const downed = participants.find(
        (a) => a.system.health.value <= -a.system.health.max || a.system.focus.value <= -a.system.focus.max
      );
      if (downed) {
        await updateAnywhere(downed, {
          "system.health.value": Math.max(downed.system.health.value, 1),
          "system.focus.value": Math.max(downed.system.focus.value, 1)
        });
        ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: downed }),
          content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TeamManeuver.Revived", { name: downed.name })}</p>`
        });
      }
    }
  }

  // Offensive/Defensive (and Rally L1's "Trouble on attacks against us")
  // last for the round — stored as a flag every participant carries, read
  // by D616Actor's own helper methods.
  for (const actor of participants) {
    await updateAnywhere(actor, { "flags.d616.teamManeuver": { type, level, round } });
  }

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: initiator }),
    content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TeamManeuver.Announce", {
      names: participants.map((a) => a.name).join(", "),
      type: game.i18n.localize(`D616.TeamManeuver.${type.charAt(0).toUpperCase()}${type.slice(1)}`),
      level
    })}</p>`
  });
}
