import { computeDamage } from "../dice/marvel-roll.mjs";

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
  const dr = actor.system.health?.damageReduction ?? 0;
  const multiplier = data.damageParams.multiplier - dr;
  if (multiplier < 1) return 0;
  return computeDamage({
    marvelValue: data.marvelValue,
    multiplier,
    modifier: data.damageParams.modifier,
    isFantastic: data.isFantastic
  });
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
    const amount = damageAgainst(data, actor);
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
