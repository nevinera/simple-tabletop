import { useEffect, useRef, useState } from "react";
import { TableScene } from "./scene";

// Mounts a TableScene, hands it to the parent through onScene, shows the
// manifest on it, and re-renders pieces whenever the store changes.
export default function TableCanvas({ manifest, store, onScene, onError }) {
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

  useEffect(() => {
    if (!scene || !store) return undefined;
    scene.render(store.getState());
    return store.subscribe((state) => scene.render(state));
  }, [scene, store]);

  return <div className="table-canvas" ref={containerRef} />;
}
