import { useLayoutEffect, useRef, useState } from "react";
import { PieceActions } from "./PieceActions";

const EDGE_GAP = 8; // px kept between the menu and the window edge

// A piece's menu: at the cursor for a right-click, or as a centered popover
// for a touch hold (and on phone layouts).
export function ContextMenu({ menu, interaction, popover, onClose }) {
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
      aria-label="Piece"
      style={popover ? undefined : position}
      onContextMenu={(event) => event.preventDefault()}
    >
      <PieceActions interaction={interaction} pieceId={menu.pieceId} onDone={onClose} />
    </div>
  );
}
