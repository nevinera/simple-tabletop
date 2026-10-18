import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TableCanvas from "./table/TableCanvas";
import { CameraSlots } from "./table/cameraSlots";
import { fetchManifest } from "./manifest/manifest";
import { createTableStore } from "./state/store";
import { useViewportMode } from "./useViewportMode";
import { useTableKeys } from "./useTableKeys";
import { useSelectedObject } from "./useSelectedObject";
import { sameIds, useStoreValue } from "./useStoreValue";
import { useMagnifyKey } from "./useMagnifyKey";
import { handId, openSeats, seatName, seatOf, seatView } from "./state/seats";
import { magnifiable, visibleSide } from "./state/visibility";
import { SeatPicker } from "./ui/SeatPicker";
import { HandStrip } from "./ui/HandStrip";
import { Magnifier } from "./ui/Magnifier";
import { ContextMenu } from "./ui/ContextMenu";
import { Toolbar } from "./ui/Toolbar";
import { ActionBar } from "./ui/ActionBar";
import { Joysticks } from "./ui/Joysticks";

const ACTION_BAR_SETTING = "simple-tabletop:desktop-action-bar";
// One browser is one player until the server hands out player ids.
const LOCAL_PLAYER_ID = "local";
const HAND_STRIP_SETTING = "simple-tabletop:hand-strip";

export default function App({ manifestUrl, gameId = "sandbox" }) {
  const viewport = useViewportMode();
  const layout = viewport.isPortraitPhone ? "portrait" : viewport.isLandscapePhone ? "landscape" : "desktop";

  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const [scene, setScene] = useState(null);
  const [interaction, setInteraction] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [joysticksVisible, setJoysticksVisible] = useState(false);
  const [desktopActionBar, setDesktopActionBar] = useStoredFlag(ACTION_BAR_SETTING, false);
  const [handStripVisible, setHandStripVisible] = useStoredFlag(HAND_STRIP_SETTING, true);
  const [hovered, setHovered] = useState(null);
  const [magnifyMode, setMagnifyMode] = useState(false);
  const [magnified, setMagnified] = useState(null);
  const altHeld = useMagnifyKey();
  const showActionBar = layout !== "desktop" || desktopActionBar;

  useEffect(() => {
    let cancelled = false;
    fetchManifest(manifestUrl).then(
      (loaded) => !cancelled && setManifest(loaded),
      (err) => !cancelled && setError(err)
    );
    return () => { cancelled = true; };
  }, [manifestUrl]);

  const store = useMemo(() => (manifest ? createTableStore(manifest) : null), [manifest]);
  useEffect(() => {
    // A console handle on table state. Clients are trusted, so it hides nothing.
    window.tableStore = store;
  }, [store]);

  const seatId = useStoreValue(store, (state) => seatOf(state, LOCAL_PLAYER_ID));
  const seats = useStoreValue(
    store,
    (state) => openSeats(manifest, state).map((seat) => ({ id: seat.id, name: seatName(manifest, state, seat), color: seat.color })),
    (a, b) => sameIds(a?.map((seat) => seat.name), b?.map((seat) => seat.name))
  );
  const myHand = useStoreValue(store, (state) => {
    const mine = seatOf(state, LOCAL_PLAYER_ID);
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

  useEffect(() => {
    if (interaction) interaction.magnifyMode = magnifyMode;
  }, [interaction, magnifyMode]);
  const selectedObject = useSelectedObject(store, LOCAL_PLAYER_ID);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = useCallback((menu) => {
    setOpenMenu(null);
    setContextMenu(menu);
  }, []);
  const onEscape = useCallback(() => {
    if (openMenu) setOpenMenu(null);
    else if (contextMenu) setContextMenu(null);
    else if (magnified) setMagnified(null);
    else interaction?.cancelSelection();
  }, [openMenu, contextMenu, magnified, interaction]);
  const tableInteraction = seated ? interaction : null;
  useTableKeys({ scene, cameraPoints, interaction: tableInteraction, onEscape });

  const join = useCallback((id) => store.dispatch({ type: "join", playerId: LOCAL_PLAYER_ID, seatId: id }), [store]);
  const leave = useCallback(() => {
    setOpenMenu(null);
    store.dispatch({ type: "leave", playerId: LOCAL_PLAYER_ID });
  }, [store]);

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
  const hideJoysticks = useCallback(() => setJoysticksVisible(false), []);

  return (
    <div className={`app layout-${layout}`}>
      <Toolbar
        title={manifest?.name || "Simple Tabletop"}
        layout={layout}
        menus={menus}
        showActionBar={desktopActionBar}
        setShowActionBar={setDesktopActionBar}
        seatName={seat && store ? seatName(manifest, store.getState(), seat) : null}
        onLeaveSeat={leave}
        handsEnabled={Boolean(manifest?.hands.enabled && seated)}
        handStripVisible={handStripVisible}
        setHandStripVisible={setHandStripVisible}
      />
      <main className="table-area">
        <TableCanvas
          manifest={manifest}
          store={store}
          playerId={LOCAL_PLAYER_ID}
          onScene={setScene}
          onInteraction={setInteraction}
          onContextMenu={openContextMenu}
          onHover={setHovered}
          onMagnify={setMagnified}
          onError={setError}
        />
        {joysticksVisible && <Joysticks scene={scene} onIdle={hideJoysticks} />}
        {showHandStrip && interaction && (
          <HandStrip cards={handCards} selectedId={selectedObject} interaction={interaction} canvas={scene?.canvas} />
        )}
        {store && !seated && <SeatPicker seats={seats || []} onPick={join} />}
        {magnifiedSide && <Magnifier side={magnifiedSide} onClose={magnified ? () => setMagnified(null) : null} />}
        {error && <div className="table-error" role="alert">{error.message}</div>}
      </main>
      {contextMenu && interaction && (
        <ContextMenu
          menu={contextMenu}
          interaction={interaction}
          popover={contextMenu.pointerType === "touch" || layout !== "desktop"}
          onMagnify={setMagnified}
          onClose={closeContextMenu}
        />
      )}
      {showActionBar && (
        <ActionBar
          scene={scene}
          interaction={interaction}
          selectedObject={selectedObject}
          magnifyMode={magnifyMode}
          setMagnifyMode={setMagnifyMode}
          cameraPoints={cameraPoints}
          menus={menus}
          joysticksVisible={joysticksVisible}
          setJoysticksVisible={setJoysticksVisible}
        />
      )}
    </div>
  );
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
