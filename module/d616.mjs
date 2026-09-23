import { registerSheetThemeSetting } from "./helpers/theme.mjs";
import { registerConditions, syncAutomaticConditions, applyEndOfTurnConditionDamage } from "./helpers/conditions.mjs";
import { openTeamManeuverDialog, rallyRecover } from "./helpers/team-maneuver.mjs";
import { openTNCalculatorDialog } from "./helpers/tn-calculator.mjs";
import { applyDamageFromMessage, undoDamageFromMessage } from "./helpers/damage.mjs";
import { registerGMRelay, isResponsibleClient, applyEdgeTroubleRouted } from "./helpers/gm-relay.mjs";
import CharacterData from "./data/actor-character.mjs";
import PowerData from "./data/item-power.mjs";
import TraitData from "./data/item-trait.mjs";
import GearData from "./data/item-gear.mjs";
import D616Actor from "./documents/actor.mjs";
import D616Item from "./documents/item.mjs";
import D616CharacterSheet from "./sheets/actor-sheet.mjs";
import { D616PowerSheet, D616TraitSheet, D616GearSheet } from "./sheets/item-sheet.mjs";

Hooks.once("init", () => {
  console.log("d616 | Initializing the d616 superhero system");

  // --- Player-selectable Light/Dark sheet theme (client-scoped: everyone picks their own). ---
  registerSheetThemeSetting();

  // --- The book's Conditions vocabulary (p.37-38) as real Foundry status effects. ---
  registerConditions();

  // --- Register a couple of small Handlebars helpers our templates rely on. ---
  // (Registered defensively — if Foundry core already provides equivalents,
  // these simply shadow them with the same behavior.)
  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("ne", (a, b) => a !== b);
  Handlebars.registerHelper("concat", (...args) => args.slice(0, -1).join(""));

  // --- Document classes ---
  CONFIG.Actor.documentClass = D616Actor;
  CONFIG.Item.documentClass = D616Item;

  // --- Data models ---
  CONFIG.Actor.dataModels ??= {};
  CONFIG.Item.dataModels ??= {};
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Item.dataModels.power = PowerData;
  CONFIG.Item.dataModels.trait = TraitData;
  CONFIG.Item.dataModels.gear = GearData;

  // --- Default icons for new documents of each type ---
  CONFIG.Actor.typeIcons = { character: "fa-solid fa-mask" };

  // --- Sheets ---
  // (We deliberately do NOT call unregisterSheet on the core default sheet
  // here — on some Foundry versions the legacy ActorSheet/ItemSheet globals
  // this would reference are no longer present, which would throw during
  // init and break the whole system. Registering ours with makeDefault:true
  // is enough to make it the one that actually opens.)
  const ActorsCollection = foundry.documents?.collections?.Actors ?? Actors;
  const ItemsCollection = foundry.documents?.collections?.Items ?? Items;

  ActorsCollection.registerSheet("d616", D616CharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "D616.Actor.Character"
  });

  ItemsCollection.registerSheet("d616", D616PowerSheet, {
    types: ["power"],
    makeDefault: true,
    label: "D616.Item.Power"
  });
  ItemsCollection.registerSheet("d616", D616TraitSheet, {
    types: ["trait"],
    makeDefault: true,
    label: "D616.Item.Trait"
  });
  ItemsCollection.registerSheet("d616", D616GearSheet, {
    types: ["gear"],
    makeDefault: true,
    label: "D616.Item.Gear"
  });
});

// Health/Focus can change from many places (the sheet's own inputs, a GM
// dragging a value, another module) — not just D616Actor#_applyDamageTo, so
// keep the four automatic Conditions in sync any time an actor updates.
// Hooks fire on every connected client; the condition sync must happen on
// exactly one (otherwise players' clients hit permission errors on
// characters they don't own, and two owners online can race each other).
Hooks.on("updateActor", (actor, changes, options, userId) => {
  if (!isResponsibleClient(userId)) return;
  syncAutomaticConditions(actor);
});

// Ablaze/Bleeding's flat end-of-turn damage (book p.37) and Dodge wearing
// off "until their next turn" (book p.30) both key off the same turn/round
// change: `Combat#previous` (set by core just before this fires) still
// points at the combatant whose turn just ended, whether that's a normal
// turn advance or the last turn of a round rolling over into the next one;
// `combat.combatant` is already the combatant whose turn is starting.
Hooks.on("updateCombat", (combat, changes, options, userId) => {
  if (!("turn" in changes) && !("round" in changes)) return;

  // Game-state changes happen once, on one client (see isResponsibleClient);
  // with no GM connected that's whoever advanced the turn, who can only
  // change characters they own.
  if (isResponsibleClient(userId)) {
    const prevId = combat.previous?.combatantId;
    const prevActor = prevId ? combat.combatants.get(prevId)?.actor : null;
    if (prevActor?.isOwner) applyEndOfTurnConditionDamage(prevActor);

    const currentActor = combat.combatant?.actor;
    if (currentActor?.isOwner) currentActor.clearDodge();
  }

  // A Team Maneuver lasts for the round it was used in, and expires just by
  // the round number moving on — refresh open sheets (on every client, this
  // is display only) so its tag disappears.
  if ("round" in changes) {
    for (const c of combat.combatants) {
      if (c.actor?.getFlag("d616", "teamManeuver") && c.actor.sheet?.rendered) c.actor.sheet.render();
    }
  }
});

Hooks.once("ready", async () => {
  console.log("d616 | Ready.");
  registerGMRelay();

  // --- A ready-made "Team Maneuver" macro so the table doesn't have to dig
  // through a character sheet to find the button (book p.38-39) — targets
  // are still chosen with normal Foundry targeting before using it. Only
  // created once per world, and only for a user who can actually make one.
  if (game.user.isGM && !game.macros.find((m) => m.getFlag("d616", "isTeamManeuverMacro"))) {
    await Macro.create({
      name: game.i18n.localize("D616.TeamManeuver.DialogTitle"),
      type: "script",
      img: "icons/skills/social/diplomacy-handshake-yellow.webp",
      command: `
        const actor = game.user.character ?? canvas.tokens.controlled[0]?.actor;
        if (!actor) { ui.notifications.warn("Select or assign a character first."); return; }
        const { openTeamManeuverDialog } = await import("/systems/d616/module/helpers/team-maneuver.mjs");
        openTeamManeuverDialog(actor);
      `,
      flags: { d616: { isTeamManeuverMacro: true } }
    });
  }

  // --- A "TN Calculator" macro (book p.13-14): Rank + Adjective -> Target
  // Number, posted to chat so the whole table sees it, not just the GM.
  if (game.user.isGM && !game.macros.find((m) => m.getFlag("d616", "isTNCalculatorMacro"))) {
    await Macro.create({
      name: game.i18n.localize("D616.TNCalc.Title"),
      type: "script",
      img: "icons/svg/d20-black.svg",
      command: `
        const { openTNCalculatorDialog } = await import("/systems/d616/module/helpers/tn-calculator.mjs");
        openTNCalculatorDialog();
      `,
      flags: { d616: { isTNCalculatorMacro: true } }
    });
  }

  // --- "Add Edge" / "Add Trouble" buttons on posted roll cards ---
  // Bound once as a single delegated listener on the document, rather than
  // per-message via a chat-render hook, so this works the same whether the
  // running Foundry version fires "renderChatMessageHTML" (current) or the
  // older jQuery-based "renderChatMessage" — the click still bubbles up to
  // the document either way, and we just need to find which message it
  // came from.
  document.addEventListener("click", (event) => {
    const button = event.target.closest(
      '[data-action="d616ApplyEdge"], [data-action="d616ApplyTrouble"], [data-action="d616KarmaEdge"], [data-action="d616KarmaTrouble"], [data-action="d616ApplyDamage"], [data-action="d616UndoDamage"], [data-action="d616RallyRecover"]'
    );
    if (!button) return;
    event.preventDefault();

    const messageEl = button.closest("[data-message-id]");
    const message = messageEl ? game.messages.get(messageEl.dataset.messageId) : null;
    if (!message) return;

    const action = button.dataset.action;
    if (action === "d616ApplyDamage") return applyDamageFromMessage(message);
    if (action === "d616UndoDamage") return undoDamageFromMessage(message);
    if (action === "d616RallyRecover") return rallyRecover(message, button.dataset.actor, button.dataset.pool);
    if (action === "d616ApplyEdge" || action === "d616ApplyTrouble") {
      applyEdgeTroubleRouted(message, action === "d616ApplyEdge" ? "edge" : "trouble");
      return;
    }

    // Karma-fueled versions (book p.19): the roller spends 1 Karma to add
    // Edge to their own roll; the roll's recorded target spends 1 Karma to
    // impose Trouble on the attacker instead.
    if (action === "d616KarmaEdge") {
      const rollerActor = ChatMessage.getSpeakerActor?.(message.speaker) ?? game.actors.get(message.speaker?.actor);
      rollerActor?.spendKarmaForEdgeOnMessage(message);
    } else if (action === "d616KarmaTrouble") {
      const data = message.getFlag("d616", "roll");
      const targetActor = data?.targetActorId ? game.actors.get(data.targetActorId) : null;
      if (!targetActor) {
        ui.notifications.warn(game.i18n.localize("D616.Karma.NoRecordedTarget"));
        return;
      }
      targetActor.imposeKarmaTrouble(message);
    }
  });
});
