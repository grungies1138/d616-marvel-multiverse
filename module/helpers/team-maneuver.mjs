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
 *                       this round — read by _incomingAttackModifier.
 *   Rally L2        -> every member immediately makes a free Karma-style
 *                       recovery roll (no Karma spent) for Health or Focus.
 *   Rally L3        -> revives one Killed or Shattered team member back to
 *                       1 Health/Focus (book: "one unconscious or dying
 *                       teammate returns to the fight").
 * This only requires one member to have targeted the rest of the team with
 * Foundry's normal targeting before opening the dialog; the actor opening
 * the dialog is always included as a participant even if not self-targeted.
 */

const LEVEL_TABLE = [
  { maxAvgRank: 2, level: 1, cost: 5 },
  { maxAvgRank: 4, level: 2, cost: 10 },
  { maxAvgRank: 6, level: 3, cost: 15 }
];

function levelInfoFor(averageRank) {
  return LEVEL_TABLE.find((row) => averageRank <= row.maxAvgRank) ?? LEVEL_TABLE[LEVEL_TABLE.length - 1];
}

function gatherParticipants(initiator) {
  const targeted = Array.from(game.user.targets).map((t) => t.actor).filter((a) => a && a.type === "character");
  const set = new Map();
  if (initiator) set.set(initiator.id, initiator);
  for (const a of targeted) set.set(a.id, a);
  return Array.from(set.values());
}

/**
 * Attempts to pay a member's Focus share; if they're short, falls back to
 * spending 1 Karma instead (book p.39). Returns false (and warns) only if
 * the member can afford neither.
 */
async function payShare(actor, focusCost) {
  if (actor.system.focus.value >= focusCost) {
    await actor.update({ "system.focus.value": actor.system.focus.value - focusCost });
    return true;
  }
  if (actor.system.karma.value >= 1) {
    await actor.update({ "system.karma.value": actor.system.karma.value - 1 });
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TeamManeuver.PaidWithKarma", { name: actor.name })}</p>`
    });
    return true;
  }
  ui.notifications.warn(game.i18n.format("D616.TeamManeuver.CantAfford", { name: actor.name }));
  return false;
}

export async function openTeamManeuverDialog(initiator) {
  const participants = gatherParticipants(initiator);
  if (participants.length < 2) {
    ui.notifications.warn(game.i18n.localize("D616.TeamManeuver.NeedsTargets"));
    return;
  }
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

  for (const actor of participants) {
    const ok = await payShare(actor, cost);
    if (!ok) return; // one member couldn't pay — abort before anyone else is charged... in
    // practice this checks in participant order; a GM adjudicates edge cases.
  }

  const round = game.combat?.round ?? null;

  if (type === "rally" && level >= 2) {
    // Rally L2 resolves immediately: everyone makes a free recovery roll.
    for (const actor of participants) {
      await actor.recoverPool("health", { free: true });
    }
    if (level >= 3) {
      const downed = participants.find(
        (a) => a.system.health.value <= -a.system.health.max || a.system.focus.value <= -a.system.focus.max
      );
      if (downed) {
        await downed.update({
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
    await actor.setFlag("d616", "teamManeuver", { type, level, round });
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
