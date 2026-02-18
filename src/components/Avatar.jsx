import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useGraph } from "@react-three/fiber";
import { useAnimations, useFBX, useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import { useControls } from "leva";
import * as THREE from "three";

const corresponding = {
  X: "viseme_sil",
  A: "viseme_aa",
  B: "viseme_E",
  C: "viseme_I",
  D: "viseme_O",
  E: "viseme_U",
  F: "viseme_FF",
  G: "viseme_nn", // prueba nn primero; si no te gusta cambia a DD
  H: "viseme_TH",
};

// Intensidad por visema (ajústalo a gusto)
const strength = {
  viseme_sil: 0.0,
  viseme_PP: 0.9,
  viseme_FF: 0.75,
  viseme_TH: 0.7,
  viseme_DD: 0.6,
  viseme_kk: 0.6,
  viseme_CH: 0.7,
  viseme_SS: 0.6,
  viseme_nn: 0.6,
  viseme_RR: 0.6,
  viseme_aa: 1.0,
  viseme_E: 0.8,
  viseme_I: 0.7,
  viseme_O: 0.9,
  viseme_U: 0.8,
};

function expSmoothing(current, target, dt, k) {
  // k mayor = más rápido
  const t = 1 - Math.exp(-k * dt);
  return current + (target - current) * t;
}

export function Avatar(props) {
  const { scene } = useGLTF("/models/69941ed6d4b48fd6efb1f2bc.glb");
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes, materials } = useGraph(clone);

  const group = useRef();

  // UI
  const { playAudio, script } = useControls({
    playAudio: false,
    script: {
      value: "audio_4",
      options: ["audio_1", "audio_2", "audio_3", "audio_4"],
    },
  });

  // Audio: crea uno nuevo cuando cambia script
  const audio = useMemo(() => new Audio(`/audios/${script}.mp3`), [script]);

  // JSON lipsync: fetch manual para NO disparar Suspense al cambiar script
  const [lipsync, setLipsync] = useState(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/audios/${script}.json`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setLipsync(data);
      });
    return () => { cancelled = true; };
  }, [script]);

  // Animaciones
  const { animations: standingGreetingAnimation } = useFBX("/animations/Standing Greeting.fbx");
  const { animations: idleAnimation } = useFBX("/animations/Idle.fbx");
  const { animations: standingIdleAnimation } = useFBX("/animations/Standing Idle.fbx");

  // Memoizar clips para estabilizar useAnimations
  const allAnimations = useMemo(() => {
    const idle = idleAnimation[0].clone();
    const greet = standingGreetingAnimation[0].clone();
    const standIdle = standingIdleAnimation[0].clone();
    idle.name = "Idle";
    greet.name = "StandingGreeting";
    standIdle.name = "StandingIdle";
    return [idle, greet, standIdle];
  }, [idleAnimation, standingGreetingAnimation, standingIdleAnimation]);

  const { actions } = useAnimations(allAnimations, group);

  // ——— Blend suave entre Idle y StandingIdle ———
  // Ambas animaciones corren siempre. Variamos los pesos con smoothing.
  const blendRef = useRef({
    targetWeight: 0,     // 0 = 100% Idle, 1 = 100% StandingIdle
    currentWeight: 0,
    nextChangeAt: 8 + Math.random() * 6, // primera variación entre 8-14s
  });

  // Arranca ambas animaciones simultáneamente
  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;

    // Idle: loop normal, peso 1
    if (actions.Idle) {
      actions.Idle.reset().play();
      actions.Idle.setEffectiveWeight(1);
    }

    // StandingIdle: loop, peso 0 (silenciada al inicio)
    if (actions.StandingIdle) {
      actions.StandingIdle.reset().play();
      actions.StandingIdle.setEffectiveWeight(0);
    }
  }, [actions]);

  // Refs para performance
  const cueIndexRef = useRef(0);
  const currentVisemeRef = useRef("viseme_sil");

  // Precalcula diccionarios/targets una sola vez
  const headDict = nodes?.Wolf3D_Head?.morphTargetDictionary;
  const headInfluences = nodes?.Wolf3D_Head?.morphTargetInfluences;
  const teethDict = nodes?.Wolf3D_Teeth?.morphTargetDictionary;
  const teethInfluences = nodes?.Wolf3D_Teeth?.morphTargetInfluences;

  // ——— Parpadeo natural (morph target eyesClosed) ———
  const blinkRef = useRef({
    nextBlinkAt: 2 + Math.random() * 3,
    phase: "idle",
    progress: 0,
    closeDuration: 0.06,
    openDuration: 0.10,
  });

  // Indices de morph target eyesClosed en cada mesh que lo tenga
  const eyesClosedIndices = useMemo(() => {
    const result = [];
    ["Wolf3D_Head", "EyeLeft", "EyeRight"].forEach((name) => {
      const mesh = nodes?.[name];
      if (mesh?.morphTargetDictionary?.eyesClosed !== undefined) {
        result.push({
          influences: mesh.morphTargetInfluences,
          index: mesh.morphTargetDictionary.eyesClosed,
        });
      }
    });
    return result;
  }, [nodes]);

  const visemeNames = useMemo(() => Object.values(corresponding), []);
  const visemeIndices = useMemo(() => {
    // devuelve map: visemeName -> { headIndex, teethIndex }
    const map = {};
    for (const v of visemeNames) {
      map[v] = {
        head: headDict?.[v],
        teeth: teethDict?.[v],
      };
    }
    return map;
  }, [headDict, teethDict, visemeNames]);

  // Play / pause
  useEffect(() => {
    // reset de estado cuando cambias script
    cueIndexRef.current = 0;
    currentVisemeRef.current = "viseme_sil";
    audio.currentTime = 0;

    if (playAudio) audio.play();
    else audio.pause();

    // cleanup para evitar que queden audios sonando
    return () => {
      audio.pause();
    };
  }, [playAudio, script, audio]);

  // Lipsync + parpadeo + blend de idles
  useFrame((state, dt) => {
    const elapsed = state.clock.elapsedTime;

    // ——— Blend suave entre Idle y StandingIdle ———
    const blend = blendRef.current;
    if (elapsed >= blend.nextChangeAt) {
      // Alternar: si estaba en Idle (0), ir a StandingIdle (1) y viceversa
      blend.targetWeight = blend.targetWeight < 0.5 ? 1 : 0;
      // Próximo cambio entre 8-15 segundos
      blend.nextChangeAt = elapsed + 8 + Math.random() * 7;
    }

    // Smoothing muy suave para que el blend sea imperceptible
    blend.currentWeight = expSmoothing(blend.currentWeight, blend.targetWeight, dt, 1.5);

    if (actions?.Idle) actions.Idle.setEffectiveWeight(1 - blend.currentWeight);
    if (actions?.StandingIdle) actions.StandingIdle.setEffectiveWeight(blend.currentWeight);

    // ——— Parpadeo natural (escala Y de los ojos) ———
    const blink = blinkRef.current;
    if (blink.phase === "idle" && elapsed >= blink.nextBlinkAt) {
      blink.phase = "closing";
      blink.progress = 0;
      blink.doubleAt = Math.random() < 0.2 ? elapsed + 0.25 : null;
    }

    if (blink.phase === "closing") {
      blink.progress += dt / blink.closeDuration;
      if (blink.progress >= 1) {
        blink.progress = 1;
        blink.phase = "opening";
      }
    } else if (blink.phase === "opening") {
      blink.progress -= dt / blink.openDuration;
      if (blink.progress <= 0) {
        blink.progress = 0;
        blink.phase = "idle";
        if (blink.doubleAt && elapsed < blink.doubleAt + 0.3) {
          blink.nextBlinkAt = elapsed + 0.15;
          blink.doubleAt = null;
        } else {
          blink.nextBlinkAt = elapsed + 2 + Math.random() * 4;
        }
      }
    }

    // Aplicar parpadeo via morph target eyesClosed
    for (const entry of eyesClosedIndices) {
      entry.influences[entry.index] = blink.progress;
    }

    // ——— Lipsync ———
    if (!headInfluences || !teethInfluences || !lipsync?.mouthCues?.length) return;

    const t = audio.currentTime;

    // 1) Avanza el índice sin recorrer todo el array
    let i = cueIndexRef.current;
    const cues = lipsync.mouthCues;

    // Si el usuario reinició el audio hacia atrás, resetea índice
    if (i > 0 && t < cues[i - 1].start) i = 0;

    while (i < cues.length - 1 && t > cues[i].end) i++;
    cueIndexRef.current = i;

    const cue = cues[i];
    const rhubarbKey = cue && t >= cue.start && t <= cue.end ? cue.value : "X";
    const targetViseme = corresponding[rhubarbKey] ?? "viseme_sil";
    currentVisemeRef.current = targetViseme;

    // 2) Calcula targets (solo 1 visema activo) y hace smoothing
    const attack = 18;  // sube rápido
    const release = 12; // baja un poco más lento

    for (const v of visemeNames) {
      const target = v === targetViseme ? (strength[v] ?? 1) : 0;

      const idxHead = visemeIndices[v]?.head;
      if (idxHead !== undefined) {
        const k = target > headInfluences[idxHead] ? attack : release;
        headInfluences[idxHead] = expSmoothing(headInfluences[idxHead], target, dt, k);
      }

      const idxTeeth = visemeIndices[v]?.teeth;
      if (idxTeeth !== undefined) {
        const k = target > teethInfluences[idxTeeth] ? attack : release;
        teethInfluences[idxTeeth] = expSmoothing(teethInfluences[idxTeeth], target, dt, k);
      }
    }
  });

  return (
    <group {...props} dispose={null} ref={group}>
      <primitive object={nodes.Hips} />
      <skinnedMesh geometry={nodes.Wolf3D_Hair.geometry} material={materials.Wolf3D_Hair} skeleton={nodes.Wolf3D_Hair.skeleton} />
      <skinnedMesh geometry={nodes.Wolf3D_Body.geometry} material={materials.Wolf3D_Body} skeleton={nodes.Wolf3D_Body.skeleton} />
      <skinnedMesh geometry={nodes.Wolf3D_Outfit_Bottom.geometry} material={materials.Wolf3D_Outfit_Bottom} skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton} />
      <skinnedMesh geometry={nodes.Wolf3D_Outfit_Footwear.geometry} material={materials.Wolf3D_Outfit_Footwear} skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton} />
      <skinnedMesh geometry={nodes.Wolf3D_Outfit_Top.geometry} material={materials.Wolf3D_Outfit_Top} skeleton={nodes.Wolf3D_Outfit_Top.skeleton} />
      <skinnedMesh name="EyeLeft" geometry={nodes.EyeLeft.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeLeft.skeleton} morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary} morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences} />
      <skinnedMesh name="EyeRight" geometry={nodes.EyeRight.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeRight.skeleton} morphTargetDictionary={nodes.EyeRight.morphTargetDictionary} morphTargetInfluences={nodes.EyeRight.morphTargetInfluences} />
      <skinnedMesh name="Wolf3D_Head" geometry={nodes.Wolf3D_Head.geometry} material={materials.Wolf3D_Skin} skeleton={nodes.Wolf3D_Head.skeleton} morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences} />
      <skinnedMesh name="Wolf3D_Teeth" geometry={nodes.Wolf3D_Teeth.geometry} material={materials.Wolf3D_Teeth} skeleton={nodes.Wolf3D_Teeth.skeleton} morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences} />
    </group>
  );
}

useGLTF.preload("/models/69941ed6d4b48fd6efb1f2bc.glb");