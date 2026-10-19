import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Home } from "./ui/Home";
import "./styles/index.css";

// A table page names the table and, once this browser has joined, its
// player. The sandbox has neither.
function gameFrom({ gameToken, gameName, playerId, playerName }) {
  if (!gameToken) return null;
  return { token: gameToken, name: gameName, player: playerId ? { id: playerId, name: playerName } : null };
}

const el = document.getElementById("app");
createRoot(el).render(
  <StrictMode>
    {el.dataset.page === "home"
      ? <Home tables={JSON.parse(el.dataset.tables || "[]")} builtIns={JSON.parse(el.dataset.builtins || "[]")} />
      : <App manifestUrl={el.dataset.manifestUrl} game={gameFrom(el.dataset)} />}
  </StrictMode>
);
