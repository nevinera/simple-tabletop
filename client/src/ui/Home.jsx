import { useState } from "react";
import { fetchManifest } from "../manifest/manifest";
import { initialState } from "../state/actions";
import { startGame } from "../server/api";
import { recentModules, rememberName, rememberedName } from "../browserMemory";
import { readSave, restoreState } from "../state/saveFile";

// The front page: get back to a table this browser joined, or start one from
// a built-in module, one you played recently, a manifest URL you paste, or a
// saved table's file.
// tables is [{ path, name, playerName }], newest visit first, and builtIns
// [{ url, name, description, thumbnailUrl }] from config/builtins.yml.
export function Home({ tables, builtIns }) {
  const absolute = (url) => new URL(url, window.location.href).href;
  const builtInUrls = new Set(builtIns.map((module) => absolute(module.url)));
  const [recent] = useState(() => recentModules().filter((module) => !builtInUrls.has(module.url)));
  const [selected, setSelected] = useState(() => recent[0]?.url || builtIns[0]?.url || "");
  const [pasted, setPasted] = useState("");
  const [gameName, setGameName] = useState("");
  const [name, setName] = useState(rememberedName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // A saved table, once read and checked against its module:
  // { save, manifest, state, dropped }, or { error }.
  const [resume, setResume] = useState(null);
  const resuming = selected === "saved";
  const manifestUrl = resuming ? resume?.save?.manifestUrl || "" : selected === "pasted" ? pasted.trim() : selected;

  const pickSave = async (file) => {
    setSelected("saved");
    setResume(file ? { reading: true } : null);
    if (!file) return;
    try {
      const save = readSave(await file.text());
      const manifest = await fetchManifest(save.manifestUrl);
      setResume({ save, manifest, ...restoreState(manifest, save) });
    } catch (err) {
      setResume({ error: err.message });
    }
  };

  const start = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const manifest = resuming ? resume.manifest : await fetchManifest(manifestUrl);
      rememberName(name.trim());
      const { path } = await startGame({
        manifestUrl, name: gameName.trim() || manifest.name, playerName: name.trim(),
        state: resuming ? resume.state : initialState(manifest),
      });
      window.location.assign(path);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const option = (module, label, detail) => (
    <label key={module.url} className="home-module">
      <input type="radio" name="module" checked={selected === module.url} onChange={() => setSelected(module.url)} />
      <span className="home-module-name">{label}</span>
      {detail && <span className="home-module-detail">{detail}</span>}
    </label>
  );

  return (
    <div className="home">
      <header className="home-header">
        <h1>Simple Tabletop</h1>
        <p>Card and board games in the browser, without the physics.</p>
      </header>

      {tables.length > 0 && (
        <section className="home-section" aria-label="Your tables">
          <h2>Your tables</h2>
          <ul className="home-tables">
            {tables.map((table) => (
              <li key={table.path}>
                <a href={table.path}>{table.name}</a>
                <span className="home-module-detail">as {table.playerName}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="home-section name-form" onSubmit={start} aria-label="Start a table">
        <h2>Start a table</h2>
        <fieldset className="home-modules">
          <legend>Built in</legend>
          {builtIns.map((module) => (
            <label key={module.url} className="home-module home-builtin">
              <input type="radio" name="module" checked={selected === module.url} onChange={() => setSelected(module.url)} />
              <img className="home-builtin-thumbnail" src={module.thumbnailUrl} alt="" />
              <span>
                <span className="home-module-name">{module.name}</span>
                <span className="home-builtin-description">{module.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {recent.length > 0 && (
          <fieldset className="home-modules">
            <legend>Played recently</legend>
            {recent.map((module) => option(module, module.name, moduleDetail(module)))}
          </fieldset>
        )}
        <fieldset className="home-modules">
          <legend>Another module</legend>
          <label className="home-module">
            <input type="radio" name="module" checked={selected === "pasted"} onChange={() => setSelected("pasted")} />
            <input
              aria-label="Manifest URL"
              type="url"
              placeholder="https://…/manifest.json"
              value={pasted}
              onFocus={() => setSelected("pasted")}
              onChange={(event) => setPasted(event.target.value)}
            />
          </label>
        </fieldset>
        <fieldset className="home-modules">
          <legend>A saved table</legend>
          <label className="home-module">
            <input type="radio" name="module" checked={resuming} onChange={() => setSelected("saved")} />
            <input aria-label="Saved table file" type="file" accept=".json,application/json"
              onChange={(event) => pickSave(event.target.files[0])} />
          </label>
          {resuming && resume && <p className="menu-note" role="status">{resumeNote(resume)}</p>}
        </fieldset>
        <label>
          Table name
          <input value={gameName} maxLength={60} placeholder="The module's name" onChange={(event) => setGameName(event.target.value)} />
        </label>
        <label>
          Your name
          <input value={name} maxLength={40} required onChange={(event) => setName(event.target.value)} />
        </label>
        {error && <p className="menu-note" role="alert">{error}</p>}
        <div className="piece-actions-row">
          {!resuming && <a className="menu-item" href={sandboxPath(manifestUrl, builtIns)}>Try it alone</a>}
          <button type="submit" className="menu-item"
            disabled={busy || !name.trim() || !manifestUrl || (resuming && !resume?.state)}>
            {resuming ? "Resume table" : "Start table"}
          </button>
        </div>
      </form>
    </div>
  );
}

// What a picked save will do: which module it resumes, from when, and what
// it leaves out because the module changed.
function resumeNote(resume) {
  if (resume.reading) return "Reading the file…";
  if (resume.error) return resume.error;
  const { save, dropped } = resume;
  const when = new Date(save.savedAt).toLocaleString();
  const left = dropped.length
    ? ` The module changed since, so ${dropped.length} piece${dropped.length === 1 ? "" : "s"} it no longer has will be left out.`
    : "";
  return `Resumes ${save.moduleName || "the table"}, saved ${when}.${left}`;
}

// "1.2.0 · example.com"
function moduleDetail(module) {
  let host = "";
  try {
    host = new URL(module.url).host;
  } catch {
    // Not a URL we can read a host from; show the version alone.
  }
  return [module.version, host].filter(Boolean).join(" · ");
}

// The sandbox opens the first built-in module when it isn't told one.
function sandboxPath(manifestUrl, builtIns) {
  if (!manifestUrl || manifestUrl === builtIns[0]?.url) return "/sandbox";
  return `/sandbox?manifest=${encodeURIComponent(manifestUrl)}`;
}
