# D616 Mechanics Gap Analysis

A page-by-page pass through the actual *Marvel Multiverse RPG Core Rule Book* (Chapters 2–4, plus the Backstories/Powers chapters), checked directly against what's in this codebase today. Every item below cites the book mechanic, what the code currently does (verified by reading it, not assumed), and a concrete suggestion. Nothing in this document has been implemented yet — it's the research you asked for, so we can decide together what to build and in what order.

Items are grouped by how much value they'd add relative to how contained the work is, not strictly by book chapter.

---

## Tier 1 — Bugs and self-contained gaps (highest value, clearest scope)

### 1. Damage Reduction is tracked but never actually applied to an attack

This is the most important finding. The book's rule (p.36) is: when an attack hits a target with Damage Reduction, **reduce the attack's damage multiplier** by the DR amount before adding the ability score bonus — and if the multiplier drops below 1, the attack does *no* damage at all, not even the flat ability bonus.

The code computes `sys.health.damageReduction` on `prepareDerivedData()` (actor.mjs:44) and displays it in the "DR" corner box on the sheet — but `rollItem()`'s call to `computeDamage()` only ever passes `{ marvelValue, multiplier, modifier, isFantastic }` for the *attacker*. Nothing looks up the *target's* DR and folds it into the multiplier. In other words: Sturdy, armor, and every other DR source currently do nothing in an actual attack roll — a GM has to catch this and subtract it by hand every single time, which directly contradicts the README's own claim that this "is handled for you in `rollItem()` — you don't need to do this math by hand."

**Suggestion:** Add a target-selection step to attack rolls (Foundry's `game.user.targets` is the natural fit — the attacker picks a target token before rolling), look up that target actor's `system.health.damageReduction`, subtract it from the multiplier before computing damage, and zero out the whole result (including the ability-score add) if the multiplier drops below 1.

### 2. Edge/Trouble deviates from the book in a way that changes outcomes

The book's actual rule (p.15–16): Edge lets you reroll **any single one of the three dice** — including the Marvel die itself — and keep the better result. Trouble forces you to reroll **whichever die is currently best** (and "an M is always considered the best die," so Trouble on a Fantastic roll forces a reroll of the Marvel die specifically) and keep the worse result.

The README already flags that this system's Edge/Trouble is a deliberate simplification ("reroll one of the two ordinary d6... the Marvel Die itself, and therefore Fantastic/Green, never changes") — so this isn't a surprise, but it's worth being explicit about what that simplification actually costs: in the real rules, Edge can *create* a Fantastic result (by rerolling toward the Marvel face) and Trouble can *destroy* one (by forcing a reroll off the Marvel face). The current implementation can never do either.

Two more real-rule pieces aren't modeled at all:
- **Stacking**: multiple Edges (double/triple Edge) let you reroll repeatedly, choosing dice as you go; multiple Troubles work the same way; Edge and Trouble from different sources cancel out 1-for-1 rather than being an exclusive none/edge/trouble choice.
- **Ultimate Fantastic (6 M 6)**: an automatic, unconditional success that also cancels out *any* Trouble on the roll — regardless of target number.

**Suggestion:** At minimum, add the Ultimate Fantastic auto-success check (it's a small, self-contained rule). Whether to rebuild Edge/Trouble to allow rerolling the Marvel die and to support stacking is a bigger call — worth deciding deliberately rather than by default, since it'd change the feel of a lot of rolls.

### 3. `isHeroic` exists on the data model but is wired to nothing

`actor-character.mjs` already has `isHeroic: new BooleanField({ initial: true })` — but it's never read anywhere else in the codebase, and it's not exposed on the character sheet UI at all. Per the book, the Heroic tag is what actually gates two real mechanics:
- **Karma**: only Heroic characters start with Karma equal to their Rank (p.19). Non-Heroic characters (villains, antiheroes) can still earn it during play, but it evaporates if unspent by the next sleep.
- **Holding Back** (p.35): unless the player says otherwise, a Heroic character's attack that *would* kill or shatter a target instead leaves them at 1 point away from it.

**Suggestion:** Surface `isHeroic` as a checkbox on the sheet header, and once Karma spending exists (Tier 2, below), gate the "start with Karma" behavior on it.

### 4. Passive bonuses have no field for Ability Defense

Powers frequently grant a flat bonus to a specific Ability Defense — the book's own example is Spider-Sense giving Spider-Man permanent +2 Agility Defense (p.19). The current passive schema (shared by Power and Gear) only has `damageMultiplierBonus`, `damageModifierBonus`, `nonAttackCheckBonus`, and `healthDamageReductionBonus` — there's no `defenseBonus` field, so a power like Spider-Sense literally cannot be represented mechanically right now; it can only be a reference-only text entry.

**Suggestion:** Add a `defenseBonus` (ability + amount) field to the passive schema, and fold it into the existing defense calculation in `prepareDerivedData()`.

### 5. No way to represent a standing/passive Edge on a specific roll type

Related to #4 — Spider-Sense's other half is "Edge on Initiative & Vigilance checks," and the Initiative Modifier section (p.20) explicitly calls out an "E" notation on the character sheet for exactly this. Nothing in the data model can grant a standing Edge tied to a roll type; Edge is currently only ever a per-roll, prompted-or-chat-button choice.

**Suggestion:** A `standingEdge` (or `standingTrouble`) list on passive bonuses — tagged by roll type (initiative, a specific ability, attacks generally) — that the relevant roll methods check for and auto-apply, with the "E" shown next to Initiative on the sheet when present.

---

## Tier 2 — Real subsystems worth building

### 6. Karma spending isn't implemented at all — Karma is a display-only number

This is the single biggest missing subsystem, and it's the one I flagged in general terms before actually reading the book. Now that I've read the exact rules (p.19, p.36), here's precisely what's missing:

- **Spend 1 Karma after a roll to gain an Edge** on that check (reroll one die).
- **Spend 1 Karma when targeted** by an attack to impose Trouble on the attacker's roll.
- **Max 1 Karma per action check** either way.
- **Karma-fueled recovery**: spend 1 Karma, make a Resilience check (for Health) or Vigilance check (for Focus) vs. TN 10; on success, get back `(Marvel die × Rank)` points, doubled on a Fantastic; you cannot spend a second Karma to add Edge to this specific roll. In combat this costs an action; a demoralized or unconscious character can still take it.
- **A teammate can spend their own Karma** to grant someone else a recovery check (within reach for Health, within earshot for Focus), or, per the Team Maneuvers rules, the whole team can do this at once (see #9).
- **Karma resets to Rank after a full night's sleep**; anything earned above the starting amount is lost if unspent.
- **Earning Karma** is a GM judgment call (good roleplay, a rescue, a catchphrase, a challenging trait coming into play) — this side should probably stay manual, but a simple "+1 Karma" button for the GM to click would remove all the friction of doing it by hand.

**Suggestion:** This is worth its own focused pass. A minimal version: a "Spend Karma for Edge" button next to the existing Add Edge/Add Trouble buttons on a roll's chat card (only enabled if the roller has Karma left and hasn't already used it this roll), plus a dedicated "Recover with Karma" action on the sheet that runs the Resilience/Vigilance-vs-10 check and applies the healing automatically. The GM Karma-award button and the teammate-assist version can follow once the core spend/recover loop works.

### 7. No Conditions/status-effect framework

The book has a full vocabulary of named conditions with specific mechanical consequences (p.37–38): Ablaze, Bleeding, Blinded, Deafened, Demoralized, Grabbed, Paralyzed, Pinned, Prone, Shattered, Stunned, Surprised, Unconscious. Each has a precise effect — e.g. Blinded halves speed and gives enemies an Edge on anything sight-dependent against you; Prone gives Trouble on your Melee attacks and gives Melee attackers against you an Edge; Unconscious drops your defenses to 10 and makes close attacks auto-hit.

None of this exists in the system today — Health and Focus are just numbers with no threshold-triggered effects, and there's no use of Foundry's built-in Active Effect/status-icon framework at all yet.

**Suggestion:** This is a bigger feature, but a well-scoped one — Foundry's ActiveEffect system is built exactly for this. Start with the automatic ones tied to Health/Focus thresholds that are already tracked (Unconscious at Health < 1, Demoralized at Focus = 0, Killed/Shattered at the negative-max thresholds), since those need zero new UI, just a check in the existing damage-application code. The manually-toggled conditions (Prone, Grabbed, Blinded, etc.) can follow as a second pass using Foundry's status effect icons.

### 8. Movement is one flat number; the book has six distinct modes

Currently the data model has a single `speed` (Run) plus a flat `speedBonus`. The book (p.20, p.31–32) defines Run, Climb, Jump, and Swim (each character has all four automatically — Climb/Jump/Swim default to half Run Speed), plus Glide and Swingline as power-granted modes with their own explicit values and their own rules (Glide loses half its speed in altitude each turn; Swingline requires staying within reach of an anchor point or you fall at end of turn; combining modes in one move uses the slowest mode's speed for the whole move).

**Suggestion:** Expand the speed schema to `{ run, climb, jump, swim, glide, swingline, fly, teleport }` with climb/jump/swim auto-deriving from run unless a power overrides them, and glide/swingline/fly only appearing when a power grants them. Lower priority than Karma or Conditions since it mostly matters once there's grid/token movement in play, which this system doesn't automate yet either.

### 9. Team Maneuvers — a whole subsystem with zero representation

Offensive/Defensive/Rally maneuvers, three power levels each, unlocked by the team's average Rank, costing Focus per member (or a Karma point in place of Focus), usable once per battle, switchable once per day (p.38–39). This is a genuinely fun, table-visible mechanic for group play that's completely absent right now — there's no "Team" concept on the Actor at all.

**Suggestion:** This is a standalone feature: a lightweight Team concept (which actors are on it), a maneuver-type/level picker, and a "activate" action that charges Focus/Karma per member and applies the chosen effect (Edge on attacks, reroll-all-dice, auto-Fantastic, flat Damage Reduction, Trouble on incoming attacks, or a free recovery/revival) for the round. Bigger lift than the others in this tier — worth its own scoping conversation.

### 10. Character sheet has no `Size` field, despite it being a real stat

The book (p.20) has Size as a named character attribute (Microscopic through Gargantuan) that affects Run Speed (+1 for Big, –1 for Small), how easy a character is to hit and how much damage/reach/carrying capacity they have (the Objects & Sizes table, p.40). There's no `size` field anywhere in `actor-character.mjs` today.

**Suggestion:** Add a `size` field (defaulting to Average) with the Objects & Sizes table's attack-modifier/damage-multiplier columns wired into the relevant rolls when a character isn't Average size.

### 11. Standard Action maneuvers beyond "attack" and "use a power" have no buttons

The book's Standard Action menu (p.29–31) is Attack, Dodge, Escape, Grab, Help, Move, or Use a Power — and Dodge/Escape/Grab/Help all have precise, short mechanical resolutions (Escape/Grab: Melee check vs. the other character's Melee defense, Fantastic-Grab pins; Dodge: Trouble on incoming attacks until your next turn; Help: target gets an Edge on their next action). Right now the sheet only exposes ability checks and power/gear rolls — there's no one-click way to do any of these.

**Suggestion:** These map cleanly onto the existing `rollAbilityCheck` machinery — each is just a Melee check against a chosen target's defense, or a flag applied for a duration. Worth adding as sheet actions once there's a target-selection step in place (which Tier 1 #1's Damage Reduction fix would also need).

### 12. Tags aren't modeled as their own thing

The book draws a hard line between **Traits** (mechanical effect) and **Tags** (narrative-only labels like Heroic, Secret Identity, Rich, Backup, Obligation — p.21, p.63+). Right now everything is folded into Trait items with a `mechanicalEffect` field; there's no lightweight way to just list "this character has these narrative labels" the way the book's own character sheet does.

**Suggestion:** Low mechanical urgency since tags by design don't drive automation (except Heroic, covered in #3) — but a simple comma-tag list field on the Biography tab would make character sheets match the book's own format and give players an easy narrative-flavor field to fill in without needing full Trait items for things like "Secret Identity" or "Rich."

---

## Tier 3 — Reference tools and lower-priority additions

- **TN-by-Rank / Adjective modifier table** (p.13–14): a small GM-facing calculator ("Rank 3, Difficult" → TN 15) would remove a lookup step when setting DCs for non-Defense checks. Self-contained, easy to add, but a convenience rather than something the game breaks without.
- **Falling damage** (p.32–33): damage multiplier = 1 per 3 spaces fallen (capped at ×20), reduced by Jump Speed on a controlled landing. Only matters once there's grid/distance tracking, which this sheet doesn't do yet.
- **Weapon special rules** (p.36): Rifle/Submachine Gun trouble at close range, Shotgun/Submachine Gun multi-target templates, Frag/Flash-Bang Grenade scatter-and-area rules. The Gear items currently only carry a flat damage-multiplier bonus — none of the book's per-weapon special behavior is encoded, and probably shouldn't be generically (it's pretty weapon-specific logic) — call these out case-by-case if you add these specific weapons.
- **Natural healing over time** (p.36): Rank per hour resting, double that per hour asleep, restoring both Health and Focus. No time-tracking exists in the sheet to hang this off of yet.
- **Power-pick budget display** (p.67): Rank × 4 powers, plus a thematic bonus for using fewer Power Sets than your Rank. A simple "Powers: 12/16 used" counter on the Powers tab would be a nice validation aid at character-creation time, though it's not something that needs live enforcement.
- **Plowing Through Things** damage thresholds (p.41) and **Knockback** distance math (p.35–36): flavorful combat-position mechanics that depend on the grid/token system this VTT sheet doesn't automate today.
- **Objects & Sizes** improvised-weapon rules (p.39–40): carrying/throwing/multi-target rules for picked-up objects — same dependency on size + grid as above.

---

## What this doesn't cover

Chapters 9 (The Marvel Multiverse) and most of Chapter 10 (Narrator) are setting material and GM judgment-call advice — running adventures, balancing encounters, handling illusions/mind control/omniversal travel narratively, designing new powers, adjusting Ranks. None of that is the kind of thing a character sheet automates, and I don't think any of it belongs on this list.
