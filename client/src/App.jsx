import { useCallback, useEffect, useMemo, useState } from "react";
import TableCanvas from "./table/TableCanvas";
import { CameraSlots } from "./table/cameraSlots";
import { fetchManifest } from "./manifest/manifest";
import { createTableStore } from "./state/store";
import { useViewportMode } from "./useViewportMode";
import { useTableKeys } from "./useTableKeys";
import { useSelectedPiece } from "./useSelectedPiece";
import { ContextMenu } from "./ui/ContextMenu";
import { Toolbar } from "./ui/Toolbar";
import { ActionBar } from "./ui/ActionBar";
import { Joysticks } from "./ui/Joysticks";

const ACTION_BAR_SETTING = "simple-tabletop:desktop-action-bar";
// Everyone is the same local player until seats exist.
const LOCAL_PLAYER_ID = "local";

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
  const [desktopActionBar, setDesktopActionBar] = useDesktopActionBarSetting();
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

  const cameraPoints = useMemo(() => {
    const slots = new CameraSlots(localStorage, gameId);
    return {
      // Seat cameras from the manifest will slot in here once seats exist.
      jump: (slot) => {
        const view = scene && (slots.load(slot) || scene.startingView);
        if (view) scene.setCameraView(view);
      },
      save: (slot) => scene && slots.save(slot, scene.cameraView()),
    };
  }, [scene, gameId]);
  const selectedPiece = useSelectedPiece(store, LOCAL_PLAYER_ID);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = useCallback((menu) => {
    setOpenMenu(null);
    setContextMenu(menu);
  }, []);
  const onEscape = useCallback(() => {
    if (openMenu) setOpenMenu(null);
    else if (contextMenu) setContextMenu(null);
    else interaction?.cancelSelection();
  }, [openMenu, contextMenu, interaction]);
  useTableKeys({ scene, cameraPoints, interaction, onEscape });

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
      />
      <main className="table-area">
        <TableCanvas
          manifest={manifest}
          store={store}
          playerId={LOCAL_PLAYER_ID}
          onScene={setScene}
          onInteraction={setInteraction}
          onContextMenu={openContextMenu}
          onError={setError}
        />
        {joysticksVisible && <Joysticks scene={scene} onIdle={hideJoysticks} />}
        {error && <div className="table-error" role="alert">{error.message}</div>}
      </main>
      {contextMenu && interaction && (
        <ContextMenu
          menu={contextMenu}
          interaction={interaction}
          popover={contextMenu.pointerType === "touch" || layout !== "desktop"}
          onClose={closeContextMenu}
        />
      )}
      {showActionBar && (
        <ActionBar
          scene={scene}
          interaction={interaction}
          selectedPiece={selectedPiece}
          cameraPoints={cameraPoints}
          menus={menus}
          joysticksVisible={joysticksVisible}
          setJoysticksVisible={setJoysticksVisible}
        />
      )}
    </div>
  );
}

function useDesktopActionBarSetting() {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(ACTION_BAR_SETTING) === "true";
    } catch {
      return false;
    }
  });
  const update = useCallback((next) => {
    setValue(next);
    try {
      localStorage.setItem(ACTION_BAR_SETTING, String(next));
    } catch {
      // Storage can be blocked; the setting just won't persist.
    }
  }, []);
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
