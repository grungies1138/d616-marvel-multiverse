/**
 * Lets a player's action change a document they don't own, by asking the
 * active GM's client to make the change over the system socket.
 *
 * Several rules legitimately reach into someone else's character: Help puts
 * an Edge on an ally, a successful Grab puts a Condition on the target, a
 * Team Maneuver charges every member's Focus, and spending Karma to impose
 * Trouble changes the attacker's chat card. A player's client can't write
 * any of those itself, so each call site uses these helpers, which write
 * directly when the user already has permission and relay to the GM when
 * not. With no GM connected, a relayed change can't happen; the helpers
 * warn and return false so callers can stop before charging anything.
 *
 * Also: `isResponsibleClient`, for hooks that fire on every connected
 * client but must only act once.
 */

const CHANNEL = "system.d616";
const TIMEOUT_MS = 10000;

const handlers = {
  async updateDocument({ uuid, data }) {
    const doc = await fromUuid(uuid);
    await doc?.update(data);
  },
  async toggleStatus({ uuid, statusId, active }) {
    const actor = await fromUuid(uuid);
    await actor?.toggleStatusEffect(statusId, { active });
  },
  async recoverPool({ uuid, pool, free }) {
    const actor = await fromUuid(uuid);
    await actor?.recoverPool(pool, { free });
  },
  async applyEdgeTrouble({ messageId, mode }) {
    const { applyEdgeTroubleToMessage } = await import("../dice/marvel-roll.mjs");
    const message = game.messages.get(messageId);
    if (!message) throw new Error("Chat message not found");
    const ok = await applyEdgeTroubleToMessage(message, mode);
    if (!ok) throw new Error("Edge/Trouble could not be applied");
  }
};

const pending = new Map();

export function registerGMRelay() {
  game.socket.on(CHANNEL, async (payload) => {
    if (payload?.type === "response") {
      const entry = pending.get(payload.requestId);
      if (!entry || payload.to !== game.user.id) return;
      pending.delete(payload.requestId);
      clearTimeout(entry.timer);
      if (payload.ok) entry.resolve(true);
      else entry.reject(new Error(payload.error));
      return;
    }
    if (payload?.type !== "request" || !game.users.activeGM?.isSelf) return;
    const handler = handlers[payload.action];
    let ok = true, error = null;
    try {
      if (!handler) throw new Error(`Unknown relay action: ${payload.action}`);
      await handler(payload.args);
    } catch (err) {
      ok = false;
      error = err.message;
      console.error("d616 | GM relay failed", payload, err);
    }
    game.socket.emit(CHANNEL, { type: "response", requestId: payload.requestId, to: payload.from, ok, error });
  });
}

/**
 * Runs `action` as the GM: directly if this user is a GM, otherwise via the
 * active GM's client. Resolves true on success; warns and resolves false if
 * no GM is connected or the GM's client reports a failure.
 */
export async function asGM(action, args) {
  if (game.user.isGM) {
    await handlers[action](args);
    return true;
  }
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("D616.Relay.NoGM"));
    return false;
  }
  const requestId = foundry.utils.randomID();
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("timed out"));
      }, TIMEOUT_MS);
      pending.set(requestId, { resolve, reject, timer });
      game.socket.emit(CHANNEL, { type: "request", requestId, from: game.user.id, action, args });
    });
    return true;
  } catch (err) {
    ui.notifications.warn(game.i18n.format("D616.Relay.Failed", { error: err.message }));
    return false;
  }
}

/** Update a document, relaying through the GM if this user can't edit it. */
export function updateAnywhere(doc, data) {
  if (doc.isOwner) return doc.update(data).then(() => true);
  return asGM("updateDocument", { uuid: doc.uuid, data });
}

/** Toggle a status effect on an actor, relaying through the GM if needed. */
export function toggleStatusAnywhere(actor, statusId, active) {
  if (actor.isOwner) return actor.toggleStatusEffect(statusId, { active }).then(() => true);
  return asGM("toggleStatus", { uuid: actor.uuid, statusId, active });
}

/**
 * Adds Edge/Trouble to a roll card, deciding whether this client can do it
 * or the GM should. The GM does it when the card isn't this user's (only
 * allowed for `othersCard` callers — spending your own Karma to impose
 * Trouble on an attack against you), or when the card has already applied
 * damage to someone this user can't edit, so that damage moves too. Plain
 * Add Edge/Trouble on someone else's card stays refused. Resolves true if
 * Edge/Trouble was applied.
 */
export async function applyEdgeTroubleRouted(message, mode, { othersCard = false } = {}) {
  const { applyEdgeTroubleToMessage } = await import("../dice/marvel-roll.mjs");
  if (game.user.isGM) return applyEdgeTroubleToMessage(message, mode);
  const canModify = message.isOwner || message.author?.id === game.user.id;
  if (!canModify && !othersCard) return applyEdgeTroubleToMessage(message, mode); // warns and refuses
  const applied = message.getFlag("d616", "roll")?.applied ?? [];
  const touchesOthers = applied.some((e) => !fromUuidSync(e.uuid)?.isOwner);
  if (canModify && !(touchesOthers && game.users.activeGM)) return applyEdgeTroubleToMessage(message, mode);
  return asGM("applyEdgeTrouble", { messageId: message.id, mode });
}

/**
 * For hooks that fire on every connected client (updateActor,
 * updateCombat): true on exactly one of them, so automation runs once —
 * the active GM's client, or with no GM connected, the client of whoever
 * made the change.
 */
export function isResponsibleClient(userId) {
  const gm = game.users.activeGM;
  return gm ? gm.isSelf : userId === game.user.id;
}
