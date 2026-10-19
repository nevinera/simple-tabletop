import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// A game page names the game and, once this browser has joined, its player.
// The sandbox at / has neither.
function gameFrom({ gameToken, gameName, playerId, playerName }) {
  if (!gameToken) return null;
  return { token: gameToken, name: gameName, player: playerId ? { id: playerId, name: playerName } : null };
}

const el = document.getElementById("app");
createRoot(el).render(
  <StrictMode>
    <App manifestUrl={el.dataset.manifestUrl} game={gameFrom(el.dataset)} />
  </StrictMode>
);
