// Calls to the Rails app for starting and joining tables (see
// plans/server.md). Each returns the parsed JSON, or throws an Error with the
// server's message.

export function startGame({ manifestUrl, name, playerName, state }) {
  const { sequence, seating, pieces, containers } = state;
  return request("/tables", {
    manifest_url: new URL(manifestUrl, window.location.href).href,
    name,
    player_name: playerName,
    state: { sequence, seating, pieces, containers },
  });
}

export function joinGame(token, name) {
  return request(`/tables/${encodeURIComponent(token)}/players`, { name });
}

// Deletes a table the signed-in user owns.
export function deleteGame(token) {
  return request(`/tables/${encodeURIComponent(token)}`, undefined, "DELETE");
}

// The table as the server has it: { sequence, seating, tableLocked, players,
// roster, pieces, containers }.
export function fetchGameState(token) {
  return request(`/tables/${encodeURIComponent(token)}/state`);
}

async function request(path, body, method = body === undefined ? "GET" : "POST") {
  const options = method === "GET" ? {} : {
    method,
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, ...options });
  const json = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `The server said ${response.status}.`);
  return json;
}

function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || "";
}
