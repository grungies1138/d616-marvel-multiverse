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
  sheet), plus Real Name/Occupation/Origin/Team. Each actor's Powers and Traits
  tabs come pre-populated with that character's actual items — drag one out of the
  compendium and it's playable immediately, no manual data entry.
- **Wickfield Eight Items (Homebrew)** (`homebrew`, Item pack) — the same 30 Powers
  and 24 Traits used by the eight pregens, as standalone reference items, in case
  you want to browse, reuse, or hand one to a different character without opening
  a pregen's sheet.

These powers are intentionally simpler than the Powers (Reference) pack above:
per `wickfield_pregens.md`'s own note, their Focus costs and damage numbers are
**streamlined flat values for pick-up-and-play speed**, not the book's own
`(Marvel Die × Multiplier) + Modifier` formula. To keep that design intent intact
rather than silently overriding it, each attack power's to-hit roll is automated
(it rolls against the right Defense) but its damage is deliberately left off
auto-calculation (`dealsDamage: false`) with the exact flat number spelled out in
its Effect text for you to apply by hand. A few powers (Quickness's extra Move
Action, Accuracy 1's conditional Edge) grant something the data model has no
numeric field for at all — those are marked passive/reference-only in the same
way Traits are, with the full effect in their text.

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
