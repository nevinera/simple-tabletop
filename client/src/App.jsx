import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TableCanvas from "./table/TableCanvas";
import { CameraSlots } from "./table/cameraSlots";
import { fetchManifest } from "./manifest/manifest";
import { rememberModule } from "./browserMemory";
import { createTableStore } from "./state/store";
import { useViewportMode } from "./useViewportMode";
import { useTableKeys } from "./useTableKeys";
import { useSelectedObject, useSelectedObjects } from "./useSelectedObject";
import { sameIds, useStoreValue } from "./useStoreValue";
import { useMagnifyKey } from "./useMagnifyKey";
import { TableSounds, soundFor } from "./sound/sounds";
import { handId, openSeats, playerColor, seatName, seatOf, seatView } from "./state/seats";
import { faceOf, pieceDef } from "./state/objects";
import { saveFileName, savedTable } from "./state/saveFile";
import { initialState } from "./state/actions";
import { fetchGameState, joinGame, startGame } from "./server/api";
import { connectGame } from "./server/sync";
import { NameForm } from "./ui/NameForm";
import { magnifiable, visibleSide } from "./state/visibility";
import { SeatPicker } from "./ui/SeatPicker";
import { HandStrip } from "./ui/HandStrip";
import { Magnifier } from "./ui/Magnifier";
import { ContextMenu } from "./ui/ContextMenu";
import { Toolbar } from "./ui/Toolbar";
import { HelpPanel } from "./ui/HelpPanel";
import { ReorderPanel } from "./ui/ReorderPanel";
import { ContainerSearch } from "./ui/SearchPanel";
import { WritingPanel } from "./ui/WritingPanel";
import { RaceChip } from "./ui/RaceChip";
import { ActionBar } from "./ui/ActionBar";

const ACTION_BAR_SETTING = "simple-tabletop:desktop-action-bar";
// In the sandbox, one browser is one player.
const SANDBOX_PLAYER_ID = "local";
const HAND_STRIP_SETTING = "simple-tabletop:hand-strip";
const TRAY_SCATTER_SETTING = "simple-tabletop:tray-roll-scatters";
const SOUND_SETTING = "simple-tabletop:sound";
const UNSEATED_COLOR = "#555555";

// game is { token, name, player } for a game on the server, or null for the
// sandbox, which keeps everything in this browser.
export default function App({ manifestUrl, game = null }) {
  const gameId = game?.token || "sandbox";
  const [player, setPlayer] = useState(game ? game.player : { id: SANDBOX_PLAYER_ID });
  const playerId = player?.id || null;
  const [serverState, setServerState] = useState(null);
  const [hosting, setHosting] = useState(false);
  const [replaced, setReplaced] = useState(false); // this player opened the game somewhere else
  const [roster, setRoster] = useState([]); // [{ id, name, host }]
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const [raceChip, setRaceChip] = useState(null);
  const viewport = useViewportMode();
  const layout = viewport.isPortraitPhone ? "portrait" : viewport.isLandscapePhone ? "landscape" : "desktop";

  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [scene, setScene] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reordering, setReordering] = useState(null); // { deckId, count }, count null for the whole deck
  const [searching, setSearching] = useState(null); // a deck or bag id
  const [writing, setWriting] = useState(null); // a note or score sheet id
  const [desktopActionBar, setDesktopActionBar] = useStoredFlag(ACTION_BAR_SETTING, false);
  const [handStripVisible, setHandStripVisible] = useStoredFlag(HAND_STRIP_SETTING, true);
  const [trayRollScatters, setTrayRollScatters] = useStoredFlag(TRAY_SCATTER_SETTING, true);
  const [soundOn, setSoundOn] = useStoredFlag(SOUND_SETTING, true);
  const [hovered, setHovered] = useState(null);
  const [magnifyMode, setMagnifyMode] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [tuckMode, setTuckMode] = useState(false);
  const [magnified, setMagnified] = useState(null);
  const altHeld = useMagnifyKey();
  const showActionBar = layout !== "desktop" || desktopActionBar;

  useEffect(() => {
    let cancelled = false;
    fetchManifest(manifestUrl).then(
      (loaded) => {
        if (cancelled) return;
        setManifest(loaded);
        rememberModule({ url: new URL(manifestUrl, window.location.href).href, name: loaded.name, version: loaded.version });
      },
      (err) => !cancelled && setError(err)
    );
    return () => { cancelled = true; };
  }, [manifestUrl]);

  useEffect(() => {
    if (!game) return undefined;
    let cancelled = false;
    fetchGameState(game.token).then(
      (loaded) => !cancelled && setServerState(loaded),
      (err) => !cancelled && setError(err)
    );
    return () => { cancelled = true; };
  }, [game]);

  const store = useMemo(() => {
    if (!manifest || (game && !serverState)) return null;
    if (!serverState) return createTableStore(manifest);
    const { sequence, seating, players, pieces, containers } = serverState;
    return createTableStore(manifest, { sequence, seating, players, pieces, containers }, { synced: true });
  }, [manifest, game, serverState]);

  useEffect(() => {
    if (serverState) setRoster(serverState.roster);
  }, [serverState]);

  // Once this browser has a player in the game, it syncs with the server.
  useEffect(() => {
    if (!game || !player || !store || replaced) return undefined;
    return connectGame(game.token, store, { onRoster: setRoster, onReplaced: () => setReplaced(true) });
  }, [game, player, store, replaced]);

  const nameOf = useCallback((id) => rosterRef.current.find((each) => each.id === id)?.name || null, []);
  const showLostRace = useCallback(({ holder, clientX, clientY }) => {
    const color = playerColor(manifest, store.getState(), holder) || UNSEATED_COLOR;
    setRaceChip({ name: nameOf(holder) || "Someone else", color, x: clientX, y: clientY });
  }, [manifest, store, nameOf]);
  const hideRaceChip = useCallback(() => setRaceChip(null), []);

  const join = useCallback(async ({ name }) => setPlayer(await joinGame(game.token, name)), [game]);
  // Downloads the table as a file a new table can start from.
  const saveTable = useCallback(() => {
    const save = savedTable({ manifestUrl: new URL(manifestUrl, window.location.href).href, manifest, state: store.getState() });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: "application/json" }));
    link.download = saveFileName(manifest, save.savedAt);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  }, [manifestUrl, manifest, store]);
  const host = useCallback(async ({ name, gameName }) => {
    const { path } = await startGame({ manifestUrl, name: gameName, playerName: name, state: initialState(manifest) });
    window.location.assign(path);
  }, [manifestUrl, manifest]);
  useEffect(() => {
    // Console handles on table state and the scene. Clients are trusted, so
    // they hide nothing.
    window.tableStore = store;
    window.tableScene = scene;
  }, [store, scene]);

  const seatId = useStoreValue(store, (state) => seatOf(state, playerId));
  const seats = useStoreValue(
    store,
    (state) => openSeats(manifest, state).map((seat) => ({ id: seat.id, name: seatName(manifest, state, seat), color: seat.color })),
    (a, b) => sameIds(a?.map((seat) => seat.name), b?.map((seat) => seat.name))
  );
  const myHand = useStoreValue(store, (state) => {
    const mine = seatOf(state, playerId);
    return (mine && state.containers[handId(mine)]?.members) || [];
  }, sameIds);
  const seated = Boolean(seatId);
  const seat = manifest?.seats.find((s) => s.id === seatId) || null;

  // Your seat's view: its own camera for the slot, or the view from its side.
  const seatCamera = useCallback((slot) => {
    if (!seat || !store) return scene?.startingView;
    return seat.cameras[slot] || seatView(manifest, store.getState(), seat);
  }, [seat, store, manifest, scene]);

  const cameraPoints = useMemo(() => {
    const slots = new CameraSlots(localStorage, gameId);
    return {
      jump: (slot) => {
        const view = scene && (slots.load(slot) || seatCamera(slot));
        if (view) scene.setCameraView(view);
      },
      save: (slot) => scene && slots.save(slot, scene.cameraView()),
    };
  }, [scene, gameId, seatCamera]);

  // Taking a seat turns your hand face-up and moves the camera behind you.
  const seatCameraRef = useRef(seatCamera);
  seatCameraRef.current = seatCamera;
  useEffect(() => {
    scene?.setViewer(seatId);
    if (scene && seatId) scene.setCameraView(seatCameraRef.current("1"));
  }, [scene, seatId]);

  const sounds = useTableSounds(manifest, store);
  useEffect(() => {
    if (sounds) sounds.enabled = soundOn;
  }, [sounds, soundOn]);
  useEffect(() => {
    if (interaction) Object.assign(interaction, { magnifyMode, selectMode, tuckMode });
  }, [interaction, magnifyMode, selectMode, tuckMode]);
  useEffect(() => {
    if (interaction) interaction.nameOf = nameOf;
  }, [interaction, nameOf]);
  useEffect(() => {
    scene?.setRoster(roster);
  }, [scene, roster]);
  useEffect(() => {
    if (interaction) interaction.relocateOnTrayRoll = trayRollScatters;
  }, [interaction, trayRollScatters]);
  const selectedObject = useSelectedObject(store, playerId);
  const selectedObjects = useSelectedObjects(store, playerId);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = useCallback((menu) => {
    setOpenMenu(null);
    setContextMenu(menu);
  }, []);
  const toggleHelp = useCallback(() => {
    setOpenMenu(null);
    setHelpOpen((open) => !open);
  }, []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const onEscape = useCallback(() => {
    if (writing) setWriting(null);
    else if (searching) setSearching(null);
    else if (reordering) setReordering(null);
    else if (helpOpen) setHelpOpen(false);
    else if (openMenu) setOpenMenu(null);
    else if (contextMenu) setContextMenu(null);
    else if (magnified) setMagnified(null);
    else interaction?.cancelSelection();
  }, [writing, searching, reordering, helpOpen, openMenu, contextMenu, magnified, interaction]);
  const startReorder = useCallback((deckId, count = null) => {
    setOpenMenu(null);
    setReordering({ deckId, count });
  }, []);
  const closeReorder = useCallback(() => setReordering(null), []);
  const startSearch = useCallback((containerId) => {
    setOpenMenu(null);
    setSearching(containerId);
  }, []);
  const closeSearch = useCallback(() => setSearching(null), []);
  const startWriting = useCallback((pieceId) => {
    setOpenMenu(null);
    setWriting(pieceId);
  }, []);
  const closeWriting = useCallback(() => setWriting(null), []);
  const tableInteraction = seated ? interaction : null;
  useTableKeys({ scene, cameraPoints, interaction: tableInteraction, onEscape, onHelp: toggleHelp });

  const sit = useCallback((id) => store.dispatch({ type: "join", playerId: playerId, seatId: id }), [store, playerId]);
  const leave = useCallback(() => {
    setOpenMenu(null);
    store.dispatch({ type: "leave", playerId: playerId });
  }, [store, playerId]);

  // Alt magnifies what's under the mouse, or what you hold. On touch, a tap
  // in magnify mode or the menu's Magnify sets `magnified`.
  const magnifyTarget = magnified || (altHeld && seated ? hovered || selectedObject : null);
  const magnifiedSide = store && manifest && magnifiable(manifest, store.getState(), magnifyTarget)
    ? visibleSide(manifest, store.getState(), magnifyTarget, seatId)
    : null;
  const handCards = store && manifest
    ? myHand.map((id) => ({ id, side: visibleSide(manifest, store.getState(), id, seatId) }))
    : [];
  const showHandStrip = seated && manifest?.hands.enabled && handStripVisible;

  useCloseMenuOnOutsideClick(openMenu, setOpenMenu);
  useCloseMenuOnOutsideClick(contextMenu, closeContextMenu);
  const menus = { openMenu, setOpenMenu };

  return (
    <div className={`app layout-${layout}`}>
      <Toolbar
        title={manifest?.name || "Simple Tabletop"}
        documents={manifest?.documents}
        onSave={manifest && store ? saveTable : null}
        layout={layout}
        menus={menus}
        showActionBar={desktopActionBar}
        setShowActionBar={setDesktopActionBar}
        seatName={seat && store ? seatName(manifest, store.getState(), seat) : null}
        onLeaveSeat={leave}
        handsEnabled={Boolean(manifest?.hands.enabled && seated)}
        handStripVisible={handStripVisible}
        setHandStripVisible={setHandStripVisible}
        soundOn={soundOn}
        setSoundOn={setSoundOn}
        trayRollScatters={trayRollScatters}
        setTrayRollScatters={setTrayRollScatters}
        helpOpen={helpOpen}
        setHelpOpen={toggleHelp}
        game={game}
        onHost={manifest ? () => { setOpenMenu(null); setHosting(true); } : null}
      />
      <main className="table-area">
        <TableCanvas
          manifest={manifest}
          store={store}
          playerId={playerId}
          onScene={setScene}
          onInteraction={setInteraction}
          onContextMenu={openContextMenu}
          onHover={setHovered}
          onMagnify={setMagnified}
          onLostRace={showLostRace}
          onError={setError}
        />
        {showHandStrip && interaction && (
          <HandStrip cards={handCards} selectedIds={selectedObjects} selectMode={selectMode} interaction={interaction}
            canvas={scene?.canvas} />
        )}
        {store && player && !seated && !replaced && <SeatPicker seats={seats || []} onPick={sit} />}
        {replaced && (
          <div className="seat-picker" role="dialog" aria-label="Open somewhere else">
            <div className="seat-picker-panel">
              <h2>This game is open in another tab</h2>
              <button type="button" className="menu-item" onClick={() => setReplaced(false)}>Play here instead</button>
            </div>
          </div>
        )}
        {game && !player && <NameForm title={`Join ${game.name}`} submitLabel="Join" onSubmit={join} />}
        {hosting && (
          <NameForm title="Host this table" askGameName submitLabel="Start" onSubmit={host} onCancel={() => setHosting(false)} />
        )}
        {magnifiedSide && <Magnifier side={magnifiedSide} onClose={magnified ? () => setMagnified(null) : null} />}
        {error && <div className="table-error" role="alert">{error.message}</div>}
        {raceChip && <RaceChip chip={raceChip} onDone={hideRaceChip} />}
      </main>
      {contextMenu && interaction && (
        <ContextMenu
          menu={contextMenu}
          interaction={interaction}
          popover={contextMenu.pointerType === "touch" || layout !== "desktop"}
          onMagnify={setMagnified}
          onReorder={startReorder}
          onSearch={startSearch}
          onWrite={startWriting}
          onClose={closeContextMenu}
        />
      )}
      {helpOpen && <HelpPanel touch={layout !== "desktop"} onClose={closeHelp} />}
      {reordering && interaction && store.getState().containers[reordering.deckId] && (
        <ReorderPanel
          cards={store.getState().containers[reordering.deckId].members.slice(0, reordering.count ?? undefined).map((id) => {
            const def = pieceDef(manifest, id);
            return { id, label: def.id, side: { image: faceOf(def, store.getState().pieces[id]), size: def.size } };
          })}
          partial={reordering.count != null}
          onSave={(order) => (reordering.count == null
            ? interaction.reorder(reordering.deckId, order)
            : interaction.reorderTop(reordering.deckId, order))}
          onClose={closeReorder}
        />
      )}
      {writing && interaction && (
        <WritingPanel store={store} interaction={interaction} pieceId={writing} onClose={closeWriting} />
      )}
      {searching && interaction && (
        <ContainerSearch store={store} manifest={manifest} interaction={interaction} containerId={searching} onClose={closeSearch} />
      )}
      {showActionBar && (
        <ActionBar
          scene={scene}
          interaction={interaction}
          selectedObject={selectedObject}
          magnifyMode={magnifyMode}
          setMagnifyMode={setMagnifyMode}
          selectMode={selectMode}
          setSelectMode={setSelectMode}
          tuckMode={tuckMode}
          setTuckMode={setTuckMode}
          cameraPoints={cameraPoints}
          menus={menus}
          onReorder={startReorder}
          onSearch={startSearch}
          onWrite={startWriting}
        />
      )}
    </div>
  );
}

// Plays a sound for each action on the table, yours or anyone's.
function useTableSounds(manifest, store) {
  const [sounds, setSounds] = useState(null);
  useEffect(() => {
    const created = new TableSounds();
    setSounds(created);
    return () => created.dispose();
  }, []);
  useEffect(() => {
    if (!sounds || !store) return undefined;
    return store.subscribe((state, action) => action && sounds.play(soundFor(manifest, state, action)));
  }, [sounds, manifest, store]);
  return sounds;
}

function useStoredFlag(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored == null ? fallback : stored === "true";
    } catch {
      return fallback;
    }
  });
  const update = useCallback((next) => {
    setValue(next);
    try {
      localStorage.setItem(key, String(next));
    } catch {
      // Storage can be blocked; the setting just won't persist.
    }
  }, [key]);
  return [value, update];
}

function useCloseMenuOnOutsideClick(openMenu, setOpenMenu) {
  useEffect(() => {
    if (!openMenu) return undefined;
    const onPointerDown = (event) => {
      if (!event.target.closest?.(".menu")) setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu, setOpenMenu]);
}
