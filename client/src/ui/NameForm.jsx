import { useState } from "react";

// A small form over the table asking for names: yours, to join a game, and
// the game's, to start one. onSubmit({ name, gameName }) returns a promise;
// a rejection shows its message.
export function NameForm({ title, askGameName = false, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState("");
  const [gameName, setGameName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), gameName: gameName.trim() });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="seat-picker" role="dialog" aria-label={title}>
      <form className="seat-picker-panel name-form" onSubmit={submit}>
        <h2>{title}</h2>
        {askGameName && (
          <label>
            Game name
            <input value={gameName} maxLength={60} placeholder="Game" onChange={(event) => setGameName(event.target.value)} />
          </label>
        )}
        <label>
          Your name
          <input value={name} maxLength={40} required autoFocus onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <p className="menu-note" role="alert">{error}</p>}
        <div className="piece-actions-row">
          {onCancel && <button type="button" className="menu-item" onClick={onCancel}>Cancel</button>}
          <button type="submit" className="menu-item" disabled={busy || !name.trim()}>{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}
