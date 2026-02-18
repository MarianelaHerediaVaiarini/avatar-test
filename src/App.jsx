import { Canvas } from "@react-three/fiber";
import { Experience } from "./components/Experience";

export default function App() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundImage: "url(/textures/preventor.png)",
        backgroundSize: "cover",
        backgroundPosition: "top left",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Canvas shadows camera={{ position: [0, 1.1, 3.2], fov: 45 }} style={{ background: "transparent" }}>
        <Experience />
      </Canvas>
    </div>
  );
}
