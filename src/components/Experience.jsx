import { OrbitControls, Environment, useTexture } from "@react-three/drei";
import { Avatar } from "./Avatar";
import { useThree } from "@react-three/fiber";

export const Experience = () => {

    const textures = useTexture("textures/preventor.png")
    const viewport = useThree((state) => state.viewport)

  return (
    <>
      <OrbitControls target={[0, 1, 0]} />
      <mesh position={[0, 1, -1.5]}>
        <planeGeometry args={[viewport.width * 1.5, viewport.height * 1.5]} />
        <meshBasicMaterial map={textures} depthWrite={true} depthTest={true} />
      </mesh>
      <Avatar position={[0, -1.5, 0]} scale={2} />
      <Environment preset="sunset" />
    </>
  );
};