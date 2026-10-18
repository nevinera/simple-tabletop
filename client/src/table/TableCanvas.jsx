import { useEffect, useRef, useState } from "react";
import { TableScene } from "./scene";

// Mounts a TableScene, hands it to the parent through onScene, and shows the
// manifest on it.
export default function TableCanvas({ manifest, onScene, onError }) {
  const containerRef = useRef(null);
  const [scene, setScene] = useState(null);

  useEffect(() => {
    const created = new TableScene(containerRef.current);
    setScene(created);
    onScene(created);
    return () => {
      onScene(null);
      created.dispose();
    };
  }, [onScene]);

  useEffect(() => {
    if (scene && manifest) scene.show(manifest).catch(onError);
  }, [scene, manifest, onError]);

  return <div className="table-canvas" ref={containerRef} />;
}
