import { damageFromRoll } from "../dice/marvel-roll.mjs";

/**
 * Chat-card Apply Damage / Undo. A hit only applies itself automatically
 * when the roller targeted a token they're allowed to edit before rolling;
 * these cover everything else (a forgotten target, a player hitting a
 * GM-owned villain, damage that went to the wrong token).
 *
 * Every application — automatic or by button — is recorded on the chat
 * message as `flags.d616.roll.applied` ([{ uuid, amount, pool }]), which is
 * what Undo reverses.
 */

/**
 * Damage that stops 1 point short of the worst outcome. Killed is
 * Health <= -max and Shattered is Focus <= -max, so the floor is 1 - max.
 *   - Nonlethal attacks (book p.36) stop short of Killed (Health only).
 *   - Holding Back (p.34): an attacker with the Heroic tag stops short of
 *     Killed and of Shattered, unless the player declared the attack lethal.
 * `caps` is { nonlethal, holdBack } (a bare boolean means nonlethal);
 * `before` is the target's value before this hit, if not the current one.
 */
export function nonlethalCap(actor, amount, pool, caps, before = null) {
  const { nonlethal = false, holdBack = false } = typeof caps === "object" && caps ? caps : { nonlethal: !!caps };
  const applies = (pool === "health" && (nonlethal || holdBack)) || (pool === "focus" && holdBack);
  if (!applies || !amount) return amount;
  const current = before ?? actor.system[pool].value;
  const floor = 1 - actor.system[pool].max;
  return Math.max(0, Math.min(amount, current - floor));
}

/** Tokens the user has targeted, falling back to the ones they've selected. */
function chosenActors() {
  const targeted = Array.from(game.user.targets);
  const tokens = targeted.length ? targeted : (canvas?.tokens?.controlled ?? []);
  const byUuid = new Map();
  for (const t of tokens) if (t.actor) byUuid.set(t.actor.uuid, t.actor);
  return Array.from(byUuid.values());
}

/**
 * Damage against one specific target, recomputed from the roll's stored
 * multiplier/modifier so that target's own Damage Reduction is applied
 * (book p.36: DR comes off the multiplier; below 1 means no damage at all).
 */
function damageAgainst(data, actor) {
  return damageFromRoll({
    damageParams: data.damageParams,
    drApplied: actor.system.health?.damageReduction ?? 0,
    marvelValue: data.marvelValue,
    isFantastic: data.isFantastic
  }).damage;
}

/**
 * After Edge/Trouble changes a roll, move any damage this card already
 * applied to match the new result — the difference comes off (or goes back
 * onto) each target, and a hit that became a miss refunds it entirely.
 * `divisor` is set on entries from a multi-target (Shotgun/SMG) hit, which
 * split the damage between targets. Targets this user can't edit are left
 * as they were and reported as `stale`, so the card can say so.
 */
export async function reconcileAppliedDamage(data) {
  const entries = data.applied ?? [];
  const applied = [];
  const lines = [];
  let stale = false;
  for (const entry of entries) {
    const actor = await fromUuid(entry.uuid);
    if (!actor?.isOwner) {
      applied.push(entry);
      stale = true;
      continue;
    }
    const hit = data.success !== false && data.damage !== null && data.damageParams;
    const raw = hit ? Math.floor(damageAgainst(data, actor) / (entry.divisor ?? 1)) : 0;
    const amount = nonlethalCap(actor, raw, entry.pool, { nonlethal: data.nonlethal, holdBack: data.holdBack }, actor.system[entry.pool].value + entry.amount);
    const delta = amount - entry.amount;
    if (delta) {
      await actor.update({ [`system.${entry.pool}.value`]: actor.system[entry.pool].value - delta });
      lines.push(game.i18n.format("D616.Damage.AdjustedLine", { name: actor.name, from: entry.amount, to: amount }));
    }
    if (amount > 0) applied.push({ ...entry, amount });
  }
  return { applied, lines, stale };
}

function canEditMessage(message) {
  return game.user.isGM || message.isOwner || message.author?.id === game.user.id;
}

function note(content) {
  ChatMessage.create({ content: `<p class="d616-edge-trouble-note">${content}</p>` });
}

export async function applyDamageFromMessage(message) {
  const data = message.getFlag("d616", "roll");
  if (!data?.dealsDamageFlag || data.damage === null || data.damage === undefined || !data.damageParams) return;

  if (!canEditMessage(message)) {
    ui.notifications.warn(game.i18n.localize("D616.Damage.NoPermissionCard"));
    return;
  }
  const actors = chosenActors();
  if (!actors.length) {
    ui.notifications.warn(game.i18n.localize("D616.Damage.NoTargets"));
    return;
  }

  const pool = data.damageType === "focus" ? "focus" : "health";
  const applied = [...(data.applied ?? [])];
  const lines = [];
  for (const actor of actors) {
    if (!actor.isOwner) {
      ui.notifications.warn(game.i18n.format("D616.Damage.NoPermissionActor", { name: actor.name }));
      continue;
    }
    const amount = nonlethalCap(actor, damageAgainst(data, actor), pool, { nonlethal: data.nonlethal, holdBack: data.holdBack });
    if (amount > 0) {
      await actor.update({ [`system.${pool}.value`]: actor.system[pool].value - amount });
      applied.push({ uuid: actor.uuid, amount, pool });
    }
    lines.push(game.i18n.format("D616.Damage.AppliedLine", { name: actor.name, amount }));
  }
  if (!lines.length) return;

  await message.update({ "flags.d616.roll.applied": applied });
  note(game.i18n.format("D616.Damage.AppliedNote", {
    lines: lines.join(", "),
    pool: game.i18n.localize(`D616.Roll.DamageType.${pool}`)
  }));
}

export async function undoDamageFromMessage(message) {
  const data = message.getFlag("d616", "roll");
  const applied = data?.applied ?? [];
  if (!applied.length) {
    ui.notifications.warn(game.i18n.localize("D616.Damage.NothingToUndo"));
    return;
  }
  if (!canEditMessage(message)) {
    ui.notifications.warn(game.i18n.localize("D616.Damage.NoPermissionCard"));
    return;
  }

  const remaining = [];
  const lines = [];
  for (const entry of applied) {
    const actor = await fromUuid(entry.uuid);
    if (!actor?.isOwner) {
      remaining.push(entry);
      if (actor) ui.notifications.warn(game.i18n.format("D616.Damage.NoPermissionActor", { name: actor.name }));
      continue;
    }
    await actor.update({ [`system.${entry.pool}.value`]: actor.system[entry.pool].value + entry.amount });
    lines.push(game.i18n.format("D616.Damage.AppliedLine", { name: actor.name, amount: entry.amount }));
  }
  if (!lines.length) return;

  await message.update({ "flags.d616.roll.applied": remaining });
  note(game.i18n.format("D616.Damage.UndoNote", { lines: lines.join(", ") }));
}
