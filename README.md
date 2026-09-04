# D616 Marvel Multiverse Role-Playing (Foundry VTT system)

An unofficial, general-purpose Foundry VTT (v13/v14) system implementing a six-ability
("MARVEL": Melee, Agility, Resilience, Vigilance, Ego, Logic) superhero ruleset with
Rank-scaled Health/Focus/Karma, data-driven Power and Trait items, and an automated
2d6 + Marvel Die roll engine. It is **not affiliated with or endorsed by Marvel** or any
publisher — built for homebrew/original characters and personal home-game use.

## What's automated

- **Ability checks**: click the dice icon next to any ability to roll 2d6 + Marvel Die +
  that ability. Powers/Gear rolls prompt for Edge/Trouble before rolling; every roll's
  chat card also carries **Add Edge**/**Add Trouble** buttons so it can be applied
  after the fact instead (see below).
- **Powers**: each Power item can define an attack roll (ability vs. a Defense or flat
  target number), whether it deals damage, and a Focus cost (flat, or scaling — spend
  extra Focus for +1 Damage Modifier per N Focus, matching the book's "5 or more Focus"
  style powers).
- **Damage**: computed automatically as `(Marvel Die value × Damage Multiplier) +
  Damage Modifier`, doubled on a Fantastic result. Damage Multiplier starts at Rank;
  Damage Modifier starts at the relevant ability score. Passive Powers (checkbox on the
  Power sheet) can raise either automatically — no manual math needed once they're on
  the character.
- **Fantastic / Green**: the Marvel Die is tracked specially. Rolling its marked face
  counts as a 6 and flags **Fantastic** (bonus effect); rolling a plain 6 flags
  **Green** (a GM-introduced complication even on a hit). Both show clearly on the
  chat card.
- **Focus spending**: Power costs (including scaling costs) are deducted from the
  actor's Focus automatically, with a warning if there isn't enough.
- **Initiative**: click the dice icon next to Speed/Initiative on the header to roll it with this
  system's own 2d6 + Marvel Die engine (Fantastic/Green and all) rather than a flat number — it
  posts the usual chat card and, if the actor has a Combatant in the active Combat, pushes the
  result straight into the tracker so turn order updates immediately. Rolling directly from
  Foundry's own Combat Tracker button also now actually rolls dice (`2d6 + 1d6 + @initiative`,
  set via `system.json`) instead of just restating the flat modifier as if it were the whole roll.
- **Gear**: a second item type alongside Powers, for mundane/tech equipment —
  weapons, armor, gadgets, vehicles. It reuses the exact same Cost/Attack/Passive
  schema as Powers, so a weapon's attack roll and a piece of armor's passive bonus
  are automated exactly the same way a Power's are (see the Compendium packs
  section below for the ready-made Common Weapons).
- **Non-stacking bonuses**: per the book, bonuses to a Damage Multiplier — whether
  from a passive Power or a weapon — do **not** add together; the system
  automatically takes the single largest one. The same is true for Health Damage
  Reduction (from armor or a passive Power like Sturdy). This is handled for you in
  `prepareDerivedData()`/`rollItem()` — you don't need to do this math by hand.
- **Add Edge / Add Trouble from the chat card**: every roll that actually rolls dice
  (ability checks, Initiative, and any Power/Gear attack) posts its chat card with
  **Add Edge** and **Add Trouble** buttons at the bottom, so the roll doesn't have to
  be pre-committed to Edge or Trouble before you see it — decide once the result is on
  the table. Clicking one rolls one extra d6, applies it the same way choosing
  Edge/Trouble up front would (it replaces whichever of the two ordinary d6 it can
  improve or worsen; the Marvel Die itself, and therefore Fantastic/Green, never
  changes), updates that same chat card in place with the new total, and posts a
  short follow-up note showing the extra die. Only the roll's own player or the GM can
  click these, and it's a one-time thing per roll — once Edge or Trouble has been
  added, the buttons are replaced with an "Edge Applied"/"Trouble Applied" tag. A
  Power or Gear roll that already had Edge/Trouble chosen from its own pre-roll
  prompt shows that same tag immediately instead of the buttons, since it's already
  been applied.

## Mechanics added in 1.4.0

A full pass against `mechanics_gap_analysis.md` (itself written from a page-by-page
read of the Core Rule Book, not memory). Grouped by how confident the automation is:

**Bug fixes / previously-missing core rules**
- **Damage Reduction is now actually applied.** Targeting a token before using a
  Power/Gear attack pulls that target's Defense, its Health Damage Reduction (reducing
  the damage *multiplier*, going to 0 damage if that drops below 1, per p.36 — not a
  flat subtraction), and its Size's Attack Modifier automatically, and applies the
  resulting damage to the target's Health or Focus for you.
- **Ultimate Fantastic (6-M-6)** is now a real auto-success that also cancels Trouble,
  per p.15.
- **`isHeroic`** now actually gates Karma: only Heroic characters have a standing Karma
  pool (`karma.max = Rank`); it's a checkbox on the header. Non-Heroic characters can
  still be awarded Karma by the GM, they just don't keep a resting pool of it.
- **Health/Focus can go properly negative** (down to `-max`) instead of floor-clamping
  at 0, so Unconscious/Killed/Demoralized/Shattered thresholds (p.33-34) are reachable
  at all.

**New subsystems**
- **Karma spending** (p.19, p.36): buttons on the header let you spend 1 Karma for a
  free Recovery roll (Resilience for Health, Vigilance for Focus, TN 10, heals Marvel
  Die × Rank, doubled on Fantastic); every attack roll's chat card also gets a
  "Spend Karma: Edge" button for the roller and a "Spend Karma: Trouble" button for
  its recorded target, on top of the existing free Add-Edge/Add-Trouble buttons.
  Resting resets Karma to its standard value and applies natural Health/Focus recovery
  (Rank/hour, doubled asleep).
- **Conditions** (p.37-38): all 13 book conditions are registered as real status
  effects (token HUD icons). Unconscious/Demoralized/Shattered are kept in sync
  automatically off Health/Focus after every actor update; Killed posts a one-time chat
  notice instead of a status icon, since the book treats it as removal from play, not a
  toggleable condition. The other 9 (Ablaze, Bleeding, Blinded, Deafened, Grabbed,
  Paralyzed, Pinned, Prone, Stunned, Surprised) are now available to toggle by hand from
  the token HUD, same as any status — this doesn't yet auto-apply each one's specific
  numeric effect (e.g. Trouble on Melee while Prone).
- **Movement modes** (p.31-32): Run/Climb/Jump/Swim compute automatically (the latter
  three default to half Run Speed); Glide/Swingline/Fly/Teleport show once a power sets
  them (they're 0 — "doesn't have this" — otherwise).
- **Size** (p.40): an 11-step field from Microscopic to Gargantuan on the header, now
  actually applied as both an attack-modifier when targeted and a Run Speed
  modifier (±1 for Big/Small).
- **Standard Actions beyond Attack/Use a Power** (p.29-31): Dodge (Trouble on incoming
  attacks until your next turn), Help (one-shot Edge for an ally's next action), Grab/
  Escape (a Melee check vs. the other character's Melee Defense; a Fantastic Grab also
  Pins). All read your current Foundry target(s).
- **Team Maneuvers** (p.38-39): a "Team Maneuver" button (and a ready-made world macro)
  opens a dialog that gathers your targeted teammates, computes the group's Level cap
  and per-member Focus cost off their average Rank, and resolves Offensive (Edge, or an
  auto-Fantastic at Level 3 against equal/lower-Rank targets)/Defensive (flat DR)/Rally
  (Trouble on attacks against the team at L1, a free recovery roll for everyone at L2,
  reviving one downed member at L3). A member short on Focus can cover their share with
  1 Karma instead, per the book.
- **Tags** (p.21, p.63+): a free-text field on the Biography tab for narrative-only
  labels (Rich, Secret Identity, Backup...) — distinct from Traits, which carry
  mechanics.

**Small tools**
- **Falling damage** (p.32-33): a calculator (spaces fallen, optional controlled
  landing) computing the multiplier — 1 per 3 spaces, capped ×20, reduced by Jump Speed
  if the landing was controlled — and rolling the resulting damage.
- **Standing Edge indicator**: a small "E" badge next to Initiative when a passive
  Power/Gear grants a standing Edge there (e.g. Spider-Sense), matching the book's own
  notation (p.20).

**Deliberately still deferred** (per `mechanics_gap_analysis.md`'s own reasoning — all
depend on grid/distance tracking this sheet doesn't do): grenade scatter/blast-area
templates, Plowing Through Things damage thresholds, Knockback distance, and Objects &
Sizes carry/throw rules for improvised weapons. A per-weapon special-rules engine
(Rifle/SMG close-range Trouble, etc.) was also left out as too weapon-specific to
generalize — add those by hand on the Gear item's Effect text as needed. A rigorous
Target-Number-by-Rank/Adjective calculator was considered but not included in this pass,
since it needs the book's own table transcribed carefully rather than approximated.

## What's intentionally manual

- **Traits** are reference cards, not automated bonuses — the book's traits are too
  varied (Edge on a specific kind of check, a scene-long condition, a Karma-award
  hook) to encode generically. Click a Trait to post its effect to chat as a reminder.
- **Edge/Trouble** is implemented as "reroll one of the two ordinary d6, keep the
  better/worse total" — a reasonable table-friendly reading, not a verbatim rules
  citation. Adjust `module/dice/marvel-roll.mjs` if your table plays it differently.
- **Biography/effect text fields** are plain textareas rather than the rich-text
  (ProseMirror) editor, to keep the build reliable without a live Foundry instance to
  test the editor wiring against.

## Installing

1. Unzip this into your Foundry `Data/systems/` folder, so you end up with
   `Data/systems/d616/system.json`.
2. Restart Foundry (or refresh if using a hosted instance) and it should appear as an
   installable system named "D616 Marvel Multiverse Role-Playing" when creating a
   new World.
3. Create a World using this system, then create an Actor of type "Character".

## Building your Wickfield Eight (or anyone else) in this system

For each character:

1. Create a Character actor, set Rank and the six Abilities on the Main tab.
   Health/Focus/Karma/Defenses/Speed/Initiative fill in automatically.
2. Go to the Powers tab → **Add Power** for each power. On the Power sheet, fill in
   Power Set/Prerequisites/Action/Duration/Range as flavor text, then set the
   mechanical fields: Focus cost, whether it makes an attack (and against which
   Defense), whether it deals damage, and its Fantastic effect text. For a passive
   power (like Mighty 1 or Sturdy 1), check "Always-on passive bonus" instead and set
   the multiplier/modifier bonus it grants.
3. Go to the Traits tab → **Add Trait** for each trait, and just describe it — these
   aren't automated, they're reminders for you and your players.

## Compendium packs

The system ships two reference Item compendiums, built directly from the printed
**Marvel Multiverse RPG Core Rule Book** (Marvel Entertainment / Hasbro):

- **Powers (Reference)** — all 307 individual Powers from the book's Power
  Descriptions chapter, across its ~20 Power Sets.
- **Gear (Reference)** — the book's full Common Weapons table (Pistol, Bow, Rifle,
  Sniper Rifle, Shotgun, Submachine Gun, Frag Grenade, Flash-Bang Grenade, Club,
  Knife, Knife/Thrown, Sword), as ready-to-use Gear items.

**How the content was sourced, and why it's written the way it is.** Game rules,
mechanics, names, numbers, and other functional facts (a Power's name and Power
Set, its Action type/Duration/Range/Focus cost, whether and how it attacks, its
damage-multiplier or Health Damage Reduction bonus, a weapon's range and damage
bonus) are not protected by copyright — they're the game's factual rules, and
every entry in these packs reproduces those facts exactly as printed. The book's
own descriptive sentences, however — its prose — **are** the publisher's
copyrighted expression, and reproducing them at compendium scale isn't something
I'm able to do, attribution or no. So every `effect` field in both packs is
**original wording**, independently written from the same underlying rules facts
rather than copied or lightly reworded from the book's text. If a line of these
packs and a line of the book read alike, it's very likely because there's only one
clear way to state a specific mechanical fact (e.g. "makes a Melee attack against
the target's Resilience Defense" is standard rules terminology, not creative
prose) — never because text was copied.

A few individual powers had no numeric Focus cost or fully explicit attack/defense
pairing in the source text (e.g. a handful of "Varies" costs, or powers whose
description implies rather than states an ability); those were filled in with the
most reasonable, rules-consistent interpretation rather than left blank or
invented wholesale — treat those as a sensible default you're free to override on
the item sheet, not as a book citation. You'll also want to add your own `img` for
these — they ship with generic placeholder icons.

These packs are for your own reference and play at the table — they are not a
substitute for owning the book, which is where all the flavor text, examples, and
setting material actually live.

### The Wickfield Eight (pregens)

Two more packs ship the eight original pregenerated characters from
`wickfield_pregens.md` (see that file for the printable/readable version, including
the one-shot hook and table-running notes) as ready-to-drop-in Foundry documents:

- **Wickfield Eight (Pregens)** (`characters`, Actor pack) — Bulwark, Ricochet,
  Wisp, Nightglass, Circuit, Amberlight, Permafrost, and The Latch, Rank 2, with
  Ability scores set and Health/Focus/Karma/Defenses/Speed/Initiative all deriving
  correctly from them. Each one's Biography tab is filled in with a full original
  History and Personality write-up (not just the one-line hooks from the printable
  sheet), plus Real Name/Occupation/Origin/Team. Each actor's Powers, Gear, and
  Traits tabs come pre-populated with that character's actual items — drag one out
  of the compendium and it's playable immediately, no manual data entry.
- **Wickfield Eight Items (Homebrew)** (`homebrew`, Item pack) — the same 24
  Powers, 6 Gear, and 24 Traits used by the eight pregens, as standalone reference
  items, in case you want to browse, reuse, or hand one to a different character
  without opening a pregen's sheet.

Two of the eight carry actual physical equipment rather than an innate power, and
those are typed as **Gear** (not Power) so they use Gear's own weapon mechanics
(a `category` and a non-stacking `attack.damageMultiplierBonus`, the same fields
the book's Common Weapons use) instead of Power's: Circuit's gauntlet blaster
(Snap Shooting, Suppressive Fire, Stopping Power — his support-drone deployment,
Field Drone, stays a Power since it's the ability to direct the drone, not the
drone itself as a weapon) and The Latch's collapsible batons (Baton Strike, Fast
Strikes, Counterstrike Technique — Accuracy 1 stays a Power, since it's her own
trained conditional Edge, not a property of the batons). Their `damageMultiplierBonus`
ships at 0 (no fabricated bonus) — bump it on the item sheet if you want one of
them running upgraded gear.

The rest of the pregens' powers are intentionally simpler than the Powers
(Reference) pack above: per `wickfield_pregens.md`'s own note, their Focus costs
and damage numbers are **streamlined flat values for pick-up-and-play speed**, not
the book's own `(Marvel Die × Multiplier) + Modifier` formula. To keep that design
intent intact rather than silently overriding it, each attack power's (and Gear
weapon's) to-hit roll is automated (it rolls against the right Defense) but its
damage is deliberately left off auto-calculation (`dealsDamage: false`) with the
exact flat number spelled out in its Effect text for you to apply by hand. A few
powers (Quickness's extra Move Action, Accuracy 1's conditional Edge) grant
something the data model has no numeric field for at all — those are marked
passive/reference-only in the same way Traits are, with the full effect in their
text.

### The one-shot's adversary

A third Actor pack, **Wickfield Eight: Adversaries** (`villains`), gives the pregens something to fight,
built around the same "rolling blackouts closing in on the fundraiser" hook from
`wickfield_pregens.md`:

- **Brownout** (Rosalind "Ross" Kade) — Rank 4 villain. A Kade Electric heir who lost the family's
  building to the city (it's now the Wickfield Community Center) and bonded with something wired into
  its sub-basement that lets her drain bioelectric and kinetic energy from anyone nearby. Her five
  Powers escalate over the course of a fight — Power Surge stacks a growing damage bonus every time she
  drains someone, and her finisher, Full Strength, only unlocks once she's stacked it three times —
  mechanically reproducing the hook's "she'll be at full strength by the night of the fundraiser."
- **Kade's Enforcer** — Rank 1 henchman template (not a single named character — duplicate the actor
  for as many Enforcers as a scene needs), hired muscle armed with a Pistol from the Gear (Reference)
  pack, meant to be a speed bump rather than a real threat to a team of Rank 2 heroes.

Both are built the same way as the Wickfield Eight themselves: full History/Personality on the
Biography tab, and their Powers/Traits/Gear pre-populated as real embedded Items. Brownout's Power
Surge and Full Strength are reference-only entries (like a couple of the heroes' own powers) since a
scene-cumulative stacking counter isn't something a static sheet field can track — run it by hand.

## Visual design

The sheet's look — chamfered "comic panel" containers with notched corners, a
red/dark-red/blue/cream palette (blue reserved for the Focus stat block), the
`[ ×N ] + M` bracket display for per-ability damage math, notched tab navigation,
and Roboto Slab/Condensed typography — is adapted from the community system
[mjording/marvel-multiverse](https://github.com/mjording/marvel-multiverse). Its
CSS technique, layout structure, and color/type choices are ported and
re-implemented here against this system's own markup.

Two categories of asset from that repo were deliberately **not** copied, even
though it was asked for: I checked its actual `LICENSE.txt` rather than going on
the README's summary, and it scopes its MIT grant to "the Software" and separately
attributes exactly one image (`anvil-impact.png`, CC BY 3.0) — nothing else. Its
`/icons` folder includes at least one file whose own embedded metadata names it as
an unattributed Noun Project stock icon, and its `/ui/official` folder includes
Marvel's own trademarked logo and what reads as Marvel-sourced promotional
photography. None of that is covered by the MIT notice regardless of how the
README frames it, so instead:

- **Die-face icons** (`/icons`): original artwork drawn for this system — plain
  pip-face and a five-point-star "Marvel Die" mark, generated as flat SVGs, in the
  same red/cream palette. Used in the chat roll cards and the Damage panel.
- **Roboto / Roboto Slab / Roboto Condensed** (`/fonts`): these ARE the real thing,
  bundled directly — Google's own font release, separately licensed under Apache
  2.0 (see each `fonts/*/LICENSE`), loaded locally via `@font-face` so the system
  works offline rather than depending on a CDN.
- Background photography (the crimson-gradient and hero-collage images that repo
  uses behind its containers) is approximated here with a plain CSS gradient
  instead, so nothing photographic needed sourcing at all.

## Honest caveats

This was built by researching Foundry's documented V13/V14 APIs (DataModel,
ApplicationV2, HandlebarsApplicationMixin, the `documentTypes` manifest field) and
writing to those specs — all JavaScript syntax-checks cleanly and all Handlebars
templates precompile without errors, but **it has not been run inside a live Foundry
instance**, since that's outside what I can do from here. If something doesn't load
when you install it, the most useful first step is opening the browser console (F12)
in Foundry and reading the exact error — bring that back here and I can fix it
directly, usually quickly, since most such issues are one-line API-shape mismatches
rather than logic errors.

## Folder structure

```
d616/
├── system.json
├── README.md
├── wickfield_pregens.md          (printable Wickfield Eight pregen sheets)
├── d616_powers_traits_reference.md (every Power + Trait in the compendiums, one document)
├── wickfield_costumes.md         (costume descriptions: the Eight, Brownout, Kade's Enforcer)
├── lang/en.json
├── module/
│   ├── d616.mjs                (entry point: registers everything)
│   ├── data/                   (DataModel schemas for Actor/Item types)
│   ├── documents/               (Actor/Item document classes — rolling logic lives here)
│   ├── dice/marvel-roll.mjs      (the 2d6+Marvel Die engine + damage formula)
│   └── sheets/                  (ApplicationV2 sheet classes)
├── templates/
│   ├── actor/parts/              (character sheet, split into tabbed parts)
│   ├── item/                     (Power, Trait, and Gear sheets)
│   └── chat/roll-card.hbs        (chat message template for every roll)
├── icons/                        (original die-face SVGs — see "Visual design")
├── fonts/                        (bundled Roboto/Roboto Slab/Roboto Condensed, Apache 2.0)
├── packs/                        (Powers + Gear reference compendiums — see "Compendium packs")
└── styles/d616.css
```
