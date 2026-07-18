import { useEffect, useMemo, useRef, useState } from "react";

let enginePromise;

const CHALLENGES = [
  { id: "blink", label: "ارمش بعينيك" },
  { id: "smile", label: "ابتسم أو افتح فمك قليلًا" },
  { id: "turn", label: "لف وشك ناحية اليمين" },
];

export function prepareFaceEngine() {
  if (!enginePromise) {
    enginePromise = import("@vladmandic/human").then(async ({ default: Human }) => {
      const human = new Human({
        backend: "wasm",
        wasmPath: "./wasm/",
        modelBasePath: "./models/",
        cacheModels: true,
        debug: false,
        async: true,
        warmup: "none",
        filter: { enabled: true, flip: false },
        gesture: { enabled: true },
        face: {
          enabled: true,
          detector: {
            modelPath: "blazeface.json",
            maxDetected: 1,
            minConfidence: 0.55,
            minSize: 80,
            rotation: true,
            return: false,
            skipFrames: 0,
            skipTime: 100,
          },
          mesh: { enabled: true, modelPath: "facemesh.json", keepInvalid: false },
          iris: { enabled: false },
          description: {
            enabled: true,
            modelPath: "faceres.json",
            minConfidence: 0.5,
            skipFrames: 0,
            skipTime: 120,
          },
          antispoof: { enabled: true, modelPath: "antispoof.json", skipFrames: 0, skipTime: 120 },
          liveness: { enabled: true, modelPath: "liveness.json", skipFrames: 0, skipTime: 120 },
          emotion: { enabled: false },
          attention: { enabled: false },
          gear: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        segmentation: { enabled: false },
      });
      await human.load();
      return human;
    }).catch((error) => {
      enginePromise = undefined;
      throw error;
    });
  }
  return enginePromise;
}

export function resetFaceEngineForRetry() {
  enginePromise = undefined;
}

function challengePassed(challenge, result, face) {
  const gestures = (result.gesture || [])
    .filter((item) => Object.hasOwn(item, "face") && item.face === 0)
    .map((item) => item.gesture);
  if (challenge === "blink") return gestures.some((gesture) => gesture.startsWith("blink "));
  if (challenge === "smile") {
    return gestures.some((gesture) => {
      const match = gesture.match(/^mouth (\d+)% open$/);
      return match && Number(match[1]) >= 12;
    });
  }
  if (challenge === "turn") {
    const yaw = Math.abs(Number(face.rotation?.angle?.yaw || 0));
    return gestures.includes("facing right") || yaw >= 0.18;
  }
  return false;
}

function isStableBox(current, previous) {
  if (!current || !previous) return false;
  const delta = current.reduce((sum, value, index) => sum + Math.abs(value - previous[index]), 0);
  return delta < 0.16;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function useFaceEngine({ enabled, videoRef, engine, antispoofMin = 0.6 }) {
  const challenge = useMemo(() => CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)], []);
  const [state, setState] = useState(() => ({
    status: enabled ? "loading" : "off",
    instruction: enabled ? "جاري تحميل التحقق من الوجه…" : "",
    data: null,
    unavailable: false,
  }));
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    if (!enabled) {
      setState({ status: "off", instruction: "", data: null, unavailable: false });
      return () => { activeRef.current = false; };
    }

    let frameId;
    let lastRun = 0;
    let detecting = false;
    let previousBox = null;
    let stableFrames = 0;
    let challengeDone = false;
    let failures = 0;
    const realScores = [];
    const liveScores = [];

    const failOpen = () => {
      if (!activeRef.current) return;
      setState({
        status: "unavailable",
        instruction: "تعذر تحميل التحقق من الوجه؛ هيتم التسجيل بالموقع فقط مع تنبيه للإدارة.",
        data: { faceScores: { unavailable: true } },
        unavailable: true,
      });
    };

    Promise.resolve(engine)
      .then((human) => {
        if (!human || !activeRef.current) {
          failOpen();
          return;
        }
        const loop = async (timestamp) => {
          if (!activeRef.current) return;
          frameId = requestAnimationFrame(loop);
          if (detecting || timestamp - lastRun < 120) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          detecting = true;
          lastRun = timestamp;
          try {
            const result = await human.detect(video);
            failures = 0;
            if (result.face.length !== 1) {
              stableFrames = 0;
              previousBox = null;
              setState((current) => ({
                ...current,
                status: "challenge",
                instruction: result.face.length > 1 ? "لازم يظهر شخص واحد بس في الكاميرا" : "قرّب وشك وخليه داخل الإطار",
              }));
              return;
            }

            const face = result.face[0];
            stableFrames = isStableBox(face.boxRaw, previousBox) ? stableFrames + 1 : 0;
            previousBox = face.boxRaw;
            if (Number.isFinite(face.real)) realScores.push(face.real);
            if (Number.isFinite(face.live)) liveScores.push(face.live);
            if (realScores.length > 18) realScores.shift();
            if (liveScores.length > 18) liveScores.shift();

            if (stableFrames >= 2 && challengePassed(challenge.id, result, face)) challengeDone = true;

            const antispoof = average(realScores);
            const liveness = average(liveScores);
            const embeddingReady = Array.isArray(face.embedding) && face.embedding.length === 1024;
            const scoresReady = realScores.length >= 2 && liveScores.length >= 2;
            if (challengeDone && stableFrames >= 2 && scoresReady && embeddingReady
                && antispoof >= antispoofMin && liveness >= 0.5) {
              setState({
                status: "ready",
                instruction: "تم التحقق — تقدر تلتقط وتسجّل",
                unavailable: false,
                data: {
                  faceEmbedding: face.embedding,
                  faceScores: {
                    antispoof: Number(antispoof.toFixed(4)),
                    liveness: Number(liveness.toFixed(4)),
                    challenge: challenge.id,
                    stable_frames: stableFrames,
                  },
                },
              });
              activeRef.current = false;
              cancelAnimationFrame(frameId);
              return;
            }

            let instruction = challenge.label;
            if (challengeDone && antispoof < antispoofMin) instruction = "ثبّت الموبايل وحسّن الإضاءة";
            else if (challengeDone && liveness < 0.5) instruction = "ثبّت وشك لحظة للتأكد من الحيوية";
            setState((current) => ({ ...current, status: "challenge", instruction }));
          } catch {
            failures += 1;
            if (failures >= 3) {
              cancelAnimationFrame(frameId);
              failOpen();
              activeRef.current = false;
            }
          } finally {
            detecting = false;
          }
        };
        setState((current) => ({ ...current, status: "challenge", instruction: challenge.label }));
        frameId = requestAnimationFrame(loop);
      })
      .catch(failOpen);

    return () => {
      activeRef.current = false;
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [enabled, engine, videoRef, challenge.id, challenge.label, antispoofMin]);

  return state;
}
