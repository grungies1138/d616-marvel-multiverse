/**
 * The book's Conditions vocabulary (p.37-38): a named set of status effects,
 * each with a specific rules meaning. Registered as real Foundry status
 * effects (so they show up as clickable icons on the token HUD, same as any
 * other system's conditions) using Foundry's own bundled condition icons —
 * no new artwork needed.
 *
 * Four of these are threshold-driven off Health/Focus and are kept in sync
 * automatically (see syncAutomaticConditions, called from an `updateActor`
 * hook in d616.mjs): Unconscious, Demoralized, Killed, Shattered. The rest
 * (Ablaze, Bleeding, Blinded, Deafened, Grabbed, Paralyzed, Pinned, Prone,
 * Stunned, Surprised) are toggled by hand from the token HUD.
 *
 * Most Conditions' specific numeric effects ARE now automated once toggled:
 * Trouble on Melee while Prone, halved speed while Blinded, Stunned/
 * Unconscious/Shattered blocking actions outright, Unconscious/Paralyzed
 * forcing close attacks to auto-hit, Ablaze/Bleeding's end-of-turn damage,
 * and more — see D616Actor#_selfConditionModifiers, #_targetConditionModifiers,
 * #_actionBlockReason (documents/actor.mjs), and applyEndOfTurnConditionDamage
 * below. What's still left to the table: Deafened's "requires hearing"
 * checks (no per-check flag exists to key off), Surprised's bonus-round
 * timing (no bonus-round tracking exists), and Grabbed/Pinned's full
 * "attack might hit either entangled character" redirect (approximated here
 * as flat Trouble on attacks against either one, rather than the full
 * pick-a-target-if-it-also-beats-their-Defense rule).
 */
export const CONDITIONS = [
  { id: "ablaze", label: "D616.Condition.Ablaze", icon: "icons/svg/fire.svg" },
  { id: "bleeding", label: "D616.Condition.Bleeding", icon: "icons/svg/blood.svg" },
  { id: "blinded", label: "D616.Condition.Blinded", icon: "icons/svg/blind.svg" },
  { id: "deafened", label: "D616.Condition.Deafened", icon: "icons/svg/deaf.svg" },
  { id: "demoralized", label: "D616.Condition.Demoralized", icon: "icons/svg/daze.svg" },
  { id: "grabbed", label: "D616.Condition.Grabbed", icon: "icons/svg/net.svg" },
  { id: "paralyzed", label: "D616.Condition.Paralyzed", icon: "icons/svg/paralysis.svg" },
  { id: "pinned", label: "D616.Condition.Pinned", icon: "icons/svg/net.svg" },
  { id: "prone", label: "D616.Condition.Prone", icon: "icons/svg/falling.svg" },
  { id: "shattered", label: "D616.Condition.Shattered", icon: "icons/svg/skull.svg" },
  { id: "stunned", label: "D616.Condition.Stunned", icon: "icons/svg/stoned.svg" },
  { id: "surprised", label: "D616.Condition.Surprised", icon: "icons/svg/terror.svg" },
  { id: "unconscious", label: "D616.Condition.Unconscious", icon: "icons/svg/unconscious.svg" }
];

export function registerConditions() {
  CONFIG.statusEffects = [
    ...CONFIG.statusEffects.filter((e) => !e.id?.startsWith("d616-")),
    ...CONDITIONS.map((c) => ({
      id: `d616-${c.id}`,
      name: c.label,
      img: c.icon
    }))
  ];
}

/**
 * Threshold-driven conditions (book p.33-34), kept in sync with the
 * actor's current Health/Focus after every update:
 *   Unconscious — Health < 1 (but not so low they're Killed)
 *   Demoralized — Focus <= 0 (but not so low they're Shattered)
 *   Shattered   — Focus <= -max Focus
 * "Killed" (Health <= -max Health) isn't one of the book's toggleable
 * Conditions — per the book it means the character is "removed from play
 * permanently," which isn't something a status icon should represent. This
 * just posts a chat notice so the table doesn't miss the moment; removing
 * the character from play (or not — see the book's own notes on this being
 * "permanent") is left to the GM.
 */
export async function syncAutomaticConditions(actor) {
  if (!actor || actor.type !== "character") return;
  const sys = actor.system;
  const killed = sys.health.value <= -sys.health.max;
  const unconscious = !killed && sys.health.value < 1;
  const shattered = sys.focus.value <= -sys.focus.max;
  const demoralized = !shattered && sys.focus.value <= 0;

  const wants = {
    "d616-unconscious": unconscious,
    "d616-demoralized": demoralized,
    "d616-shattered": shattered
  };

  for (const [statusId, active] of Object.entries(wants)) {
    const has = actor.statuses?.has(statusId);
    if (active && !has) await actor.toggleStatusEffect(statusId, { active: true });
    else if (!active && has) await actor.toggleStatusEffect(statusId, { active: false });
  }

  if (killed && !actor.getFlag("d616", "killedNotified")) {
    await actor.setFlag("d616", "killedNotified", true);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p class="d616-edge-trouble-note"><strong>${actor.name}</strong> ${game.i18n.localize("D616.Condition.KilledNotice")}</p>`
    });
  } else if (!killed && actor.getFlag("d616", "killedNotified")) {
    await actor.unsetFlag("d616", "killedNotified");
  }
}

/**
 * Ablaze and Bleeding (book p.37) both deal a flat 5 Health at the end of
 * each of the affected character's turns, independently of each other,
 * until the condition ends or the character dies. Called from the
 * `updateCombat` hook in d616.mjs for whichever combatant's turn just
 * ended — there's no other "a turn just ended" moment to hang this off of
 * in Foundry, so nothing happens for these conditions outside of combat.
 */
export async function applyEndOfTurnConditionDamage(actor) {
  if (!actor || actor.type !== "character") return;
  const labels = [];
  if (actor.statuses?.has("d616-ablaze")) labels.push(game.i18n.localize("D616.Condition.Ablaze"));
  if (actor.statuses?.has("d616-bleeding")) labels.push(game.i18n.localize("D616.Condition.Bleeding"));
  if (!labels.length) return;

  const amount = 5 * labels.length;
  await actor.update({ "system.health.value": actor.system.health.value - amount });
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.Condition.EndOfTurnDamage", {
      name: actor.name, amount, conditions: labels.join(" & ")
    })}</p>`
  });
}
