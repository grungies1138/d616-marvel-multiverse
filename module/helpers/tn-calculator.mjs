/**
 * Target Number lookup (book p.13-14). The Challenging TN by Rank table is
 * a flat Rank+10 progression (Rank 1 -> 11 ... Rank 6 -> 16 in the book's
 * own printed table; the same formula covers higher Ranks too), which an
 * Adjective then shifts up or down.
 */
export const ADJECTIVE_MODIFIERS = {
  trivial: -6,
  easy: -4,
  routine: -2,
  challenging: 0,
  difficult: 2,
  ridiculous: 4,
  absurd: 6
};

export function challengingTNByRank(rank) {
  return 10 + rank;
}

export function computeTN(rank, adjective = "challenging") {
  return challengingTNByRank(rank) + (ADJECTIVE_MODIFIERS[adjective] ?? 0);
}

/** A Narrator-facing utility: pick a Rank and Adjective, post the resulting TN to chat. */
export async function openTNCalculatorDialog() {
  const adjectives = Object.keys(ADJECTIVE_MODIFIERS);
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize("D616.TNCalc.Title") },
    content: `
      <div class="form-group">
        <label>${game.i18n.localize("D616.TNCalc.Rank")}</label>
        <input type="number" name="rank" value="2" min="1" />
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("D616.TNCalc.AdjectiveLabel")}</label>
        <select name="adjective">
          ${adjectives.map((a) => `<option value="${a}"${a === "challenging" ? " selected" : ""}>${game.i18n.localize(`D616.TNCalc.Adjective.${a}`)} (${ADJECTIVE_MODIFIERS[a] >= 0 ? "+" : ""}${ADJECTIVE_MODIFIERS[a]})</option>`).join("")}
        </select>
      </div>
    `,
    ok: { callback: (event, button) => new FormDataExtended(button.form).object }
  }).catch(() => null);
  if (!result) return;

  const rank = Number(result.rank ?? 1);
  const adjective = result.adjective ?? "challenging";
  const tn = computeTN(rank, adjective);

  ChatMessage.create({
    speaker: ChatMessage.getSpeaker(),
    content: `<p class="d616-edge-trouble-note">${game.i18n.format("D616.TNCalc.ResultNote", {
      rank,
      adjective: game.i18n.localize(`D616.TNCalc.Adjective.${adjective}`),
      tn
    })}</p>`
  });
}
