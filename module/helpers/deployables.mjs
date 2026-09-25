/**
 * Deployables: things a character puts on the battlefield with a Power or
 * Gear item, such as Circuit's support drone. An item with "Deploys
 * something" ticked places a token next to its user when it's used, and
 * the user controls that token.
 *
 * Each source item has one world actor of type "deployable" (in a
 * "Deployables" folder), refreshed from the item's Deploy settings every
 * time it's deployed, with the same owners as the character. Only one of
 * each is on the field at a time: deploying again moves it back to full
 * Health next to its user. It's destroyed (its token removed) at 0 Health.
 *
 * Players can't create actors or tokens, so the work runs on the GM's
 * client through the relay (gm-relay.mjs); with no GM connected it's
 * refused.
 */
import { asGM } from "./gm-relay.mjs";

const FOLDER = "Deployables";

/** The deployable actor for a character's item, if one exists. */
export function deployableFor(owner, itemId) {
  return game.actors.find((a) => a.type === "deployable" && a.system.ownerUuid === owner.uuid && a.system.sourceItemId === itemId);
}

/** Tokens of this deployable currently placed on any scene. */
function placedTokens(deployable) {
  return game.scenes.contents.flatMap((s) => s.tokens.filter((t) => t.actorId === deployable.id));
}

/** A character's deployables that are currently on the field. */
export function activeDeployables(owner) {
  return game.actors.filter((a) => a.type === "deployable" && a.system.ownerUuid === owner.uuid && placedTokens(a).length);
}

/**
 * Called by D616Actor#rollItem after an item with Deploy enabled is used.
 * Places the deployable next to the character's token on the scene being
 * viewed. Resolves true if it was placed.
 */
export async function deployFromItem(owner, item) {
  const scene = canvas?.scene;
  // getActiveTokens(false, true) gives TokenDocuments; prefer one on this scene.
  const docs = owner.getActiveTokens(false, true);
  const ownerToken = docs.find((t) => t.parent === scene);
  if (!scene || !ownerToken) {
    ui.notifications.warn(game.i18n.format("D616.Deploy.NoToken", { name: owner.name }));
    return false;
  }
  const grid = scene.grid.size;
  return asGM("deploy", {
    ownerUuid: owner.uuid,
    itemId: item.id,
    sceneId: scene.id,
    x: ownerToken.x + (ownerToken.width ?? 1) * grid,
    y: ownerToken.y,
    disposition: ownerToken.disposition
  });
}

/** Removes a deployable's tokens from every scene. */
export function recallDeployable(deployable) {
  return asGM("recall", { uuid: deployable.uuid });
}

// ---------------------------------------------------------------------------
// GM side (called from the relay handlers)
// ---------------------------------------------------------------------------

async function deployablesFolder() {
  return game.folders.find((f) => f.type === "Actor" && f.name === FOLDER)
    ?? Folder.create({ name: FOLDER, type: "Actor" });
}

const SIZE_SPACES = { microscopic: 1, miniature: 1, tiny: 1, little: 1, small: 1, average: 1, big: 1, huge: 2, gigantic: 3, titanic: 4, gargantuan: 5 };

export async function gmDeploy({ ownerUuid, itemId, sceneId, x, y, disposition }) {
  const owner = await fromUuid(ownerUuid);
  const item = owner?.items.get(itemId);
  const scene = game.scenes.get(sceneId);
  if (!owner || !item || !scene) throw new Error("Deploy: character, item or scene not found");
  const cfg = item.system.deploy;
  const name = cfg.name?.trim() || item.name;
  const img = cfg.img?.trim() || item.img;
  const system = {
    ownerUuid, sourceItemId: itemId, rank: owner.system.rank ?? 1,
    size: cfg.size, defense: cfg.defense, speed: cfg.speed,
    health: { value: cfg.health, max: cfg.health, damageReduction: 0 },
    effect: item.system.effect ?? ""
  };
  // Same owners as the character, so its player controls the token.
  const ownership = foundry.utils.deepClone(owner.ownership);
  const spaces = SIZE_SPACES[cfg.size] ?? 1;
  const prototypeToken = {
    name, actorLink: true, disposition, width: spaces, height: spaces,
    texture: { src: img }, displayName: CONST.TOKEN_DISPLAY_MODES.HOVER, displayBars: CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    bar1: { attribute: "health" }
  };

  let actor = deployableFor(owner, itemId);
  if (actor) {
    await actor.update({ name, img, system, ownership, prototypeToken });
    for (const t of placedTokens(actor)) await t.delete();
  } else {
    const folder = await deployablesFolder();
    actor = await Actor.create({ name, img, type: "deployable", folder: folder.id, system, ownership, prototypeToken });
  }
  const tokenData = (await actor.getTokenDocument({ x, y })).toObject();
  await scene.createEmbeddedDocuments("Token", [tokenData]);
}

export async function gmRecall({ uuid }) {
  const actor = await fromUuid(uuid);
  if (!actor) return;
  for (const t of placedTokens(actor)) await t.delete();
}

/**
 * Called on the responsible client after a deployable's Health changes:
 * at 0 or below it's destroyed, and its tokens come off the field.
 */
export async function checkDeployableDestroyed(actor) {
  if (actor.type !== "deployable" || actor.system.health.max <= 0 || actor.system.health.value > 0) return;
  const tokens = placedTokens(actor);
  if (!tokens.length) return;
  for (const t of tokens) await t.delete();
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Deploy.Destroyed", { name: actor.name })}</p>`
  });
}
