/**
 * Concentration (book p.81). A power whose Duration is "Concentration" lasts,
 * with no further action, until the character's concentration breaks or
 * they end it. A character can hold one such power per point of Rank, each
 * a different power.
 *
 * Held powers are kept on the actor as `flags.d616.concentration`
 * ([{ id, name }]): added when the power is used (D616Actor#rollItem),
 * ended from the sheet's header tag, and broken automatically when a
 * Condition that breaks concentration lands (see the createActiveEffect
 * hook in d616.mjs):
 *   - Unconscious, Demoralized, Stunned, Prone: everything ends. Shattered is
 *     treated the same, as it replaces Demoralized when Focus falls that far.
 *   - Paralyzed: powers that attack with Melee or Agility end.
 *   - Blinded / Deafened: only powers that need sight / hearing end, which
 *     the sheet can't tell, so the table gets a reminder listing the rest.
 * Being knocked back also breaks concentration; knockback isn't tracked, so
 * that one stays with the table.
 */
import { updateAnywhere } from "./gm-relay.mjs";

const BREAKS_ALL = ["d616-unconscious", "d616-demoralized", "d616-shattered", "d616-stunned", "d616-prone"];
const REMINDS = { "d616-blinded": "D616.Concentration.SightReminder", "d616-deafened": "D616.Concentration.HearingReminder" };

export function isConcentrationPower(item) {
  return item?.type === "power" && /concentrat/i.test(item.system.duration ?? "");
}

/** Powers this actor is concentrating on (dropping any since deleted from the sheet). */
export function concentratingOn(actor) {
  return (actor.getFlag("d616", "concentration") ?? []).filter((c) => actor.items.has(c.id));
}

export async function startConcentration(actor, item) {
  const held = concentratingOn(actor);
  if (held.some((c) => c.id === item.id)) return;
  await updateAnywhere(actor, { "flags.d616.concentration": [...held, { id: item.id, name: item.name }] });
}

function note(actor, content) {
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="d616-edge-trouble-note">${content}</p>`
  });
}

/** Ends concentration on the given powers (all of them if `ids` is omitted). */
export async function endConcentration(actor, ids = null, reason = null) {
  const held = concentratingOn(actor);
  const ending = held.filter((c) => !ids || ids.includes(c.id));
  if (!ending.length) return;
  const ok = await updateAnywhere(actor, { "flags.d616.concentration": held.filter((c) => !ending.includes(c)) });
  if (!ok) return;
  const powers = ending.map((c) => c.name).join(", ");
  note(actor, reason
    ? game.i18n.format("D616.Concentration.Broken", { name: actor.name, powers, reason })
    : game.i18n.format("D616.Concentration.Ended", { name: actor.name, powers }));
}

/** Called once (on the responsible client) whenever a status lands on an actor. */
export async function breakConcentrationFor(actor, statusIds) {
  if (!concentratingOn(actor).length) return;
  const label = (id) => game.i18n.localize(CONFIG.statusEffects.find((e) => e.id === id)?.name ?? id);

  const hard = statusIds.find((s) => BREAKS_ALL.includes(s));
  if (hard) return endConcentration(actor, null, label(hard));

  if (statusIds.includes("d616-paralyzed")) {
    const physical = concentratingOn(actor)
      .filter((c) => ["melee", "agility"].includes(actor.items.get(c.id)?.system.attack?.ability) && actor.items.get(c.id)?.system.attack?.enabled)
      .map((c) => c.id);
    if (physical.length) await endConcentration(actor, physical, label("d616-paralyzed"));
  }

  for (const [statusId, key] of Object.entries(REMINDS)) {
    if (!statusIds.includes(statusId)) continue;
    const powers = concentratingOn(actor).map((c) => c.name).join(", ");
    if (powers) note(actor, game.i18n.format(key, { name: actor.name, powers }));
  }
}
