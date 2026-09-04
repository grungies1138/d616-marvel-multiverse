import { applyEdgeTroubleToMessage } from "./dice/marvel-roll.mjs";
import { registerSheetThemeSetting } from "./helpers/theme.mjs";
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

Hooks.once("ready", () => {
  console.log("d616 | Ready.");

  // --- "Add Edge" / "Add Trouble" buttons on posted roll cards ---
  // Bound once as a single delegated listener on the document, rather than
  // per-message via a chat-render hook, so this works the same whether the
  // running Foundry version fires "renderChatMessageHTML" (current) or the
  // older jQuery-based "renderChatMessage" — the click still bubbles up to
  // the document either way, and we just need to find which message it
  // came from.
  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-action="d616ApplyEdge"], [data-action="d616ApplyTrouble"]');
    if (!button) return;
    event.preventDefault();

    const mode = button.dataset.action === "d616ApplyEdge" ? "edge" : "trouble";
    const messageEl = button.closest("[data-message-id]");
    const message = messageEl ? game.messages.get(messageEl.dataset.messageId) : null;
    if (!message) return;

    applyEdgeTroubleToMessage(message, mode);
  });
});
