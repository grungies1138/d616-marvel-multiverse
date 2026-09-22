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
  posts the usual chat card and pushes the result straight into the active Combat's tracker so
  turn order updates immediately. If the actor isn't already a Combatant in the encounter, it's
  added automatically (using its current token if one is placed on the scene); if there's no
  active Combat at all, an error is shown instead of silently doing nothing. Rolling directly from
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
  the table. Clicking one rolls one extra d6 and applies it to whichever of the three
  dice it can improve (Edge) or worsen (Trouble) most — including the Marvel Die
  itself, per the book: Edge can turn a plain roll into a Fantastic one, and Trouble
  can force a Fantastic result to be rerolled away — updates that same chat card in
  place with the new total, and posts a short follow-up note showing the extra die.
  Only the roll's own player or the GM can click these, and it's a one-time thing per
  roll — once Edge or Trouble has been added, the buttons are replaced with an "Edge
  Applied"/"Trouble Applied" tag. A Power or Gear roll that already had Edge/Trouble
  chosen from its own pre-roll prompt shows that same tag immediately instead of the
  buttons, since it's already been applied. Multiple Edge/Trouble sources on the same
  roll (a standing Edge, Conditions, Team Maneuvers, an explicit choice, a target's
  Dodge...) net out 1-for-1 per the book rather than one simply overriding another.
- **Conditions**: the book's full Conditions vocabulary registers as real token-HUD
  status icons, and most now carry their actual mechanical teeth instead of being pure
  reminders — Prone/Blinded/Grabbed/Pinned/Stunned adjust Edge/Trouble on attacks in
  and out; Unconscious and Paralyzed force close attacks to auto-hit and cap the
  relevant Defense at 10; Stunned/Unconscious/Shattered block the affected character
  from acting at all (Paralyzed blocks just Melee/Agility-based actions); Ablaze and
  Bleeding deal 5 Health at the end of the affected character's turn automatically.
  What's still left to the table: Deafened's hearing-specific checks, Surprised's
  bonus-round timing, and Grabbed/Pinned's full "might hit either entangled character"
  redirect (approximated here as flat Trouble on attacks against either one).
- **Hover tooltips**: every row in the Powers, Gear, and Traits tabs shows its
  mechanical summary (action, duration, cost, Edge/Trouble trigger) and its full
  Effect text on hover, without needing to open the item's own sheet.

## 1.6.2 — Dodge auto-clears

Dodge now wears off automatically at the start of the dodging character's own next turn (book p.30's "until their next turn"), instead of relying on someone remembering to click the sheet's manual "Clear Dodge" button. Uses the same end-of-turn combat hook that already drives Ablaze/Bleeding's automatic damage.

## 1.6.1 — Conditions Reference journal

Adds a new "Conditions Reference — Core Rulebook" entry to the Journals compendium: a Conditions Summary page with the book-accurate mechanical facts for all 13 Conditions, plus a "What d616 Automates For You" page mapping each one to exactly what the system now handles automatically (as of 1.6.0) versus what's still a table judgment call. Also fixes a paragraph on the How to Play journal's Health, Focus & Conditions page that had gone stale after 1.6.0 landed — it still said Conditions were "reminders, not automation," which stopped being true for most of them.

## 1.6.0 — Conditions get mechanical teeth, book-accurate Edge/Trouble, and two GM conveniences

The biggest mechanics pass since the system started, driven by an actual page-by-page
read of the Core Rule Book rather than an approximation. Edge/Trouble was rebuilt to
match the book exactly: a reroll can now land on the Marvel Die itself (so Edge can
create a Fantastic result and Trouble can destroy one), and multiple Edge/Trouble
sources on the same roll cancel out 1-for-1 instead of one silently overriding
another. Most of the book's Conditions (Prone, Blinded, Grabbed, Pinned, Stunned,
Unconscious, Paralyzed, Demoralized, Ablaze, Bleeding) now carry their real mechanical
effect once toggled on a token — adjusting Edge/Trouble on attacks, forcing auto-hits
and Defense caps, blocking incapacitated characters from acting, and dealing
automatic end-of-turn damage — instead of being pure visual reminders. Also added: a
TN-by-Rank/Adjective calculator (Narrator-facing macro) and a live power-pick budget
counter ("used/max", Rank x 4) on the Powers tab. Deafened's hearing-specific checks,
Surprised's bonus-round timing, and Grabbed/Pinned's full multi-target redirect rule
are still left to the table — see the README's "What's automated" section for exactly
where the line is drawn.

## 1.5.19 — Auto-join combat on Initiative roll

Rolling Initiative from the character sheet now joins the active Combat automatically instead of silently doing nothing when the actor wasn't already tracked: if the actor doesn't have a Combatant yet, one is created (using its placed token on the scene when there is one) and its initiative is set to the roll's total, the same as if it had been added by hand first. If there's no active Combat encounter at all, rolling Initiative now shows an error telling you to start one in the Combat Tracker, rather than rolling and posting a chat card that has nowhere to go.

## 1.5.18 hotfix

Fixed a manifest error Foundry reports on load: `The "D616 Marvel Multiverse Role-Playing" system's manifest contained the following unknown keys: "gridDistance", "gridUnits"`. Foundry V13+ replaced those top-level fields with a nested `grid: {distance, units}` object; `system.json` already had that nested object but still carried the old flat keys alongside it. Removed the deprecated duplicates — same values, no behavior change.

## 1.5.17 — More visible theme toggle

- **The Light/Dark theme toggle is now a solid red circular badge with a
  white sun/moon icon**, instead of a plain 22px icon with no background
  sitting flush in the sheet's top-right corner. It was easy to miss against
  the header — same red as several other icon buttons on the sheet, no
  container to read as a button, blended into the background regardless of
  which theme was active. Also added a hover state (darkens, scales up
  slightly) and a distinct look for the dark theme itself (a darker red-brown
  fill so the badge doesn't disappear against the dark header).

## 1.5.16 — Marvel D616 folder, Journals rename, and a private Heroes & Villains pack

> ⚠️ **`heroes-villains` is for personal/private use only — do not publish it.**
> See "Heroes & Villains (PRIVATE — do not distribute)" below before cutting a
> public release of this system.

- **New "Marvel D616" sidebar folder**, mirroring the existing Wickfield Eight
  folder: it groups the `marvel-d616` pack and the new `heroes-villains` pack
  together, so the system-wide material sits in its own labeled group instead
  of loose at the top level of the Compendium sidebar.
- **`marvel-d616` relabeled to Journals** (previously "Marvel D616" — the pack
  name/id is unchanged, only the sidebar label, now that the folder itself
  carries the "Marvel D616" name). Same 4 JournalEntries, same contents.
- **New Actor pack, Heroes & Villains (`heroes-villains`)** — all 128 named
  characters from the core rulebook's Character Profiles chapter (Abomination
  through Wong), each with Rank/Abilities/Health/Focus/Karma/Movement set from
  the book, full Biography (Real Name, Occupation, Origin, Team, History,
  Personality), and every Trait and Power from their profile page as real
  embedded Items — Powers cross-referenced against the book's own Power
  Descriptions glossary for their Effect text wherever a match exists, and
  left as reference-only (not attack-automated) otherwise, the same way
  Traits already are. **This pack reproduces the book's own copyrighted
  character write-ups almost verbatim and is included in this local install
  for personal reference only — it must not be committed to the public
  GitHub repo or bundled into a public release zip.** See the dedicated
  section below for exactly what that means in practice.
- As with 1.5.14/1.5.15, a world already running when this update lands may
  need its compendium sidebar layout refreshed once (return to Setup and
  relaunch the world, or a hard refresh of an already-open window) before the
  new folder and pack appear.

## 1.5.15 — Pregens and Homebrew packs joined the Wickfield Eight folder

- **The "Wickfield Eight" sidebar folder now groups all four one-shot packs**:
  Journals, Adversaries, and — newly added — Pregens and Homebrew. Previously
  only Journals and Adversaries were grouped; Pregens and Homebrew sat as
  separate entries at the top level of the Compendium sidebar alongside
  Marvel D616. Now all of the one-shot's content lives in one folder, and
  Marvel D616 is the only pack left at the top level.
- **Renamed to match the other two packs already in the folder:** the
  `characters` Actor pack is now labeled **Pregens** (previously "Wickfield
  Eight (Pregens)"), and the `homebrew` Item pack is now labeled **Homebrew**
  (previously "Wickfield Eight Items (Homebrew)"). As with the 1.5.14 rename,
  this only changes the label shown in the sidebar — pack contents, IDs, and
  ownership settings are unchanged.
- As with 1.5.14, a world that was already running when this update lands
  may need its compendium sidebar layout refreshed once (return to Setup and
  relaunch the world, or a hard refresh of an already-open window) before the
  new grouping appears — the underlying folder assignment lives in the world
  itself and is picked up on the next real page load, not through a live
  socket update to an already-open session.

## 1.5.14 — Wickfield Eight packs grouped into a sidebar folder

- **New "Wickfield Eight" folder in the Compendium sidebar** groups the
  Journals pack and the Adversaries pack together, so the one-shot's two
  smaller packs sit as one visual group instead of scattered among the
  system-wide ones. This is a sidebar-only grouping declared in the system
  manifest (`packFolders`) — each pack keeps its own identity, contents, and
  ownership settings; nothing about their data changed.
- **Renamed to avoid repeating "Wickfield Eight" now that it's inside a
  folder already labeled that:** the `wickfield` JournalEntry pack is now
  labeled **Journals** (previously "Wickfield Eight"), and the `villains`
  Actor pack is now labeled **Adversaries** (previously "Wickfield Eight:
  Adversaries"). Wickfield Eight (Pregens) and Wickfield Eight Items
  (Homebrew) were unchanged in this release and stayed outside the folder, at
  the top level — see 1.5.15 above, where they joined the folder too.
- Foundry only builds a manifest's `packFolders` into the sidebar the first
  time a world loads that folder configuration; an already-running world
  needs its compendium sidebar layout reset once to pick up a new folder.

## 1.5.13 — Fixed blank journal pages and empty actor items in every compendium

- **Root cause found and fixed: compendium packs were stored in a format
  Foundry's own compendium loader doesn't fully support.** Every hand-built
  pack in this system (`characters`, `homebrew`, `villains`, `marvel-d616`,
  `wickfield`) stored each document's embedded collection — a JournalEntry's
  `pages`, an Actor's `items` — as a plain array embedded directly inside that
  document's own database entry. That's valid JSON and reads back fine with a
  generic LevelDB tool, but it's **not** the format Foundry itself writes or
  expects: Foundry's real compendium format splits each embedded page/item
  out into its own database entry (keyed like
  `!journal.pages!<entryId>.<pageId>` or `!actors.items!<actorId>.<itemId>`),
  with the parent document holding only a list of IDs. When the parent's own
  entry is opened directly instead, Foundry finds no IDs to resolve and
  silently renders it as empty — the document still shows up in a compendium
  listing (its own top-level fields are fine), but its journal pages or
  actor's items come back blank. This is what "items are listed, but blank"
  was — not a caching issue, despite earlier changelog entries (1.5.7, 1.5.9)
  guessing that a stale session was to blame. All five packs were rebuilt
  using Foundry's own official packing library
  (`@foundryvtt/foundryvtt-cli`) so their on-disk format now matches exactly
  what a real Foundry install produces. No content changed — every journal
  page and every actor's Powers/Gear/Traits are byte-for-byte the same text
  as before, just stored the way Foundry actually reads it.

## 1.5.12 — Wickfield Eight compendium relabeled

- **"Wickfield Eight: Journals" renamed to just "Wickfield Eight."** Same
  `wickfield` compendium, same three journals — just a shorter label in the
  sidebar to match the pattern of the other Wickfield Eight packs.

## 1.5.11 — Wickfield Eight journals promoted to their own compendium

- **New compendium: "Wickfield Eight: Journals"** (`wickfield`, later
  relabeled "Wickfield Eight" in 1.5.12). The three
  Wickfield Eight-specific write-ups — Homebrew Powers & Gear, Traits, and
  Adversaries — moved out of the "Wickfield" subfolder inside Marvel D616 and
  into their own standalone top-level compendium, sitting in the sidebar
  alongside Marvel D616, Wickfield Eight (Pregens), Wickfield Eight Items
  (Homebrew), and Wickfield Eight: Adversaries.
- **Marvel D616 is back to 4 JournalEntries, no subfolder.** How to Play,
  Character Creation Tutorial, Gear Reference, and Powers Reference — the
  system-wide material only, with nothing Wickfield-Eight-specific nested
  inside it anymore.

## 1.5.10 — Wickfield Eight journals restored in a subfolder; reference order fixed (superseded by 1.5.11)

- **Marvel D616 now holds 7 JournalEntries again.** Wickfield Eight — Homebrew
  Powers & Gear, Wickfield Eight — Traits, and Wickfield Eight — Adversaries
  are back, this time tucked into a "Wickfield" subfolder inside the
  compendium instead of sitting at the top level — so the system-wide
  material (How to Play, Character Creation Tutorial, Gear Reference, Powers
  Reference) stays front and center, and the Wickfield Eight-specific
  write-ups are one click away in their own folder rather than removed.
- **Top-level order fixed to How to Play, Character Creation Tutorial, Gear
  Reference, then Powers Reference.** Gear Reference now sorts ahead of
  Powers Reference (previously the reverse).

## 1.5.9 — Wickfield Eight journals removed from Marvel D616 (superseded by 1.5.10)

- **Marvel D616 now holds 4 JournalEntries instead of 7.** Wickfield Eight —
  Homebrew Powers & Gear, Wickfield Eight — Traits, and Wickfield Eight —
  Adversaries are gone from the compendium — they were read-only write-ups of
  content that already exists as real, playable documents (the `homebrew`
  Item pack, each pregen's own Powers/Gear/Traits tabs, and the `villains`
  Actor pack), so nothing playable was lost, just a duplicate description of
  it. Marvel D616 is now scoped to system-wide material only: How to Play,
  Character Creation Tutorial, Powers Reference, and Gear Reference. See
  "Marvel D616 (tutorials & full reference)" below for where the removed
  content actually lives now.

## 1.5.8 — Compendiums consolidated into Marvel D616

- **All tutorials and reference journals merged into one compendium,
  "Marvel D616."** The `tutorial` pack (Character Creation Tutorial, How to
  Play — Core Mechanics) and the `reference` pack (Powers Reference, Gear
  Reference, Wickfield Eight Homebrew Powers & Gear, Traits, Adversaries) are
  gone as separate compendiums; all 7 of their JournalEntries now live
  together in the new `marvel-d616` pack, with How to Play and Character
  Creation Tutorial at the top. Same content, same pages — just one place to
  look instead of two.
- **Powers (Reference) and Gear (Reference) Item packs removed.** These held
  all 307 Powers and all 12 Common Weapons as draggable, ready-to-use items.
  Removed as of this version — see "Marvel D616 (tutorials & full reference)"
  below for the verification done before deleting them (a full name-by-name
  diff plus a mechanical-field spot-check confirming the Powers/Gear
  Reference journals already contain everything those packs did) and for how
  to add a Power or weapon to a sheet by hand now that they're gone.

## 1.5.7 — "How to Play" mechanics tutorial

- **"How to Play — Core Mechanics"** (new JournalEntry in the `tutorial`
  pack, alongside the existing Character Creation Tutorial) — an 8-page
  walkthrough of actually running a session: the core 2d6 + Marvel Die roll
  and what Fantastic/Green/Ultimate Fantastic mean, Edge & Trouble and where
  they come from, the Standard Actions available on your turn, the full
  attack/Defense/damage formula (including how Damage Reduction actually
  applies), Focus costs (flat and scaling) and passive Powers/Gear, Karma
  (spending it for Edge/Trouble, Karma-fueled recovery, Rest & Recover,
  awarding it), Health/Focus going negative and the automatic Unconscious/
  Demoralized/Shattered/Killed status icons (plus which Conditions are
  reminders only, not automated), and Team Maneuvers, closing with a
  one-screen quick-reference. Cross-checked page by page against this
  system's own formulas (`module/dice/marvel-roll.mjs`,
  `module/documents/actor.mjs`, `module/data/actor-character.mjs`,
  `module/helpers/conditions.mjs`, `module/helpers/team-maneuver.mjs`), not
  just the book, so it describes what this Foundry system actually does for
  you, including the few places it intentionally leaves something manual.

## 1.5.6 hotfix

- **Roll card die order fixed: white, Marvel Die, white.** The 2d6 + Marvel
  Die chat card was displaying the two white dice first and the red Marvel
  Die last. It now shows the Marvel Die between the two white dice, matching
  how the physical dice are laid out in the book. Pure display change — the
  underlying roll math and Fantastic/Green detection are untouched.

## 1.5.5 — Portrait crop/resize tool

Clicking the character portrait no longer jumps straight to Foundry's plain
file browser — it opens a small crop/resize dialog so a player can point it
at any photo or art (any size, any aspect ratio) and fit it into the
hexagonal frame themselves, instead of needing to pre-crop the file in
another program first.

- **Pick a source two ways**: upload a file straight from your computer
  (or drag one onto the dialog), or browse the files already on the server
  the way the old file picker did.
- **Pan and zoom, not a movable crop box.** The preview *is* the crop — drag
  the image to reposition it, scroll or use the slider to zoom in. It's
  locked to the portrait box's aspect ratio (13:15) and can never zoom out
  past "fills the frame," so there's no way to end up with gaps or a
  stretched result.
- **Shift-click the portrait** to skip the cropper and open the old plain
  file picker instead, for anyone who'd rather just point it at an
  already-correctly-sized image.
- **Saved image lands under `worlds/<world>/assets/portraits/`** as a new
  PNG (the original file is never modified), then the character's `img` is
  updated to point at it.
- **Uploading needs the "Players can Upload New Files" world permission.**
  By default only the Gamemaster can upload new files in a fresh Foundry
  world — a player without it will get a clear error telling them to ask
  their GM, and can fall back to "Choose Existing Image" (browsing files
  already on the server) in the meantime. A GM who wants players to use the
  upload option should enable it once under **Game Settings → Configure
  Permissions**.
- Built as `module/apps/image-cropper.mjs` — a small ApplicationV2 dialog,
  not a bundled third-party library, so there's nothing extra to install.

## 1.5.4 hotfix

- **Character portrait is another 20% larger.** `.mm-hero-portrait-block`
  grew from 143×165px (the 1.5.2 size) to 172×198px. Rank/Karma badge size
  and position are unchanged — they're sized independently of the portrait,
  so they now read as a bit smaller relative to it than before.

## 1.5.3 — Real icons for Powers, Gear, and Traits

Every Power, Gear item, and Trait across the reference compendiums, the
Wickfield Eight homebrew items, and the pregens/adversaries' own owned items
(370 uniquely-named items in all) now points at a small, themed SVG icon
instead of Foundry's generic default art (`icons/svg/aura.svg`, `book.svg`,
and similar) — so a Powers or Traits tab full of items reads at a glance
instead of as a wall of identical dice/books.

- **Icons come from [game-icons.net](https://game-icons.net)**, a large
  (4,000+ icon), actively-maintained, Foundry-community-standard set licensed
  CC BY 3.0 (a handful of contributors release theirs CC0). 75 icons across 7
  artists ended up used, kept under `icons/game-icons/` and renamed
  `<artist>_<icon-name>.svg` so each file's origin stays traceable. Each was
  stripped of the flat background shape the raw files ship with (the actual
  glyph is a separate white silhouette layered on top of it), leaving a clean
  transparent-background icon.
- **Mapping was keyword-driven**, not hand-picked one at a time: each item's
  name was matched against a set of thematic categories (fire, ice,
  lightning, teleport, psychic/mental, defense, stealth, illusion, healing,
  speed, flight, size change, melee, marksmanship, leadership, and so on),
  falling back to an exact-name lookup for the handful of items whose name
  doesn't carry a clean keyword (things like "Shape-Shift" or "Full
  Strength"). It's a best-effort thematic match, not a curated one — if an
  icon looks off for a given Power, swapping its `img` on the item sheet is
  the fix, same as any other item art.
- **The existing light-mode icon-color fix (from 1.5.2) still applies
  unchanged.** These icons are white-on-transparent SVGs, same as the
  Foundry defaults they replaced, so they'd have gone invisible against
  light mode's near-white row background the same way — the `.mm-item
  .item-img` filter that recolors them to red in light mode (and leaves them
  alone in dark mode) already handles that with no changes needed.
- **Keeping a live world's actors in sync.** The name→icon mapping ships as
  `icons/game-icons/name_to_icon.json`, and a copy of the Wickfield Eight
  (and any adversaries) placed into a world are separate documents from the
  compendium — they don't pick up icon changes automatically. A "Sync Actor
  Icons" script macro fetches that JSON and updates every owned Power/Gear/
  Trait's `img` across `game.actors` to match by name; it's idempotent, so
  re-running it after any future icon-mapping change is enough to bring a
  world's actors back in line with the compendium.

### Icon credits

Per game-icons.net's license, each contributor whose icons ended up in this
release is credited below (icons made by, followed by where to find them):

- Icons made by [Delapouite](http://delapouite.com)
- Icons made by [Lorc](http://lorcblog.blogspot.com)
- Icons made by [Sbed](http://opengameart.org/content/95-game-icons)
- Icons made by Skoll
- Icons made by [DarkZaitzev](http://darkzaitzev.deviantart.com)
- Icons made by [John Colburn](http://ninmunanmu.com)
- Icons made by the game-icons.net "badges" set

All available at [game-icons.net](https://game-icons.net), under CC BY 3.0.

## 1.5.2 hotfix

Header layout tweaks and another light-mode-only visibility bug:

- **Character portrait is 10% larger.** `.mm-hero-portrait-block` grew from
  130×150px to 143×165px.
- **Karma badge moved back to the bottom-right corner of the portrait**, to
  mirror the Rank badge at the top-left. Both badges now share one clip-path
  (a symmetric notched octagon), so the shape reads identically in either
  corner instead of Karma using its own asymmetric notch tuned for the
  right-edge position it briefly had in 1.5.1.
- **Power/Gear/Trait item icons were invisible in light mode.** These rows
  use Foundry's default item art (`icons/svg/aura.svg`, `book.svg`, etc. —
  whatever the item didn't get a custom icon), which renders light/white.
  That's fine in dark mode, where the row's backdrop (`.mm-item::before`,
  `var(--mm-cream)`) is dark — but in light mode `--mm-cream` is a near-white
  cream, so a white icon on a near-white row disappeared entirely. Added a
  `filter` on `.mm-item .item-img` that flattens the icon to a black
  silhouette (`brightness(0)`, which works regardless of the source icon's
  original color) and recolors it to match `--mm-red`; reset to `filter: none`
  under `.theme-dark` since dark mode wasn't broken.

## 1.5.1 hotfix

Two light-mode-only layout bugs on the main tab:

- **Damage panel text was invisible in light mode.** `.mm-styled-container-body`'s
  background is a gradient from `--mm-dark-red` at the top fading to plain
  `--mm-cream` by 40% down; with six ability rows stacked in the Damage panel,
  most of them land on that later, cream portion. Their label text (the ability
  name and the "+" separator) was hardcoded `color: white`, which disappears
  against light-mode cream (dark-mode cream is dark, so it wasn't visible
  there). Switched to `var(--mm-ink)`, the same theme-aware token the
  `[ ×N ] + M` boxes in that same panel already used correctly.
- **Longer `<h3>` section headers (e.g. "Standard Actions") were clipped.**
  `.mm-styled-container`'s chamfered corner-notch `clip-path` used fixed pixel
  thresholds (100px/128px) tuned for short labels like "Damage" or "Gear" —
  anything wider had its trailing characters cut off by the same notch, since
  the notch's geometry doesn't derive from the header's actual rendered width.
  Widened the flat run before the notch (180px/208px) to clear the longest
  header currently in use.

Also removed a stray, unscoped `.mm-karma-block { position: relative; }` rule
left over near the dark-theme overrides (not actually gated by `.theme-dark`)
that was silently overriding the Karma badge's real `position: absolute` rule
later in the cascade — found while repositioning that badge to the right side
of the portrait box instead of the bottom-right corner.

## 1.5.0 — Tutorial & Reference compendiums, sheet tooltips

- **Character Creation Tutorial** (`tutorial`, JournalEntry pack) — a new
  step-by-step walkthrough of the book's 5-step character creation process
  (Determine Rank → Pick Ability Scores → Pick Backstory Elements → Pick
  Powers (and Gear) → Calculate Other Scores), with the exact Ability Score
  Points and Resources-by-Rank tables, and a full worked example that builds
  Bulwark (one of the Wickfield Eight pregens) from a blank sheet, cross-checked
  line-by-line against this system's own formulas in `actor-character.mjs`.
- **D616 Reference** (`reference`, JournalEntry pack) — the entire
  `d616_powers_traits_reference.md` document (see below), compiled into five
  browsable in-Foundry journals: Powers Reference — Core Rulebook (25 pages,
  one per Power Set), Gear Reference — Common Weapons, Wickfield Eight —
  Homebrew Powers & Gear, Wickfield Eight — Traits, and Wickfield Eight —
  Adversaries. No more tabbing out to the markdown file to look something up
  mid-session.
- **`d616_powers_traits_reference.md` now also covers Gear (Reference)'s 12
  Common Weapons** (previously it only documented Powers, homebrew Gear, and
  Traits) — it's the single source both this reference journal and the sheet
  tooltips below are built from.
- **Hover tooltips** on every Power, Gear, and Trait row in the character
  sheet: hovering a row (not just opening the item) now shows its action/cost
  line and full Effect text (or, for Traits, its Edge/Trouble trigger and
  mechanical effect) right there in the Powers/Gear/Traits tabs.

## 1.4.2 hotfix

The Health/Focus "recover" icons on the header (added in 1.4.0) were invisible —
functional (the clickable area was there and worked) but drawn in the same cream
color as the card behind them, since that part of the header box is actually an
inset cream panel over a red/blue border, not the border color itself. Recolored
them to match the same red used by the existing Initiative roll icon in that same
panel, and sized them up a bit since they were easy to miss even once visible.
Purely a CSS fix — no data or mechanics changes.

## 1.4.1 hotfix

1.4.0 shipped a broken `standingEdgeOn` field on Powers and Gear (added for the
Spider-Sense-style "standing Edge" indicator): it defaulted to a blank value that
Foundry's own schema validation rejected, which made **every** Power and Gear item —
old and newly created — invalid and invisible on the sheet. If you installed 1.4.0,
update to 1.4.1; nothing about your existing characters or items needs fixing by hand,
this was purely a bug in the system's own field definition.

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

As of 1.5.8, the book's full Powers and Common Weapons catalog lives as
**browsable reference journals** inside the single **Marvel D616** compendium
(see "Marvel D616 (tutorials & full reference)" below) rather than as separate
draggable Item compendiums — see that section for what changed, why, and how to
still get a Power or Gear item onto a sheet now that the Item packs are gone.

**How the content was sourced, and why it's written the way it is.** Game rules,
mechanics, names, numbers, and other functional facts (a Power's name and Power
Set, its Action type/Duration/Range/Focus cost, whether and how it attacks, its
damage-multiplier or Health Damage Reduction bonus, a weapon's range and damage
bonus) are not protected by copyright — they're the game's factual rules, and
every entry reproduces those facts exactly as printed. The book's own
descriptive sentences, however — its prose — **are** the publisher's
copyrighted expression, and reproducing them at compendium scale isn't something
I'm able to do, attribution or no. So every mechanical summary is **original
wording**, independently written from the same underlying rules facts rather
than copied or lightly reworded from the book's text. If a line of this
reference and a line of the book read alike, it's very likely because there's
only one clear way to state a specific mechanical fact (e.g. "makes a Melee
attack against the target's Resilience Defense" is standard rules terminology,
not creative prose) — never because text was copied.

A few individual powers had no numeric Focus cost or fully explicit attack/defense
pairing in the source text (e.g. a handful of "Varies" costs, or powers whose
description implies rather than states an ability); those were filled in with the
most reasonable, rules-consistent interpretation rather than left blank or
invented wholesale — treat those as a sensible default, not as a book citation.
As of 1.5.3, every Power, Gear item, and Trait in the Wickfield Eight homebrew
items and on the pregens/adversaries themselves ships with a themed icon from
[game-icons.net](https://game-icons.net) instead of a generic placeholder; see
"Icon credits" below. You're still free to swap in your own `img` on any item.

This journal is for your own reference and play at the table — it is not a
substitute for owning the book, which is where all the flavor text, examples, and
setting material actually live.

### The Wickfield Eight (pregens)

Two more packs ship the eight original pregenerated characters from
`wickfield_pregens.md` (see that file for the printable/readable version, including
the one-shot hook and table-running notes) as ready-to-drop-in Foundry documents.
As of 1.5.15 both packs sit inside the **Wickfield Eight** folder in the
Compendium sidebar alongside Journals and Adversaries, and are labeled to match
(no more repeating "Wickfield Eight" now that the folder already says it):

- **Pregens** (`characters`, Actor pack, previously labeled "Wickfield Eight
  (Pregens)") — Bulwark, Ricochet, Wisp, Nightglass, Circuit, Amberlight,
  Permafrost, and The Latch, Rank 2, with Ability scores set and
  Health/Focus/Karma/Defenses/Speed/Initiative all deriving correctly from
  them. Each one's Biography tab is filled in with a full original History and
  Personality write-up (not just the one-line hooks from the printable sheet),
  plus Real Name/Occupation/Origin/Team. Each actor's Powers, Gear, and Traits
  tabs come pre-populated with that character's actual items — drag one out of
  the compendium and it's playable immediately, no manual data entry.
- **Homebrew** (`homebrew`, Item pack, previously labeled "Wickfield Eight
  Items (Homebrew)") — the same 24 Powers, 6 Gear, and 24 Traits used by the
  eight pregens, as standalone reference items, in case you want to browse,
  reuse, or hand one to a different character without opening a pregen's
  sheet.

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

The rest of the pregens' powers are intentionally simpler than the book's own
Powers, as browsable in the Powers Reference journal (see below): per
`wickfield_pregens.md`'s own note, their Focus costs
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

A third Actor pack, **Adversaries** (`villains`) — grouped with Pregens,
Homebrew, and the Journals pack below inside the "Wickfield Eight" folder in
the Compendium sidebar — gives the pregens something to fight, built around
the same "rolling blackouts closing in on the fundraiser" hook from
`wickfield_pregens.md`:

- **Brownout** (Rosalind "Ross" Kade) — Rank 4 villain. A Kade Electric heir who lost the family's
  building to the city (it's now the Wickfield Community Center) and bonded with something wired into
  its sub-basement that lets her drain bioelectric and kinetic energy from anyone nearby. Her five
  Powers escalate over the course of a fight — Power Surge stacks a growing damage bonus every time she
  drains someone, and her finisher, Full Strength, only unlocks once she's stacked it three times —
  mechanically reproducing the hook's "she'll be at full strength by the night of the fundraiser."
- **Kade's Enforcer** — Rank 1 henchman template (not a single named character — duplicate the actor
  for as many Enforcers as a scene needs), hired muscle armed with a Pistol (a real, working Gear item
  embedded right on its sheet, same as any pregen's gear), meant to be a speed bump rather than a real
  threat to a team of Rank 2 heroes.

Both are built the same way as the Wickfield Eight themselves: full History/Personality on the
Biography tab, and their Powers/Traits/Gear pre-populated as real embedded Items. Brownout's Power
Surge and Full Strength are reference-only entries (like a couple of the heroes' own powers) since a
scene-cumulative stacking counter isn't something a static sheet field can track — run it by hand.

### Journals (Wickfield Eight folder)

A fourth compendium, **Journals** (`wickfield`, JournalEntry pack), holds
three journals documenting the Wickfield Eight one-shot specifically —
separate from the system-wide Marvel D616 compendium below, so neither
clutters the other. It sits inside the **Wickfield Eight** folder in the
Compendium sidebar together with Adversaries, Pregens, and Homebrew, so all
four one-shot-specific packs are grouped rather than scattered among the
system-wide ones (as of 1.5.15, Marvel D616 is the only pack left at the top
level); every pack keeps its own identity and contents, the folder just
organizes where they show up in the sidebar.

- **Wickfield Eight — Homebrew Powers & Gear**
- **Wickfield Eight — Traits**
- **Wickfield Eight — Adversaries**

These are read-only restatements, not the source of truth — the same
Powers/Gear are the `homebrew` Item pack's real items (and are already
embedded on each pregen's Powers/Gear tab), the same Traits are the real
Trait items already embedded on each pregen's Traits tab (click one to post
its effect to chat, same as always), and Brownout/Kade's Enforcer are the
real Actors in the `villains` pack. Treat this compendium as a quick,
browsable summary of the one-shot's homebrew content, not a second copy you
need to keep in sync by hand — the playable documents it summarizes are the
ones that actually matter at the table.

### Journals (Marvel D616 folder)

One JournalEntry compendium, **Journals** (`marvel-d616`, previously labeled
"Marvel D616" — see the 1.5.16 changelog entry above), holds the system-wide
tutorials and core-rulebook reference — 4 JournalEntries, nothing one-shot-specific
mixed in (see "Journals (Wickfield Eight folder)" above for that one — same
pack label, different compendium, so tell them apart by which sidebar folder
they sit in). As of 1.5.16 it sits inside its own **Marvel D616** folder in the
Compendium sidebar, alongside the new Heroes & Villains pack below:

- **How to Play — Core Mechanics** — 8 pages covering actually running a
  session: the core 2d6 + Marvel Die roll and Fantastic/Green/Ultimate
  Fantastic, Edge & Trouble and every source that can grant them, Standard
  Actions on your turn, the full attack/Defense/damage formula (including how
  Damage Reduction really applies, to the multiplier rather than the final
  total), Focus costs and passive Powers/Gear, Karma in all its forms,
  Health/Focus going negative with the automatic status conditions (and which
  Conditions are reminders only), and Team Maneuvers, ending on a one-screen
  quick reference. Cross-checked page by page against this system's own code
  (`marvel-roll.mjs`, `documents/actor.mjs`, `actor-character.mjs`,
  `conditions.mjs`, `team-maneuver.mjs`) rather than the book alone, so it
  documents what this Foundry system actually automates for you — including
  the parts (Traits, most Conditions' numeric effects) it deliberately leaves
  manual (see "What's intentionally manual" below).
- **Character Creation Tutorial** — 7 pages walking through the book's own
  5-step process (Rank → Ability Scores → Backstory → Powers/Gear → Other
  Scores) with the exact Ability Score Points and Resources-by-Rank tables,
  then a full worked example building Bulwark from a blank sheet, step by
  step, with every derived number (Health, Focus, Karma, Speed, Initiative)
  cross-checked against `actor-character.mjs`'s actual formulas rather than
  hand-waved. Same sourcing discipline as everywhere else in this system: the
  book's tables and formulas are reproduced exactly, all prose and the worked
  example are original.
- **Gear Reference — Common Weapons** — the book's full Common Weapons table
  (Pistol, Bow, Rifle, Sniper Rifle, Shotgun, Submachine Gun, Frag Grenade,
  Flash-Bang Grenade, Club, Knife, Knife/Thrown, Sword).
- **Powers Reference — Core Rulebook** — 25 pages (one per Power Set), all 307
  individual Powers from the book's Power Descriptions chapter.

Compiled from the book-facing portion of `d616_powers_traits_reference.md`
(same rules-facts-exact/prose-original discipline as everywhere else — see
the sourcing note above) plus the two tutorials, all into one browsable,
in-Foundry compendium that's about the *system*, not any specific campaign.

### Heroes & Villains

A new Actor pack, **Heroes & Villains** (`heroes-villains`), sitting in the
**Marvel D616** folder in the Compendium sidebar alongside Journals: the full
128-character roster from the core rulebook's Character Profiles chapter
(Abomination through Wong), each built out the same way the Wickfield Eight
pregens and Adversaries are —

- **Rank, all six Abilities, Health/Focus/Karma, Size, and Movement** (including
  Glide/Swingline/Fly/Teleport where the character has them) set exactly as
  printed, with Speed derived the same way the rest of this system derives it.
- **Full Biography tab** — Real Name, Occupation, Origin, Team, and the book's
  own History and Personality write-ups for that character, reproduced as
  printed (this is the copyrighted material the warning above refers to).
- **Every Trait and Power from the character's profile page as a real,
  embedded Item** — Traits are reference-only (as they are everywhere else in
  this system), and Powers are cross-referenced by name against the book's own
  Power Descriptions glossary: where a match is found, the Power's Effect text,
  Action, Duration, Range, and Focus cost come from that glossary entry (~99%
  of the roster's ~1,700 power instances matched); a handful of one-off or
  ambiguously-named powers that had no clean glossary match instead carry a
  short note pointing you to the character's own page in the book. As with
  every Power in this system, these are **not attack-automated**
  (`attack.enabled`/`passive.enabled` are both off) — 128 characters' worth of
  powers is far too much to safely auto-mechanize sight-unseen, so treat them
  the way you'd treat a Trait: reference text you apply by hand, not a button
  that rolls dice for you. Feel free to wire up automation yourself on any
  individual character you plan to actually run.

Because every character's write-up is close to a direct transcription of its
book page, **this pack does not get its own name-by-name public-domain-facts
verification** the way the system-wide Powers/Gear Reference journals do —
there's no attempt here to separate "rules facts" from "the book's prose" the
way the rest of this README describes, since the whole point of this pack was
a faithful private copy of the book's own roster. That's exactly why it stays
out of the public repo.

**1.5.11 — Wickfield Eight journals moved out to their own compendium.** The
three Wickfield Eight-specific journals lived here briefly as a "Wickfield"
subfolder (1.5.10) and, before that, as loose top-level entries removed
entirely (1.5.9). As of 1.5.11 they've moved out for good, into their own
standalone **Wickfield Eight** compendium — see that section below.
Marvel D616 stays scoped to system-wide material only: how to play, how to
build a character, and the book's own Powers and Gear.

**1.5.8 — Powers (Reference) and Gear (Reference) Item packs removed.**
Earlier versions also shipped `powers` and `gear` as separate Item
compendiums — all 307 Powers and all 12 Common Weapons as real, draggable
Gear/Power items with their mechanical fields already filled in, so you could
drag one straight onto a sheet instead of building it by hand. As of 1.5.8
those two Item packs are gone; the Powers Reference and Gear Reference
journals above are now the only copy of that content. Before removing them, I
verified the journals are a complete substitute for the Item packs'
**information** (not their drag-and-drop convenience — see below): every one
of the 307 Power names and all 12 weapon names appear in the journals
verbatim (a scripted diff against both packs' actual item names, byte for
byte), and a spot-check across 16 Powers plus all 12 weapons confirmed their
Focus cost, attack ability/Defense target, damage flag, and passive bonuses
match the journal's mechanical-summary text exactly, field for field. So
nothing described in the old Item packs is missing from the journal text.

What you lose is the convenience of dragging a pre-built item straight onto a
sheet — a Power or a weapon from the book now has to be added by hand: **Add
Power** (or **Add Gear**) on the sheet, then copy the Focus cost, Action,
attack ability/Defense target, and damage-multiplier bonus straight off that
Power's or weapon's line in the Powers/Gear Reference journal into the item's
own fields (the journal spells out every one of those numbers explicitly for
exactly this purpose). It's a few more clicks per item than dragging one in,
but keeps the system to a single compendium of tutorials and reference
material instead of maintaining the same 319 facts in two different document
types. The Wickfield Eight's own items (`homebrew`), and everything already
embedded on the pregens/adversaries, are untouched — those were never part of
the Powers (Reference)/Gear (Reference) packs and still drag on and play
exactly as before.

Marvel D616 was hand-built directly against the same ClassicLevel/LevelDB
format Foundry itself writes (see `packs/marvel-d616`), the same approach
already used for `characters`/`homebrew`/`villains` — the `fvtt-cli`'s own
`pack`/`unpack` commands expect a JournalEntry's pages (or an Actor's items)
to already be split into their own sublevel keys the way its own `pack` step
would produce them, and error out on a plain embedded array even though
Foundry's client reads a plain embedded array back correctly (as the shipped
Actor packs already prove, live). If you regenerate this pack from source,
build it the same way rather than through `fvtt package pack`.

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
├── d616_powers_traits_reference.md (every Power + Gear + Trait in the compendiums, one document —
│                                   source content for the Marvel D616 pack's reference journals and
│                                   the sheet tooltips)
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
├── packs/                        (Item + Actor + JournalEntry compendiums — see "Compendium packs")
└── styles/d616.css
```
