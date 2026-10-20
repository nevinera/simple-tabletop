import { useLayoutEffect, useRef, useState } from "react";
import { ObjectActions } from "./ObjectActions";

const EDGE_GAP = 8; // px kept between the menu and the window edge

// An object's menu: at the cursor for a right-click, or as a centered popover
// for a touch hold (and on phone layouts).
export function ContextMenu({ menu, interaction, popover, onMagnify, onReorder, onSearch, onClose }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: menu.clientX, top: menu.clientY });

  // Keep the menu on screen near the window's right and bottom edges.
  useLayoutEffect(() => {
    if (popover || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPosition({
      left: Math.max(EDGE_GAP, Math.min(menu.clientX, window.innerWidth - width - EDGE_GAP)),
      top: Math.max(EDGE_GAP, Math.min(menu.clientY, window.innerHeight - height - EDGE_GAP)),
    });
  }, [menu, popover]);

  return (
    <div
      ref={ref}
      className={`context-menu menu${popover ? " context-menu-popover" : ""}`}
      role="menu"
      aria-label="Actions"
      style={popover ? undefined : position}
      onContextMenu={(event) => event.preventDefault()}
    >
      <ObjectActions interaction={interaction} objectId={menu.objectId} onMagnify={onMagnify} onReorder={onReorder} onSearch={onSearch} onDone={onClose} />
    </div>
  );
}
