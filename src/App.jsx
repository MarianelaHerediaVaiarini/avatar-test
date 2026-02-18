import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { OrbitControls } from "@react-three/drei";
import { Experience } from "./components/Experience";
import { div } from "three/tsl";

export default function App() {
  return (
    
      <Canvas shadows camera={{ position: [0, 1.1, 3.2], fov: 45 }}>
        <Experience/>
      </Canvas>
  );
}
