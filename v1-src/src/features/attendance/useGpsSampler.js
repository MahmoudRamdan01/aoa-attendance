import { useCallback, useRef, useState } from "react";

function locationError(error) {
  if (error?.code === 1) return new Error("يجب السماح بالوصول إلى الموقع لإتمام التسجيل من مقر الشركة.");
  if (error?.code === 2) return new Error("تعذّر تحديد موقعك. يُرجى تشغيل الـ GPS وإعادة المحاولة.");
  return new Error("استغرق تحديد الموقع وقتًا طويلاً. يُرجى التأكد من تشغيل الـ GPS وإعادة المحاولة.");
}

export function startGpsSampler({ timeoutMs = 12000, maxSamples = 10, minSamples = 3, goodAccuracyM = 30 } = {}) {
  if (!navigator.geolocation) {
    throw new Error("المتصفح لا يدعم تحديد الموقع.");
  }

  let watchId;
  let timer;
  let closed = false;
  let firstSettled = false;
  let doneSettled = false;
  const samples = [];
  let resolveFirst;
  let rejectFirst;
  let resolveDone;
  let rejectDone;

  const first = new Promise((resolve, reject) => {
    resolveFirst = resolve;
    rejectFirst = reject;
  });
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const finish = () => {
    if (doneSettled) return;
    doneSettled = true;
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    window.clearTimeout(timer);
    resolveDone([...samples]);
  };

  const fail = (error) => {
    const normalized = locationError(error);
    if (!firstSettled) {
      firstSettled = true;
      rejectFirst(normalized);
    }
    if (!doneSettled) {
      doneSettled = true;
      rejectDone(normalized);
    }
    if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    window.clearTimeout(timer);
  };

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (closed) return;
      const sample = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Math.round(position.coords.accuracy || 0),
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
        ts: position.timestamp || Date.now(),
      };
      samples.push(sample);
      if (!firstSettled) {
        firstSettled = true;
        resolveFirst(sample);
      }
      // Don't stop at a fixed count: the first indoor fixes are coarse
      // network positions (hundreds of meters off, sometimes km) before the
      // GPS chip warms up. Finish early only once a genuinely accurate fix
      // arrived; otherwise keep sampling until maxSamples or the timeout.
      const bestAccuracy = samples.reduce(
        (best, item) => Math.min(best, item.accuracy || Infinity),
        Infinity,
      );
      if (samples.length >= maxSamples
          || (samples.length >= minSamples && bestAccuracy <= goodAccuracyM)) finish();
    },
    fail,
    { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
  );

  timer = window.setTimeout(() => {
    if (!firstSettled) {
      fail({ code: 3 });
      return;
    }
    finish();
  }, timeoutMs);

  return {
    first,
    done,
    getSamples: () => [...samples],
    stop() {
      closed = true;
      finish();
    },
  };
}

export function useGpsSampler() {
  const samplerRef = useRef(null);
  const [status, setStatus] = useState("idle");

  const start = useCallback(() => {
    samplerRef.current?.stop();
    const sampler = startGpsSampler();
    samplerRef.current = sampler;
    setStatus("loading");
    sampler.first.then(() => setStatus("ready")).catch(() => setStatus("error"));
    return sampler;
  }, []);

  const stop = useCallback(() => {
    samplerRef.current?.stop();
    samplerRef.current = null;
    setStatus("idle");
  }, []);

  return { start, stop, status, samplerRef };
}
