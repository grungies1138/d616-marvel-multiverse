/**
 * Player-selectable "Sheet Theme" (Light/Dark).
 *
 * Registered as a client-scoped setting, so it's a per-player preference —
 * each person picks their own look and it never touches what anyone else
 * sees. A small toggle button on the character sheet header flips it
 * directly; it's also exposed in Foundry's system Settings menu for anyone
 * who'd rather set it there.
 *
 * Every d616 sheet (actor + item) applies it as a CSS class on its own root
 * element (see applySheetTheme), and the setting's onChange sweeps every
 * currently-open d616 sheet so a toggle takes effect immediately without
 * needing to close and reopen anything.
 */

const SETTING_KEY = "sheetTheme";

export function registerSheetThemeSetting() {
  game.settings.register("d616", SETTING_KEY, {
    name: "D616.Settings.SheetTheme.Name",
    hint: "D616.Settings.SheetTheme.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      light: "D616.Settings.SheetTheme.Light",
      dark: "D616.Settings.SheetTheme.Dark"
    },
    default: "light",
    onChange: () => refreshOpenSheets()
  });
}

function currentTheme() {
  return game.settings.get("d616", SETTING_KEY);
}

/** Call from a d616 sheet's _onRender to sync its root element's theme class. */
export function applySheetTheme(app) {
  app.element?.classList.toggle("theme-dark", currentTheme() === "dark");
}

/** Action handler for the header's toggle button — flips the client's preference. */
export function toggleSheetTheme() {
  game.settings.set("d616", SETTING_KEY, currentTheme() === "dark" ? "light" : "dark");
}

/** Re-sync every currently-rendered d616 sheet after the setting changes. */
function refreshOpenSheets() {
  for (const app of foundry.applications.instances.values()) {
    if (app.element?.classList?.contains("d616")) applySheetTheme(app);
  }
}
