import { useEffect, useState } from "react";
import { isTypingTarget } from "./table/keys";

// Whether Alt (Option on a Mac) is held. Pointer events carry altKey too, so
// a key-up lost to another window can't leave it stuck.
export function useMagnifyKey() {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== "Alt") return;
      // A lone Alt press would otherwise focus the browser's menu on Windows.
      if (!isTypingTarget(event.target)) event.preventDefault();
      setHeld(event.type === "keydown");
    };
    const onPointer = (event) => setHeld(event.altKey);
    const onBlur = () => setHeld(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return held;
}
