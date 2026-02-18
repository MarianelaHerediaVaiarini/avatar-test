import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // ——— Sistema de transiciones naturales ———
  // Crossfade suave: desvanece todas las demás y arranca la target
  const crossFadeTo = useCallback((targetName, duration = 0.6) => {
    if (!actions) return;
    const target = actions[targetName];
    if (!target) return;

    Object.entries(actions).forEach(([name, action]) => {
      if (name !== targetName && action.isRunning()) {
        action.fadeOut(duration);
      }
    });

    target.reset().setEffectiveWeight(1).fadeIn(duration).play();
  }, [actions]);

  // Ref para el timer de idle variations
  const idleVariationTimerRef = useRef(null);
  const greetingDoneRef = useRef(false);

  // Programa la próxima variación de idle (StandingIdle de vez en cuando)
  const scheduleIdleVariation = useCallback(() => {
    // Intervalo aleatorio entre 6-12 segundos
    const delay = 6000 + Math.random() * 6000;
    idleVariationTimerRef.current = setTimeout(() => {
      if (!actions?.StandingIdle) return;

      // CrossFade a StandingIdle
      crossFadeTo("StandingIdle", 0.8);

      // Cuando termine StandingIdle, volver a Idle y programar la siguiente variación
      const mixer = actions.StandingIdle.getMixer();
      const onFinished = (e) => {
        if (e.action === actions.StandingIdle) {
          mixer.removeEventListener("finished", onFinished);
          crossFadeTo("Idle", 0.8);
          scheduleIdleVariation();
        }
      };
      mixer.addEventListener("finished", onFinished);
    }, delay);
  }, [actions, crossFadeTo]);

  // Setup y secuencia inicial: Idle → (3s) → Greeting → Idle → variaciones
  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;

    // Config de animaciones one-shot
    if (actions.StandingGreeting) {
      actions.StandingGreeting.clampWhenFinished = true;
      actions.StandingGreeting.setLoop(THREE.LoopOnce, 1);
    }
    if (actions.StandingIdle) {
      actions.StandingIdle.clampWhenFinished = true;
      actions.StandingIdle.setLoop(THREE.LoopOnce, 1);
    }

    // Arrancar con Idle
    actions.Idle?.reset().fadeIn(0.5).play();

    // A los 3 segundos → Greeting
    const greetTimer = setTimeout(() => {
      crossFadeTo("StandingGreeting", 0.6);
    }, 3000);

    // Cuando Greeting termina → Idle + empezar variaciones
    const mixer = actions.Idle?.getMixer();
    const onGreetFinished = (e) => {
      if (e.action === actions.StandingGreeting && !greetingDoneRef.current) {
        greetingDoneRef.current = true;
        mixer?.removeEventListener("finished", onGreetFinished);
        crossFadeTo("Idle", 0.8);
        // Empezar ciclo de variaciones naturales
        scheduleIdleVariation();
      }
    };
    mixer?.addEventListener("finished", onGreetFinished);

    return () => {
      clearTimeout(greetTimer);
      clearTimeout(idleVariationTimerRef.current);
      mixer?.removeEventListener("finished", onGreetFinished);
    };
  }, [actions, crossFadeTo, scheduleIdleVariation]);

  // Refs para performance
  const cueIndexRef = useRef(0);
  const currentVisemeRef = useRef("viseme_sil");

  // Precalcula diccionarios/targets una sola vez
  const headDict = nodes?.Wolf3D_Head?.morphTargetDictionary;
  const headInfluences = nodes?.Wolf3D_Head?.morphTargetInfluences;
  const teethDict = nodes?.Wolf3D_Teeth?.morphTargetDictionary;
  const teethInfluences = nodes?.Wolf3D_Teeth?.morphTargetInfluences;

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

  // Lipsync update
  useFrame((_, dt) => {
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