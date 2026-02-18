import { OrbitControls, Environment } from "@react-three/drei";
import { Avatar } from "./Avatar";

export const Experience = () => {
  return (
    <>
      <OrbitControls target={[0, 1, 0]} />
      <Avatar position={[0, -1.5, 0]} scale={2} />
      <Environment preset="sunset" />
    </>
  );
};