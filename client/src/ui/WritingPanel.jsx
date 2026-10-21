import { useState } from "react";
import { MAX_COUNTER_LABEL } from "../state/objects";
import { MAX_NOTE_LENGTH, MAX_SCORE_NAME, MAX_SCORE_PLAYERS, MAX_SCORE_ROUNDS, totals } from "../state/notes";

// Writing on a note or score sheet, in a popover. It starts from what's
// written now and saves it all at once, so someone else's edit meanwhile is
// replaced, not merged.
export function WritingPanel({ store, interaction, pieceId, onClose }) {
  const piece = store.getState().pieces[pieceId];
  const kind = interaction.describe(pieceId)?.writable;
  if (!piece || !kind) return null;
  return kind === "note"
    ? <NoteEditor text={piece.text} onSave={(text) => interaction.setNote(pieceId, text) && onClose()} onClose={onClose} />
    : <ScoreSheetEditor sheet={piece} onSave={(sheet) => interaction.setScores(pieceId, sheet) && onClose()} onClose={onClose} />;
}

function Popover({ title, label, onClose, children }) {
  return (
    <div className="help-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="help reorder writing" role="dialog" aria-label={label}>
        <div className="help-header">
          <h2>{title}</h2>
          <button type="button" className="help-close" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>×</button>
        </div>
        <div className="help-body">{children}</div>
      </div>
    </div>
  );
}

export function NoteEditor({ text, onSave, onClose }) {
  const [draft, setDraft] = useState(text || "");
  return (
    <Popover title="Note" label="Edit note" onClose={onClose}>
      <textarea
        className="note-text"
        aria-label="Note"
        maxLength={MAX_NOTE_LENGTH}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        autoFocus
      />
      <div className="writing-footer">
        <span className="menu-note">{draft.length} / {MAX_NOTE_LENGTH}</span>
        <button type="button" className="menu-item" onClick={() => onSave(draft)}>Save</button>
      </div>
    </Popover>
  );
}

// Cells are kept as typed until saving: "" is no score, and anything that
// isn't a whole number keeps Save from working until it's fixed.
export function ScoreSheetEditor({ sheet, onSave, onClose }) {
  const [label, setLabel] = useState(sheet.label || "");
  const [players, setPlayers] = useState(sheet.players);
  const [rounds, setRounds] = useState(sheet.rounds.map((row) => row.map((cell) => (cell == null ? "" : String(cell)))));
  const parse = (cell) => (cell.trim() === "" ? null : /^-?\d+$/.test(cell.trim()) ? Number(cell.trim()) : NaN);
  const parsed = rounds.map((row) => row.map(parse));
  const bad = parsed.some((row) => row.some((cell) => Number.isNaN(cell)));
  const sums = totals(players, parsed.map((row) => row.map((cell) => (Number.isNaN(cell) ? null : cell))));

  const setCell = (r, c, value) => setRounds(rounds.map((row, i) => (i === r ? row.map((cell, j) => (j === c ? value : cell)) : row)));
  const rename = (c, name) => setPlayers(players.map((each, j) => (j === c ? name : each)));
  const addPlayer = () => {
    setPlayers([...players, `Player ${players.length + 1}`]);
    setRounds(rounds.map((row) => [...row, ""]));
  };
  const removePlayer = (c) => {
    setPlayers(players.filter((_, j) => j !== c));
    setRounds(rounds.map((row) => row.filter((_, j) => j !== c)));
  };
  const addRound = () => setRounds([...rounds, players.map(() => "")]);
  const removeRound = (r) => setRounds(rounds.filter((_, i) => i !== r));

  return (
    <Popover title="Score sheet" label="Edit score sheet" onClose={onClose}>
      <input className="sheet-title" aria-label="Title" maxLength={MAX_COUNTER_LABEL} value={label} placeholder="Scores"
        onChange={(event) => setLabel(event.target.value)} />
      <div className="sheet-scroll">
        <table className="score-sheet">
          <thead>
            <tr>
              <th scope="col"><span className="visually-hidden">Round</span></th>
              {players.map((name, c) => (
                <th key={c} scope="col">
                  <input aria-label={`Player ${c + 1} name`} maxLength={MAX_SCORE_NAME} value={name} onChange={(event) => rename(c, event.target.value)} />
                  {players.length > 1 && (
                    <button type="button" className="sheet-remove" aria-label={`Remove ${name || `player ${c + 1}`}`} onClick={() => removePlayer(c)}>×</button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rounds.map((row, r) => (
              <tr key={r}>
                <th scope="row">
                  {r + 1}
                  <button type="button" className="sheet-remove" aria-label={`Remove round ${r + 1}`} onClick={() => removeRound(r)}>×</button>
                </th>
                {row.map((cell, c) => (
                  <td key={c}>
                    <input aria-label={`Round ${r + 1}, ${players[c] || `player ${c + 1}`}`} inputMode="numeric" value={cell}
                      aria-invalid={Number.isNaN(parsed[r][c]) || undefined} onChange={(event) => setCell(r, c, event.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              {sums.map((sum, c) => <td key={c} aria-label={`${players[c] || `Player ${c + 1}`} total`}>{sum}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="writing-footer">
        <button type="button" className="menu-item" disabled={rounds.length >= MAX_SCORE_ROUNDS} onClick={addRound}>Add a round</button>
        <button type="button" className="menu-item" disabled={players.length >= MAX_SCORE_PLAYERS} onClick={addPlayer}>Add a player</button>
        <button type="button" className="menu-item" disabled={bad}
          onClick={() => onSave({ label, players, rounds: parsed })}>Save</button>
      </div>
      {bad && <p className="menu-note">Scores are whole numbers.</p>}
    </Popover>
  );
}
