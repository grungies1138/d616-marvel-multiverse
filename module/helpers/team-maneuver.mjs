/**
 * Team Maneuvers (book p.38-39): teammates each pay Focus to give the whole
 * group an Offensive, Defensive, or Rally effect for the round.
 *
 * The highest level available depends on the participants' AVERAGE Rank
 * (1-2: Level 1, 3-4: Level 2, 5-6: Level 3). The cost depends only on the
 * level chosen: 5 Focus per member at Level 1, 10 at Level 2, 15 at Level
 * 3, so a team can pick a lower level to pay less. A member short on Focus
 * can pay 1 Karma instead; a member who can pay neither is left out of the
 * effect rather than cancelling it for everyone.
 *
 * Levels are cumulative here: a higher level also carries every lower
 * level's effect. (The book lists the levels separately without saying
 * either way.) Effects last for the round they're used in:
 *   Offensive L1+ -> Edge on the team's attacks
 *                    (D616Actor#_resolveEdgeTrouble)
 *   Offensive L2+ -> each attack is rolled twice and the better kept
 *                    (D616Actor#rollItem)
 *   Offensive L3  -> the Marvel Die turns Fantastic on attacks against
 *                    targets of equal or HIGHER Rank (D616Actor#rollItem)
 *   Defensive     -> Health Damage Reduction 2 / 4 / 8 by level
 *                    (D616Actor#prepareDerivedData)
 *   Rally L1+     -> Trouble on attacks made against team members
 *                    (D616Actor#_targetConditionModifiers)
 *   Rally L2+     -> each member may make a free recovery roll for Health
 *                    OR Focus — offered as buttons on the announcement card
 *   Rally L3      -> one member killed or shattered is healed to at least
 *                    Health 0 and Focus 0
 *
 * Participants come from the initiator's Team / Affiliation field: every
 * character sharing a team name with them (comma-separated for characters
 * on several teams, matched case-insensitively) is offered in a checklist,
 * pre-checked if they're in the active combat. Anyone currently targeted is
 * added too, for team-ups with outsiders (book p.38). With no team set, it
 * falls back to the initiator plus whoever's targeted.
 */

import { updateAnywhere } from "./gm-relay.mjs";

/** Highest level a team of this average Rank can use (book p.38). */
function levelFor(averageRank) {
  if (averageRank <= 2) return 1;
  if (averageRank <= 4) return 2;
  return 3;
}

/** Focus each member pays for a maneuver of this level (book p.38). */
function costFor(level) {
  return level * 5;
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
  const maxLevel = levelFor(averageRank);

  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("D616.TeamManeuver.DialogTitle") },
    content: `
      <p>${game.i18n.format("D616.TeamManeuver.Participants", { names: participants.map((a) => Handlebars.escapeExpression(a.name)).join(", ") })}</p>
      <p>${game.i18n.format("D616.TeamManeuver.LevelCap", { level: maxLevel })}</p>
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
          ${Array.from({ length: maxLevel }, (_, i) => i + 1)
            .map((l) => `<option value="${l}">${game.i18n.format("D616.TeamManeuver.LevelOption", { level: l, cost: costFor(l) })}</option>`)
            .join("")}
        </select>
      </div>
    `,
    ok: { callback: (event, button) => new FormDataExtended(button.form).object }
  }).catch(() => null);
  if (!result) return;

  const level = Number(result.level);
  const type = result.type;
  const cost = costFor(level);

  // Checked before anyone is charged: other players' characters need a GM
  // connected to relay the change.
  const needsGM = !game.user.isGM && participants.some((a) => !a.isOwner);
  if (needsGM && !game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("D616.Relay.NoGM"));
    return;
  }

  // Book p.39: "Those who — for whatever reason — cannot pay the cost do
  // not get to enjoy the maneuver's benefits." They're left out rather than
  // stopping everyone else's maneuver.
  const members = [];
  const leftOut = [];
  for (const actor of participants) {
    if (!canAfford(actor, cost)) leftOut.push(actor);
    else if (await payShare(actor, cost)) members.push(actor);
    else leftOut.push(actor);
  }
  if (!members.length) {
    ui.notifications.warn(game.i18n.localize("D616.TeamManeuver.NobodyPaid"));
    return;
  }

  // Levels are cumulative: a higher level also carries every lower level's
  // effect. The round-long effects all read this one flag (see header).
  const round = game.combat?.round ?? null;
  for (const actor of members) {
    await updateAnywhere(actor, { "flags.d616.teamManeuver": { type, level, round } });
  }

  const typeLabel = game.i18n.localize(`D616.TeamManeuver.${type.charAt(0).toUpperCase()}${type.slice(1)}`);
  let content = `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TeamManeuver.Announce", {
    names: members.map((a) => Handlebars.escapeExpression(a.name)).join(", "), type: typeLabel, level
  })}</p>`;
  if (leftOut.length) {
    content += `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TeamManeuver.LeftOut", {
      names: leftOut.map((a) => Handlebars.escapeExpression(a.name)).join(", ")
    })}</p>`;
  }

  // Rally L3 (book p.39): one member killed or shattered this battle is
  // healed to at least Health 0 and Focus 0. Checked across everyone who
  // was picked, since a downed member usually can't pay.
  if (type === "rally" && level >= 3) {
    const downed = participants.find((a) => a.system.health.value <= -a.system.health.max || a.system.focus.value <= -a.system.focus.max);
    if (downed && await updateAnywhere(downed, {
      "system.health.value": Math.max(downed.system.health.value, 0),
      "system.focus.value": Math.max(downed.system.focus.value, 0)
    })) {
      content += `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TeamManeuver.Revived", { name: Handlebars.escapeExpression(downed.name) })}</p>`;
    }
  }

  const flags = {};
  // Rally L2+ (book p.39): each member may make a recovery roll for Health
  // or Focus, as if they'd spent a point of Karma. It's their choice, and
  // it's made on their own client, so the card carries a pair of buttons
  // per member; see rallyRecover.
  if (type === "rally" && level >= 2) {
    flags.d616 = { rally: { members: members.map((a) => ({ uuid: a.uuid, name: a.name })), used: [] } };
    content += rallyButtons(flags.d616.rally);
  }

  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: initiator }), content, flags });
}

/** The Rally recovery section of the announcement card: one row per member still to choose. */
function rallyButtons(rally) {
  const rows = rally.members.map((m) => {
    const name = Handlebars.escapeExpression(m.name);
    if (rally.used.includes(m.uuid)) return `<li>${name}: ${game.i18n.localize("D616.TeamManeuver.RallyUsed")}</li>`;
    return `<li>${name}:
      <button type="button" class="edge-trouble-btn" data-action="d616RallyRecover" data-actor="${m.uuid}" data-pool="health">${game.i18n.localize("D616.Sheet.Health")}</button>
      <button type="button" class="edge-trouble-btn" data-action="d616RallyRecover" data-actor="${m.uuid}" data-pool="focus">${game.i18n.localize("D616.Sheet.Focus")}</button>
    </li>`;
  }).join("");
  return `<div class="d616-rally"><p>${game.i18n.localize("D616.TeamManeuver.RallyPrompt")}</p><ul>${rows}</ul></div>`;
}

/**
 * A member's owner (or the GM) clicked Health or Focus on a Rally card: make
 * that member's free recovery roll, once. The card is usually the
 * initiator's, so marking it used goes through the GM relay when needed.
 */
export async function rallyRecover(message, actorUuid, pool) {
  const rally = message.getFlag("d616", "rally");
  if (!rally) return;
  const actor = fromUuidSync(actorUuid);
  if (!actor?.isOwner) {
    ui.notifications.warn(game.i18n.format("D616.TeamManeuver.RallyNotYours", { name: actor?.name ?? "?" }));
    return;
  }
  if (rally.used.includes(actorUuid)) {
    ui.notifications.warn(game.i18n.format("D616.TeamManeuver.RallyAlreadyUsed", { name: actor.name }));
    return;
  }
  const updated = { ...rally, used: [...rally.used, actorUuid] };
  const before = message.content.split('<div class="d616-rally">')[0];
  const marked = await updateAnywhere(message, { content: before + rallyButtons(updated), "flags.d616.rally": updated });
  if (!marked) return;
  await actor.recoverPool(pool, { free: true });
}
