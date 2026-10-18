import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

const el = document.getElementById("app");
createRoot(el).render(
  <StrictMode>
    <App gameId={el.dataset.gameId} />
  </StrictMode>
);
