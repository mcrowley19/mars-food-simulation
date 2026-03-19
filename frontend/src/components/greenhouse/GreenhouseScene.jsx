import { useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import * as THREE from "three";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import useGreenhouseState from "../../hooks/useGreenhouseState";
import { getSessionId, clearSessionId } from "../../utils/session";
import { API_BASE_URL } from "../../utils/api";
import { initScene, buildTerrain, setupLighting } from "./sceneSetup";
import { buildColony } from "./domeBuilder";
import { distributeCrops, updateCropsAndBeds } from "./cropRenderer";
import { computeHud } from "./hudUpdater";
import {
  FRUSTUM,
  DOME_OPACITY,
  ZOOM_DEFAULT,
  ZOOM_ENTERED,
  ZOOM_ALL,
  ANIM_DURATION,
  INITIAL_WATER,
  DOME_DEFS_BASE,
  CROP_COLORS,
  lerp,
  easeInOut,
  scaleDomeDefs,
  enterZoomForRadius,
} from "./constants";
import "./GreenhouseScene.css";

let DOME_DEFS = DOME_DEFS_BASE;
const MAX_VISIBLE_AGENT_LOGS = 12;
const MAX_VISIBLE_RESPONSE_LINES = 5;
const MAX_VISIBLE_TASK_LINES = 1;
const RESOURCE_HISTORY_LIMIT = 72;
const RESOURCE_TREND_CHART_HEIGHT = 68;
const RESOURCE_TREND_CHART_WIDTH = 320;

function cropChipStyle(cropName) {
  const colorHex = CROP_COLORS[cropName?.toLowerCase()] || "#6ea07d";
  const hex = colorHex.replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const int = Number.parseInt(normalized, 16);
  if (Number.isNaN(int)) return undefined;
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return {
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.16)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.45)`,
    color: `rgba(${r}, ${g}, ${b}, 0.96)`,
  };
}

function sparklinePath(points, width, height, key) {
  if (!Array.isArray(points) || points.length === 0) return "";
  const vals = points.map((p) => Number(p?.[key]) || 0);
  const max = Math.max(...vals);
  // Keep chart origin pinned at 0 on Y axis.
  const range = Math.max(1, max);
  if (points.length === 1) {
    const y = height - (vals[0] / range) * height;
    return `M 0 ${y.toFixed(2)} L ${width.toFixed(2)} ${y.toFixed(2)}`;
  }
  return vals
    .map((val, idx) => {
      const x = (idx / (vals.length - 1)) * width;
      const y = height - (val / range) * height;
      return `${idx === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildXTicks(points, width, step = 10) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const days = points
    .map((p) => Number(p?.day))
    .filter((d) => Number.isFinite(d))
    .sort((a, b) => a - b);
  if (!days.length) return [];
  const minDay = Math.floor(days[0]);
  const maxDay = Math.floor(days[days.length - 1]);
  if (maxDay <= minDay) return [{ day: minDay, x: 0 }];

  const firstTick = Math.ceil(minDay / step) * step;
  const ticks = [];
  if (firstTick > minDay) ticks.push({ day: minDay });
  for (let d = firstTick; d <= maxDay; d += step) ticks.push({ day: d });
  if (ticks[ticks.length - 1]?.day !== maxDay) ticks.push({ day: maxDay });

  const range = Math.max(1, maxDay - minDay);
  return ticks.map((t) => ({
    day: t.day,
    x: ((t.day - minDay) / range) * width,
  }));
}

function nearestPointValueForDay(points, key, day) {
  if (!Array.isArray(points) || points.length === 0) return 0;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const d = Number(point?.day);
    if (!Number.isFinite(d)) continue;
    const dist = Math.abs(d - day);
    if (dist < bestDist) {
      bestDist = dist;
      best = point;
    }
  }
  return Number(best?.[key]) || 0;
}

function interpolatedValueForDay(points, key, day) {
  if (!Array.isArray(points) || points.length === 0) return 0;
  const sorted = points
    .map((p) => ({
      day: Number(p?.day),
      value: Number(p?.[key]) || 0,
    }))
    .filter((p) => Number.isFinite(p.day))
    .sort((a, b) => a.day - b.day);
  if (!sorted.length) return 0;
  if (day <= sorted[0].day) return sorted[0].value;
  if (day >= sorted[sorted.length - 1].day) return sorted[sorted.length - 1].value;

  for (let i = 1; i < sorted.length; i += 1) {
    const left = sorted[i - 1];
    const right = sorted[i];
    if (day <= right.day) {
      const span = Math.max(0.0001, right.day - left.day);
      const t = Math.max(0, Math.min(1, (day - left.day) / span));
      return left.value + (right.value - left.value) * t;
    }
  }
  return sorted[sorted.length - 1].value;
}

function layoutValueLabel(tick, value, chartWidth, chartHeight) {
  const text = String(Math.round(value));
  const approxWidth = Math.max(14, text.length * 5.8 + 6);
  const boxHeight = 10;
  const placeAbove = tick.y > 18;
  const rawBoxX = tick.x + 3;
  const boxX = Math.max(0, Math.min(chartWidth - approxWidth, rawBoxX));
  const boxY = placeAbove
    ? Math.max(0, tick.y - (boxHeight + 4))
    : Math.min(chartHeight - boxHeight, tick.y + 4);
  return {
    text,
    boxX,
    boxY,
    textX: boxX + 3,
    textY: boxY + 7.2,
    boxWidth: approxWidth,
    boxHeight,
  };
}

function PanelChevron({ collapsed }) {
  return (
    <svg
      className={`gh-panel-arrow__icon${collapsed ? " is-collapsed" : ""}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        className="gh-panel-arrow__path"
        d="M4 6.5 8 10.5 12 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function GreenhouseScene({ onExit, totalDays = 350, awaitAgents = false }) {
  const SOL_TICK_MS = 8000;
  const canvasRef = useRef(null);
  const exitButtonRef = useRef(null);
  const leftPanelsRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const [hud, setHud] = useState({
    angle: 0,
    dir: "N",
    fps: 0,
    dome: "—",
    zoom: "1.0",
    missionDay: 0,
    waterL: 0,
    nutrientsKg: 0,
    cropsGrowing: 0,
    cropsReady: 0,
    activeEvents: [],
    tempC: 22,
    co2Ppm: 800,
    humidityPct: 65,
    lightHours: 12,
    harvestedCount: 0,
    agentStatus: "",
    cropBreakdown: {},
    caloriesAvailable: 0,
    caloriesNeededPerDay: 0,
    caloriesConsumedToday: 0,
    seedReserve: {},
    vitaminLevels: {},
    cropHealthByType: {},
  });
  const [enterLabel, setEnterLabel] = useState(null);
  const [plantHover, setPlantHover] = useState(null);
  const hoverRef = useRef(null); // { domeIndex, plantIndex, x, y }
  const [insideDome, setInsideDome] = useState(null);
  const insideDomeRef = useRef(null);
  const simDayFracRef = useRef(0.25);
  const lastMissionDayRef = useRef(null);
  const solStartTimeRef = useRef(0);
  const [domeDefs, setDomeDefs] = useState(null);
  const tickInFlightRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isFastForward, setIsFastForward] = useState(false);
  const isPlayingRef = useRef(true);
  const isFastForwardRef = useRef(false);
  const [activeAgentTab, setActiveAgentTab] = useState("");
  const logsListRef = useRef(null);
  const [resourceHistory, setResourceHistory] = useState([]);
  const [trendHover, setTrendHover] = useState(null);
  const [collapsedPanels, setCollapsedPanels] = useState({
    trends: false,
    logs: false,
    resources: false,
  });
  const [resourcesTab, setResourcesTab] = useState("overview");

  const [isDragging, setIsDragging] = useState(false);
  const [sliderValue, setSliderValue] = useState(1);
  const jumpInFlightRef = useRef(false);
  const [agentInitTimedOut, setAgentInitTimedOut] = useState(false);
  useEffect(() => {
    if (agentInitTimedOut) return;
    const t = setTimeout(() => setAgentInitTimedOut(true), 45000);
    return () => clearTimeout(t);
  }, [agentInitTimedOut]);

  const simState = useGreenhouseState(true);
  const simStateRef = useRef(null);

  const lerpedRef = useRef({
    sunIntensityMul: 1.0,
    ambientTint: 1.0,
    tempTint: 0,
    fogDensity: 0,
    plantScales: [],
    co2Tint: 0,
  });

  useEffect(() => {
    simStateRef.current = simState;
    const missionDay = simState?.mission_day;
    if (typeof missionDay !== "number") return;
    if (
      lastMissionDayRef.current === null ||
      missionDay !== lastMissionDayRef.current
    ) {
      lastMissionDayRef.current = missionDay;
      solStartTimeRef.current = performance.now();
      simDayFracRef.current = 0;
    }
  }, [simState]);
  useEffect(() => {
    insideDomeRef.current = insideDome;
  }, [insideDome]);

  useEffect(() => {
    if (!simState?.setup_complete) {
      setResourceHistory([]);
      return;
    }

    // Seed from backend state first so charts never start at HUD default zeroes.
    const water = Number(simState?.resources?.water_l ?? hud.waterL);
    const calories = Number(simState?.calories_available ?? hud.caloriesAvailable);
    if (!Number.isFinite(water) || !Number.isFinite(calories)) return;
    const day = Number(simState?.mission_day ?? hud.missionDay ?? 1);
    const safeDay = Number.isFinite(day) ? day : 1;

    setResourceHistory((prev) => {
      const point = { water, calories, day: safeDay };
      if (prev.length === 0) return [point];

      const last = prev[prev.length - 1];
      if (safeDay < (last.day ?? 0)) return [point];
      if (
        last.day === point.day &&
        Math.abs((last.water ?? 0) - point.water) < 0.001 &&
        Math.abs((last.calories ?? 0) - point.calories) < 0.001
      ) {
        return prev;
      }

      const next = [...prev, point];
      return next.length > RESOURCE_HISTORY_LIMIT
        ? next.slice(next.length - RESOURCE_HISTORY_LIMIT)
        : next;
    });
  }, [
    hud.waterL,
    hud.caloriesAvailable,
    hud.missionDay,
    simState?.setup_complete,
    simState?.mission_day,
    simState?.resources?.water_l,
    simState?.calories_available,
  ]);

  const simulateTick = useCallback(async () => {
    if (tickInFlightRef.current) return;
    tickInFlightRef.current = true;
    try {
      const sessionId = getSessionId();
      await fetch(`${API_BASE_URL}/simulate-tick`, {
        method: "POST",
        headers: { "x-session-id": sessionId },
      });
    } catch {
      // ignore transient network/backend errors; polling will recover
    } finally {
      tickInFlightRef.current = false;
    }
  }, []);

  const handleSliderChange = useCallback((e) => {
    const val = Number(e.target.value);
    setSliderValue(val);
    setIsDragging(true);
  }, []);

  const handleSliderCommit = useCallback(async (e) => {
    const target = Number(e.target.value);
    setIsDragging(false);
    if (jumpInFlightRef.current) return;
    const current = simStateRef.current?.mission_day || 1;
    if (target <= current) return;
    jumpInFlightRef.current = true;
    try {
      const sessionId = getSessionId();
      await fetch(`${API_BASE_URL}/simulate-jump`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({ target_day: target }),
      });
    } catch {
      // polling will recover
    } finally {
      jumpInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (domeDefs) return;
    if (!simState) {
      const fallbackTimer = setTimeout(() => {
        setDomeDefs((prev) => {
          if (prev) return prev;
          DOME_DEFS = DOME_DEFS_BASE;
          return DOME_DEFS_BASE;
        });
      }, 3000);
      return () => clearTimeout(fallbackTimer);
    }
    const floor =
      simState?.resources?.floor_space_m2 ??
      simState?.floor_space_m2 ??
      simState?.greenhouse?.floor_space_m2;
    if (floor && floor > 0) {
      DOME_DEFS = scaleDomeDefs(floor);
      setDomeDefs(DOME_DEFS);
    } else {
      DOME_DEFS = DOME_DEFS_BASE;
      setDomeDefs(DOME_DEFS_BASE);
    }
  }, [simState, domeDefs]);

  const cleanup = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (stateRef.current) {
      const { renderer, scene } = stateRef.current;
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      renderer.dispose();
    }
    stateRef.current = null;
  }, []);

  useEffect(() => {
    if (!domeDefs) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth,
      h = window.innerHeight;
    const { renderer, scene, camera } = initScene(canvas, w, h);
    buildTerrain(scene);
    const greenhouses = buildColony(scene, DOME_DEFS);
    const { sun, ambient, fill } = setupLighting(scene);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const anim = {
      active: false,
      entering: false,
      allMode: false,
      progress: 0,
      dome: null,
      startZoom: ZOOM_DEFAULT,
      endZoom: ZOOM_ENTERED,
      startX: 0,
      startZ: 0,
      endX: 0,
      endZ: 0,
    };

    stateRef.current = {
      renderer,
      scene,
      camera,
      sun,
      ambient,
      fill,
      greenhouses,
      anim,
      raycaster,
      pointer,
    };

    const onClick = (e) => {
      if (anim.active) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const shells = greenhouses
        .map((g) => g.getObjectByName("shell"))
        .filter(Boolean);
      const hits = raycaster.intersectObjects(shells, false);
      if (hits.length > 0) {
        const domeGroup = hits[0].object.parent;
        const domeId = domeGroup.userData.domeId;
        const worldPos = new THREE.Vector3();
        domeGroup.getWorldPosition(worldPos);
        worldPos.y += domeGroup.userData.radius + 1;
        const projected = worldPos.clone().project(camera);
        const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
        setEnterLabel({ id: domeId, x: sx, y: sy, group: domeGroup });
      }
    };
    canvas.addEventListener("click", onClick);

    const onMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const allHitMeshes = [];
      for (const gh of greenhouses) {
        const plants = gh.userData.plantMeshes || [];
        const hitArr = gh.userData.hitMeshes || [];
        for (let i = 0; i < hitArr.length; i++) {
          if (plants[i]?.visible) allHitMeshes.push(hitArr[i]);
        }
      }

      if (allHitMeshes.length === 0) {
        setPlantHover(null);
        hoverRef.current = null;
        return;
      }

      const hits = raycaster.intersectObjects(allHitMeshes, false);
      if (hits.length === 0) {
        setPlantHover(null);
        hoverRef.current = null;
        return;
      }

      const hitMesh = hits[0].object;
      const pi = hitMesh.userData.plantIndex;
      const ss = simStateRef.current;
      const domeCrops = distributeCrops(ss?.crops || [], DOME_DEFS);
      let foundCrop = null;
      let foundDi = -1;

      for (let di = 0; di < greenhouses.length && !foundCrop; di++) {
        const hitArr = greenhouses[di].userData.hitMeshes || [];
        if (hitArr.includes(hitMesh)) {
          foundCrop = domeCrops[di]?.[pi] || null;
          foundDi = di;
        }
      }

      if (!foundCrop) {
        setPlantHover(null);
        hoverRef.current = null;
        return;
      }

      hoverRef.current = {
        domeIndex: foundDi,
        plantIndex: pi,
        x: e.clientX + 14,
        y: e.clientY + 14,
      };
      setPlantHover({
        x: e.clientX + 14,
        y: e.clientY + 14,
        crop: foundCrop,
      });
    };

    const onMouseLeave = () => {
      setPlantHover(null);
      hoverRef.current = null;
    };
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);

    const onResize = () => {
      const nw = window.innerWidth,
        nh = window.innerHeight;
      renderer.setSize(nw, nh);
      const a = nw / nh;
      camera.left = -FRUSTUM * a;
      camera.right = FRUSTUM * a;
      camera.top = FRUSTUM;
      camera.bottom = -FRUSTUM;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const SUN_ORBIT_R = 140;
    const SUN_MAX_H = 80;

    const DAY_BG = new THREE.Color("#5f3219");
    const NIGHT_BG = new THREE.Color("#120b18");
    const DAWN_SUN = new THREE.Color("#ff8844");
    const NOON_SUN = new THREE.Color("#ffe8cc");
    const bgColor = new THREE.Color();
    const sunColor = new THREE.Color();

    let lastTime = performance.now();
    let frameCount = 0,
      fpsAccum = 0,
      lastFpsUpdate = performance.now();

    const animate = (now) => {
      rafRef.current = requestAnimationFrame(animate);
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      const missionDay = simStateRef.current?.mission_day;
      if (typeof missionDay === "number") {
        if (
          lastMissionDayRef.current === null ||
          missionDay !== lastMissionDayRef.current
        ) {
          lastMissionDayRef.current = missionDay;
          solStartTimeRef.current = now;
          simDayFracRef.current = 0;
        }
        if (isPlayingRef.current) {
          const tickMs = isFastForwardRef.current
            ? SOL_TICK_MS / 3
            : SOL_TICK_MS;
          const elapsed = (now - solStartTimeRef.current) / tickMs;
          simDayFracRef.current = Math.max(0, Math.min(0.999, elapsed));
        }
      } else {
        // Fallback visual loop before live state arrives.
        if (isPlayingRef.current) {
          simDayFracRef.current += dt / 10;
          if (simDayFracRef.current >= 1) simDayFracRef.current = 0;
        }
      }

      // Mars sol: ~24h 37m, nearly equal day/night (~12.3h each).
      // sunPhase 0→1 maps to one full sol. Noon at 0.25, midnight at 0.75.
      const sunPhase = simDayFracRef.current;
      const sunAngle = sunPhase * Math.PI * 2;
      const sunY = Math.sin(sunAngle) * SUN_MAX_H;
      const sunX = Math.cos(sunAngle) * SUN_ORBIT_R;
      const sunZ = Math.sin(sunAngle + Math.PI / 3) * SUN_ORBIT_R * 0.6;

      // Let the sun go fully below the horizon — no clamping
      sun.position.set(sunX, sunY, sunZ);
      sun.target.position.set(0, 0, 0);
      sun.target.updateMatrixWorld();

      // elevation: 1 at noon (phase 0.25), -1 at midnight (phase 0.75)
      const elevation = Math.sin(sunAngle);
      // dayFactor: 1 when sun is up, 0 when below horizon, smooth twilight transition
      // Mars twilight is ~1h out of 24.6h ≈ 0.04 of the cycle
      const dayFactor = Math.max(0, Math.min(1, (elevation + 0.1) / 0.2));
      // twilight: slightly wider blend for ambient light (includes civil twilight)
      const twilight = Math.max(0, Math.min(1, (elevation + 0.2) / 0.3));

      const ss = simStateRef.current;
      const env = ss?.environment || {};
      const events = ss?.active_events || [];
      const lv = lerpedRef.current;
      const LERP_SPEED = 4;

      const tgtSunMul =
        typeof env.light_intensity === "number" ? env.light_intensity : 1.0;
      const tgtAmbientTint =
        typeof env.light_hours === "number"
          ? Math.min(1, env.light_hours / 16)
          : 1.0;
      const tgtTempTint =
        typeof env.temp_c === "number"
          ? env.temp_c < 15
            ? -(15 - env.temp_c) / 15
            : env.temp_c > 30
              ? (env.temp_c - 30) / 20
              : 0
          : 0;
      const tgtFogDensity = events.includes("dust_storm") ? 0.008 : 0;
      const tgtCo2Tint = events.includes("co2_spike") ? 1 : 0;

      lv.sunIntensityMul = lerp(
        lv.sunIntensityMul,
        tgtSunMul,
        Math.min(1, dt * LERP_SPEED),
      );
      lv.ambientTint = lerp(
        lv.ambientTint,
        tgtAmbientTint,
        Math.min(1, dt * LERP_SPEED),
      );
      lv.tempTint = lerp(
        lv.tempTint,
        tgtTempTint,
        Math.min(1, dt * LERP_SPEED),
      );
      lv.fogDensity = lerp(
        lv.fogDensity,
        tgtFogDensity,
        Math.min(1, dt * LERP_SPEED),
      );
      lv.co2Tint = lerp(lv.co2Tint, tgtCo2Tint, Math.min(1, dt * LERP_SPEED));

      const baseSunI = lerp(0.35, 2.95, dayFactor);
      sun.intensity = baseSunI * lv.sunIntensityMul;
      sun.castShadow = dayFactor > 0.12;
      const baseAmbI = lerp(0.2, 0.72, twilight);
      ambient.intensity = baseAmbI * lv.ambientTint;
      fill.intensity = lerp(0.12, 0.52, twilight);

      sunColor.copy(DAWN_SUN).lerp(NOON_SUN, dayFactor);
      sun.color.copy(sunColor);

      bgColor.copy(NIGHT_BG).lerp(DAY_BG, twilight);
      if (Math.abs(lv.tempTint) > 0.01) {
        const tintColor =
          lv.tempTint < 0
            ? new THREE.Color("#2244ff")
            : new THREE.Color("#ff3322");
        bgColor.lerp(tintColor, Math.abs(lv.tempTint) * 0.15);
      }
      scene.background.copy(bgColor);

      if (lv.fogDensity > 0.0001) {
        if (!scene.fog) scene.fog = new THREE.FogExp2("#CC6633", lv.fogDensity);
        else {
          scene.fog.color.set("#CC6633");
          scene.fog.density = lv.fogDensity;
        }
      } else if (scene.fog) {
        scene.fog = null;
      }

      updateCropsAndBeds(greenhouses, DOME_DEFS, ss, lv, dt);

      frameCount++;
      fpsAccum += dt;
      if (now - lastFpsUpdate > 500) {
        const fps = Math.round(frameCount / fpsAccum);
        setHud(computeHud(sunPhase, fps, anim, camera, ss, events));
        frameCount = 0;
        fpsAccum = 0;
        lastFpsUpdate = now;

        // Live-update hovered plant tooltip with latest state
        const hr = hoverRef.current;
        if (hr && ss?.crops) {
          const domeCrops = distributeCrops(ss.crops, DOME_DEFS);
          const crop = domeCrops[hr.domeIndex]?.[hr.plantIndex];
          if (crop) {
            setPlantHover({ x: hr.x, y: hr.y, crop });
          }
        }
      }

      if (anim.active) {
        anim.progress += dt / ANIM_DURATION;
        if (anim.progress >= 1) {
          anim.progress = 1;
          anim.active = false;
        }
        const t = easeInOut(Math.min(anim.progress, 1));
        camera.zoom = lerp(anim.startZoom, anim.endZoom, t);
        camera.position.x = lerp(anim.startX, anim.endX, t);
        camera.position.z = lerp(anim.startZ, anim.endZ, t);
        camera.updateProjectionMatrix();

        if (anim.allMode) {
          for (const gh of greenhouses) {
            const shell = gh.getObjectByName("shell");
            const ribs = gh.getObjectByName("ribs");
            if (!shell) continue;
            if (anim.entering) {
              shell.material.opacity = lerp(DOME_OPACITY, 0, t);
              if (ribs) ribs.visible = t < 0.3;
              if (anim.progress >= 1) {
                shell.visible = false;
                if (ribs) ribs.visible = false;
                const interior = gh.getObjectByName("interior");
                if (interior) interior.visible = true;
              }
            } else {
              shell.material.opacity = lerp(0, DOME_OPACITY, t);
              if (ribs) ribs.visible = t > 0.7;
              if (anim.progress >= 1) {
                if (ribs) ribs.visible = true;
              }
            }
          }
          if (anim.progress >= 1) {
            setInsideDome(anim.entering ? "ALL" : null);
          }
        } else {
          const shell = anim.dome?.getObjectByName("shell");
          const ribs = anim.dome?.getObjectByName("ribs");
          if (shell) {
            if (anim.entering) {
              shell.material.opacity = lerp(DOME_OPACITY, 0, t);
              if (ribs) ribs.visible = t < 0.3;
              if (anim.progress >= 1) {
                shell.visible = false;
                if (ribs) ribs.visible = false;
                const interior = anim.dome.getObjectByName("interior");
                if (interior) interior.visible = true;
                setInsideDome(anim.dome.userData.domeId);
              }
            } else {
              shell.material.opacity = lerp(0, DOME_OPACITY, t);
              if (ribs) ribs.visible = t > 0.7;
              if (anim.progress >= 1) {
                if (ribs) ribs.visible = true;
                setInsideDome(null);
              }
            }
          }
        }
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      cleanup();
    };
  }, [cleanup, domeDefs]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    isFastForwardRef.current = isFastForward;
  }, [isFastForward]);

  useEffect(() => {
    if (!simState?.setup_complete || !isPlaying) return;
    const interval = isFastForward ? SOL_TICK_MS / 3 : SOL_TICK_MS;
    const timer = setInterval(() => {
      simulateTick();
    }, interval);
    return () => clearInterval(timer);
  }, [
    simState?.setup_complete,
    simulateTick,
    SOL_TICK_MS,
    isPlaying,
    isFastForward,
  ]);

  const handleEnterDome = useCallback(() => {
    const s = stateRef.current;
    if (!s || !enterLabel) return;
    const { camera, anim } = s;
    const domeGroup = enterLabel.group;
    anim.active = true;
    anim.entering = true;
    anim.allMode = false;
    anim.progress = 0;
    anim.dome = domeGroup;
    anim.startZoom = camera.zoom;
    anim.endZoom = enterZoomForRadius(domeGroup.userData.radius);
    anim.startX = camera.position.x;
    anim.startZ = camera.position.z;
    anim.endX = domeGroup.position.x;
    anim.endZ = domeGroup.position.z;

    const shell = domeGroup.getObjectByName("shell");
    if (shell) {
      shell.visible = true;
      shell.material.opacity = DOME_OPACITY;
    }
    const ribs = domeGroup.getObjectByName("ribs");
    if (ribs) ribs.visible = true;

    setEnterLabel(null);
  }, [enterLabel]);

  const handleExitDome = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const { camera, anim, greenhouses } = s;

    if (anim.allMode || insideDome === "ALL") {
      for (const gh of greenhouses) {
        const shell = gh.getObjectByName("shell");
        if (shell) {
          shell.visible = true;
          shell.material.opacity = 0;
        }
        const ribs = gh.getObjectByName("ribs");
        if (ribs) ribs.visible = false;
      }
      anim.active = true;
      anim.entering = false;
      anim.allMode = true;
      anim.progress = 0;
      anim.dome = null;
      anim.startZoom = camera.zoom;
      anim.endZoom = ZOOM_DEFAULT;
      anim.startX = camera.position.x;
      anim.startZ = camera.position.z;
      anim.endX = 0;
      anim.endZ = 0;
      return;
    }

    if (!anim.dome) return;
    const shell = anim.dome.getObjectByName("shell");
    if (shell) {
      shell.visible = true;
      shell.material.opacity = 0;
    }
    const ribs = anim.dome.getObjectByName("ribs");
    if (ribs) ribs.visible = false;

    anim.active = true;
    anim.entering = false;
    anim.allMode = false;
    anim.progress = 0;
    anim.startZoom = camera.zoom;
    anim.endZoom = ZOOM_DEFAULT;
    anim.startX = camera.position.x;
    anim.startZ = camera.position.z;
    anim.endX = 0;
    anim.endZ = 0;
  }, [insideDome]);

  const handleExit = useCallback(() => {
    if (insideDome) {
      handleExitDome();
      return;
    }
    const sessionId = getSessionId();
    fetch(`${API_BASE_URL}/reset`, {
      method: "POST",
      headers: { "x-session-id": sessionId },
    }).catch(() => {});
    clearSessionId();
    onExit();
  }, [insideDome, handleExitDome, onExit]);

  const handleEnterFirstDome = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const { camera, anim, greenhouses } = s;
    if (anim.active || greenhouses.length === 0) return;

    const domeGroup = greenhouses[0];
    anim.active = true;
    anim.entering = true;
    anim.allMode = false;
    anim.progress = 0;
    anim.dome = domeGroup;
    anim.startZoom = camera.zoom;
    anim.endZoom = enterZoomForRadius(domeGroup.userData.radius);
    anim.startX = camera.position.x;
    anim.startZ = camera.position.z;
    anim.endX = domeGroup.position.x;
    anim.endZ = domeGroup.position.z;

    const shell = domeGroup.getObjectByName("shell");
    if (shell) {
      shell.visible = true;
      shell.material.opacity = DOME_OPACITY;
    }

    setEnterLabel(null);
  }, []);

  const parsedAgentLogs =
    simState?.agent_logs_parsed &&
    typeof simState.agent_logs_parsed === "object"
      ? simState.agent_logs_parsed
      : {};
  const agentTabs = Object.keys(parsedAgentLogs);
  const activeTab = agentTabs.includes(activeAgentTab)
    ? activeAgentTab
    : agentTabs[0] || "";
  const activeTabEntries = activeTab ? parsedAgentLogs[activeTab] || [] : [];
  const visibleAgentEntries = activeTabEntries.slice(-MAX_VISIBLE_AGENT_LOGS);

  useEffect(() => {
    if (!agentTabs.length) {
      if (activeAgentTab) setActiveAgentTab("");
      return;
    }
    if (!agentTabs.includes(activeAgentTab)) setActiveAgentTab(agentTabs[0]);
  }, [activeAgentTab, agentTabs]);

  useEffect(() => {
    if (!logsListRef.current) return;
    logsListRef.current.scrollTop = logsListRef.current.scrollHeight;
  }, [activeTab, activeTabEntries.length]);

  useLayoutEffect(() => {
    const maybeAutoCollapseForExitClearance = () => {
      const exitEl = exitButtonRef.current;
      const panelsEl = leftPanelsRef.current;
      if (!exitEl || !panelsEl) return;
      const exitRect = exitEl.getBoundingClientRect();
      const panelsRect = panelsEl.getBoundingClientRect();
      const intersects =
        exitRect.left < panelsRect.right &&
        exitRect.right > panelsRect.left &&
        exitRect.top < panelsRect.bottom &&
        exitRect.bottom > panelsRect.top;
      if (!intersects) return;
      setCollapsedPanels((prev) => {
        if (prev.trends && prev.logs && prev.resources) return prev;
        return { trends: true, logs: true, resources: true };
      });
    };

    maybeAutoCollapseForExitClearance();
    window.addEventListener("resize", maybeAutoCollapseForExitClearance);
    return () => {
      window.removeEventListener("resize", maybeAutoCollapseForExitClearance);
    };
  }, [
    collapsedPanels.trends,
    collapsedPanels.logs,
    collapsedPanels.resources,
    visibleAgentEntries.length,
    resourceHistory.length,
    insideDome,
  ]);

  const agentReady = !awaitAgents || Boolean(simState?.agent_last_actions?.orchestrator) || agentInitTimedOut;

  const showLoadingOverlay = !domeDefs || !agentReady;
  const loadingText = !domeDefs ? "Loading colony data…" : "Initialising AI agents…";

  const waterPct = INITIAL_WATER > 0 ? hud.waterL / INITIAL_WATER : 1;
  const barClass = (pct) =>
    pct > 0.5 ? "gh-bar--ok" : pct > 0.2 ? "gh-bar--warn" : "gh-bar--crit";
  const vitaminBarClass = (pct) =>
    pct >= 100 ? "gh-bar--ok" : pct >= 70 ? "gh-bar--warn" : "gh-bar--crit";
  const vitaminOrder = ["A", "C", "D", "E", "K", "B9", "B12"];
  const hasLiveState = Boolean(simState && simState.setup_complete);
  const currentSol = hud.missionDay || simState?.mission_day || 1;
  const prettyAgentName = (name) => String(name || "").replace(/_/g, " ");
  const trendLast = resourceHistory[resourceHistory.length - 1] || null;
  const trendWaterPath = sparklinePath(
    resourceHistory,
    RESOURCE_TREND_CHART_WIDTH,
    RESOURCE_TREND_CHART_HEIGHT,
    "water",
  );
  const trendCaloriesPath = sparklinePath(
    resourceHistory,
    RESOURCE_TREND_CHART_WIDTH,
    RESOURCE_TREND_CHART_HEIGHT,
    "calories",
  );
  const xTicks = buildXTicks(resourceHistory, RESOURCE_TREND_CHART_WIDTH, 5);
  const maxWater = Math.max(
    1,
    ...resourceHistory.map((p) => Number(p?.water) || 0),
  );
  const maxCalories = Math.max(
    1,
    ...resourceHistory.map((p) => Number(p?.calories) || 0),
  );
  const dayValues = resourceHistory
    .map((p) => Number(p?.day))
    .filter((d) => Number.isFinite(d));
  const minTrendDay = dayValues.length ? Math.min(...dayValues) : 0;
  const maxTrendDay = dayValues.length ? Math.max(...dayValues) : 0;
  const trendDayRange = Math.max(1, maxTrendDay - minTrendDay);
  const waterValueTicks = xTicks.map((tick) => {
    const value = nearestPointValueForDay(resourceHistory, "water", tick.day);
    const y =
      RESOURCE_TREND_CHART_HEIGHT -
      (Math.max(0, value) / maxWater) * RESOURCE_TREND_CHART_HEIGHT;
    return { ...tick, value, y };
  });
  const calorieValueTicks = xTicks.map((tick) => {
    const value = nearestPointValueForDay(resourceHistory, "calories", tick.day);
    const y =
      RESOURCE_TREND_CHART_HEIGHT -
      (Math.max(0, value) / maxCalories) * RESOURCE_TREND_CHART_HEIGHT;
    return { ...tick, value, y };
  });
  const trendWindow =
    resourceHistory.length > 1
      ? `Sol ${resourceHistory[0].day} to ${resourceHistory[resourceHistory.length - 1].day}`
      : `Sol ${currentSol}`;
  const handleTrendMouseLeave = () => {
    setTrendHover(null);
  };
  const handleTrendMouseMove = (event, chart, key, unit, maxValue) => {
    if (!resourceHistory.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pointerX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const ratioX = pointerX / rect.width;
    const targetDay = minTrendDay + ratioX * trendDayRange;
    const value = interpolatedValueForDay(resourceHistory, key, targetDay);
    const xSvg = ratioX * RESOURCE_TREND_CHART_WIDTH;
    const ySvg =
      RESOURCE_TREND_CHART_HEIGHT -
      (Math.max(0, value) / Math.max(1, maxValue)) * RESOURCE_TREND_CHART_HEIGHT;
    const xPx = pointerX;
    const yPx = (ySvg / RESOURCE_TREND_CHART_HEIGHT) * rect.height;

    setTrendHover({
      chart,
      sol: Math.round(targetDay * 10) / 10,
      value: Math.round(value * 10) / 10,
      unit,
      xSvg,
      ySvg,
      xPx,
      yPx,
      placeBelow: yPx < 18,
    });
  };
  const togglePanel = (panelKey) => {
    setCollapsedPanels((prev) => ({
      ...prev,
      [panelKey]: !prev[panelKey],
    }));
  };

  return (
    <div className="gh-overlay">
      <canvas ref={canvasRef} className="gh-canvas" />
      {showLoadingOverlay && (
        <div className="gh-loading-overlay">
          <div className="gh-loading">
            <span className="gh-loading__spinner" />
            <span className="gh-loading__text">{loadingText}</span>
          </div>
        </div>
      )}

      <button className="gh-exit" onClick={handleExit} ref={exitButtonRef}>
        ←{" "}
        {insideDome
          ? `Exit ${insideDome === "ALL" ? "All Domes" : insideDome}`
          : "Exit"}
      </button>

      {!insideDome && (
        <button className="gh-enter-all" onClick={handleEnterFirstDome}>
          ⬡ Enter the Dome
        </button>
      )}

      <div className="gh-date">
        <span className="gh-date-day">Sol {currentSol}</span>
      </div>

      {enterLabel && !insideDome && (
        <button
          className="gh-enter-label"
          style={{ left: enterLabel.x, top: enterLabel.y }}
          onClick={handleEnterDome}
        >
          → ENTER {enterLabel.id}
        </button>
      )}

      {plantHover && (() => {
        const c = plantHover.crop;
        const health = c.health != null ? Math.round(c.health * 100) : null;
        const cumulative = c.cumulative_health != null ? Math.round(c.cumulative_health * 100) : null;
        const stresses = [
          { label: "Water",    val: c.water_stress },
          { label: "Nutrient", val: c.nutrient_stress },
          { label: "Light",    val: c.light_stress },
          { label: "Env",      val: c.env_stress },
        ];
        const stressCls = (pct) => pct >= 75 ? "gh-bar--ok" : pct >= 45 ? "gh-bar--warn" : "gh-bar--crit";
        return (
          <div className="gh-plant-tooltip" style={{ left: plantHover.x, top: plantHover.y }}>
            <div className="gh-plant-tooltip__name">{c.name}</div>
            <div className="gh-plant-tooltip__row">
              <span>Status</span>
              <span>{String(c.status || "unknown").replace(/_/g, " ")}</span>
            </div>
            <div className="gh-plant-tooltip__row">
              <span>Age</span>
              <span>{c.age_days ?? 0} / {c.maturity_days ?? 0} days</span>
            </div>
            <div className="gh-plant-tooltip__row">
              <span>Water use</span>
              <span>{c.water_per_day_l ?? 0} L/day</span>
            </div>
            <div className="gh-plant-tooltip__row">
              <span>Nutrients</span>
              <span>{c.nutrient_per_day_kg ?? 0} kg/day</span>
            </div>
            {health != null && (
              <>
                <div className="gh-plant-tooltip__divider" />
                <div className="gh-plant-tooltip__row">
                  <span>Health</span>
                  <span style={{ color: cumulative != null ? (cumulative >= 75 ? "#6fcf97" : cumulative >= 45 ? "#f2c94c" : "#eb5757") : (health >= 75 ? "#6fcf97" : health >= 45 ? "#f2c94c" : "#eb5757") }}>{cumulative ?? health}%</span>
                </div>
                {stresses.map(({ label, val }) => {
                  if (val == null) return null;
                  const pct = Math.round(val * 100);
                  return (
                    <div key={label} className="gh-plant-tooltip__stress-row">
                      <span className="gh-plant-tooltip__stress-label">{label}</span>
                      <div className="gh-plant-tooltip__bar-track">
                        <div className={`gh-plant-tooltip__bar-fill ${stressCls(pct)}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="gh-plant-tooltip__stress-val">{pct}%</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })()}

      <div className="gh-left-panels" ref={leftPanelsRef}>
      <div className="gh-resource-trends">
        <button
          className="gh-resource-trends__header gh-panel-header-btn"
          type="button"
          onClick={() => togglePanel("trends")}
          aria-label={collapsedPanels.trends ? "Expand resource trends" : "Collapse resource trends"}
        >
          <span className="gh-resource-trends__header-main">
            <span className="gh-panel-arrow" aria-hidden="true">
              <PanelChevron collapsed={collapsedPanels.trends} />
            </span>
            <span>Resource Trends</span>
          </span>
          {!collapsedPanels.trends && (
            <span className="gh-resource-trends__window">{trendWindow}</span>
          )}
        </button>
        <div
          className={`gh-panel-body gh-panel-body--trends${collapsedPanels.trends ? " is-collapsed" : ""}`}
        >
        <div className="gh-resource-trends__chart-wrap">
          <div className="gh-resource-trends__label-row">
            <span>Water over time</span>
            <span>{trendLast ? `${Math.round(trendLast.water)}L` : "..."}</span>
          </div>
          <svg
            className="gh-resource-trends__chart gh-resource-trends__chart--water"
            viewBox={`0 0 ${RESOURCE_TREND_CHART_WIDTH} ${RESOURCE_TREND_CHART_HEIGHT}`}
            preserveAspectRatio="none"
            aria-label="Water availability over time"
            onMouseMove={(e) =>
              handleTrendMouseMove(e, "water", "water", "L", maxWater)
            }
            onMouseLeave={handleTrendMouseLeave}
          >
            <line
              className="gh-resource-trends__axis"
              x1="0"
              y1="0"
              x2="0"
              y2={RESOURCE_TREND_CHART_HEIGHT}
            />
            <line
              className="gh-resource-trends__axis"
              x1="0"
              y1={RESOURCE_TREND_CHART_HEIGHT}
              x2={RESOURCE_TREND_CHART_WIDTH}
              y2={RESOURCE_TREND_CHART_HEIGHT}
            />
            {xTicks.map((tick) => (
              <g key={`water-x-${tick.day}`}>
                <line
                  className="gh-resource-trends__tick"
                  x1={tick.x}
                  y1="0"
                  x2={tick.x}
                  y2={RESOURCE_TREND_CHART_HEIGHT}
                />
              </g>
            ))}
            {waterValueTicks.map((tick) => {
              const label = layoutValueLabel(
                tick,
                tick.value,
                RESOURCE_TREND_CHART_WIDTH,
                RESOURCE_TREND_CHART_HEIGHT,
              );
              return (
                <g key={`water-v-${tick.day}`}>
                  <rect
                    className="gh-resource-trends__value-bg gh-resource-trends__value-bg--water"
                    x={label.boxX}
                    y={label.boxY}
                    width={label.boxWidth}
                    height={label.boxHeight}
                    rx="2"
                    ry="2"
                  />
                  <text
                    className="gh-resource-trends__value-label gh-resource-trends__value-label--water"
                    x={label.textX}
                    y={label.textY}
                    textAnchor="start"
                  >
                    {label.text}
                  </text>
                </g>
              );
            })}
            <text className="gh-resource-trends__y-label" x="3" y="9">
              {Math.round(maxWater)}
            </text>
            <polyline
              className="gh-resource-trends__line"
              points={trendWaterPath.replace(/M|L/g, "").trim()}
            />
            {trendHover?.chart === "water" && (
              <>
                <line
                  className="gh-resource-trends__hover-line"
                  x1={trendHover.xSvg}
                  y1="0"
                  x2={trendHover.xSvg}
                  y2={RESOURCE_TREND_CHART_HEIGHT}
                />
                <circle
                  className="gh-resource-trends__hover-dot gh-resource-trends__hover-dot--water"
                  cx={trendHover.xSvg}
                  cy={trendHover.ySvg}
                  r="2.5"
                />
              </>
            )}
          </svg>
          {trendHover?.chart === "water" && (
            <div
              className={`gh-resource-trends__hover-tip${trendHover.placeBelow ? " is-below" : ""}`}
              style={{ left: trendHover.xPx, top: trendHover.yPx }}
            >
              <span>Sol {trendHover.sol}</span>
              <span>
                {trendHover.value}
                {trendHover.unit}
              </span>
            </div>
          )}
        </div>
        <div className="gh-resource-trends__chart-wrap">
          <div className="gh-resource-trends__label-row">
            <span>Calories over time</span>
            <span>{trendLast ? `${Math.round(trendLast.calories)} kcal` : "..."}</span>
          </div>
          <svg
            className="gh-resource-trends__chart gh-resource-trends__chart--calories"
            viewBox={`0 0 ${RESOURCE_TREND_CHART_WIDTH} ${RESOURCE_TREND_CHART_HEIGHT}`}
            preserveAspectRatio="none"
            aria-label="Calories available over time"
            onMouseMove={(e) =>
              handleTrendMouseMove(e, "calories", "calories", "kcal", maxCalories)
            }
            onMouseLeave={handleTrendMouseLeave}
          >
            <line
              className="gh-resource-trends__axis"
              x1="0"
              y1="0"
              x2="0"
              y2={RESOURCE_TREND_CHART_HEIGHT}
            />
            <line
              className="gh-resource-trends__axis"
              x1="0"
              y1={RESOURCE_TREND_CHART_HEIGHT}
              x2={RESOURCE_TREND_CHART_WIDTH}
              y2={RESOURCE_TREND_CHART_HEIGHT}
            />
            {xTicks.map((tick) => (
              <g key={`calorie-x-${tick.day}`}>
                <line
                  className="gh-resource-trends__tick"
                  x1={tick.x}
                  y1="0"
                  x2={tick.x}
                  y2={RESOURCE_TREND_CHART_HEIGHT}
                />
              </g>
            ))}
            {calorieValueTicks.map((tick) => {
              const label = layoutValueLabel(
                tick,
                tick.value,
                RESOURCE_TREND_CHART_WIDTH,
                RESOURCE_TREND_CHART_HEIGHT,
              );
              return (
                <g key={`calorie-v-${tick.day}`}>
                  <rect
                    className="gh-resource-trends__value-bg gh-resource-trends__value-bg--calories"
                    x={label.boxX}
                    y={label.boxY}
                    width={label.boxWidth}
                    height={label.boxHeight}
                    rx="2"
                    ry="2"
                  />
                  <text
                    className="gh-resource-trends__value-label gh-resource-trends__value-label--calories"
                    x={label.textX}
                    y={label.textY}
                    textAnchor="start"
                  >
                    {label.text}
                  </text>
                </g>
              );
            })}
            <text className="gh-resource-trends__y-label" x="3" y="9">
              {Math.round(maxCalories)}
            </text>
            <polyline
              className="gh-resource-trends__line"
              points={trendCaloriesPath.replace(/M|L/g, "").trim()}
            />
            {trendHover?.chart === "calories" && (
              <>
                <line
                  className="gh-resource-trends__hover-line"
                  x1={trendHover.xSvg}
                  y1="0"
                  x2={trendHover.xSvg}
                  y2={RESOURCE_TREND_CHART_HEIGHT}
                />
                <circle
                  className="gh-resource-trends__hover-dot gh-resource-trends__hover-dot--calories"
                  cx={trendHover.xSvg}
                  cy={trendHover.ySvg}
                  r="2.5"
                />
              </>
            )}
          </svg>
          {trendHover?.chart === "calories" && (
            <div
              className={`gh-resource-trends__hover-tip${trendHover.placeBelow ? " is-below" : ""}`}
              style={{ left: trendHover.xPx, top: trendHover.yPx }}
            >
              <span>Sol {trendHover.sol}</span>
              <span>
                {trendHover.value}
                {trendHover.unit}
              </span>
            </div>
          )}
        </div>
        </div>
      </div>
      <div className="gh-agent-logs">
        <button
          className="gh-agent-logs__header gh-panel-header-btn"
          type="button"
          onClick={() => togglePanel("logs")}
          aria-label={collapsedPanels.logs ? "Expand agent logs" : "Collapse agent logs"}
        >
          <span className="gh-panel-heading">
            <span className="gh-panel-arrow" aria-hidden="true">
              <PanelChevron collapsed={collapsedPanels.logs} />
            </span>
            <span>Agent Logs</span>
          </span>
        </button>
        <div
          className={`gh-panel-body gh-panel-body--logs${collapsedPanels.logs ? " is-collapsed" : ""}`}
        >
        {!hasLiveState ? (
          <div className="gh-agent-logs__empty">
            Waiting for simulation state…
          </div>
        ) : !agentTabs.length ? (
          <div className="gh-agent-logs__empty">
            No logs yet. Agents will appear here as they run.
          </div>
        ) : (
          <>
            <div className="gh-agent-logs__tabs">
              {agentTabs.map((name) => (
                <button
                  key={name}
                  className={`gh-agent-logs__tab ${name === activeTab ? "is-active" : ""}`}
                  onClick={() => setActiveAgentTab(name)}
                  type="button"
                >
                  {prettyAgentName(name)}
                </button>
              ))}
            </div>
            <div className="gh-agent-logs__list" ref={logsListRef}>
              {visibleAgentEntries.length === 0 ? (
                <div className="gh-agent-logs__empty">
                  No entries for this agent yet.
                </div>
              ) : (
                visibleAgentEntries.map((entry, idx) => (
                  <div
                    key={`${activeTab}-${idx}`}
                    className="gh-agent-logs__entry"
                  >
                    <div className="gh-agent-logs__meta">
                      Sol {entry?.day ?? "?"}
                    </div>
                    <div className="gh-agent-logs__block">
                      {Array.isArray(entry?.task_lines) &&
                      entry.task_lines.length > 0 ? (
                        entry.task_lines
                          .slice(0, MAX_VISIBLE_TASK_LINES)
                          .map((line, i) => (
                            <div key={`task-${i}`} className="gh-agent-logs__line gh-agent-logs__line--task">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {`Task: ${line}`}
                              </ReactMarkdown>
                            </div>
                          ))
                      ) : null}
                      {Array.isArray(entry?.response_lines) &&
                      entry.response_lines.length > 0 ? (
                        entry.response_lines
                          .slice(0, MAX_VISIBLE_RESPONSE_LINES)
                          .map((line, i) => (
                          <div key={`resp-${i}`} className="gh-agent-logs__line">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {String(line || "")}
                            </ReactMarkdown>
                          </div>
                          ))
                      ) : (
                        <div className="gh-agent-logs__line">
                          No response content.
                        </div>
                      )}
                    </div>
                  </div>
                  ))
              )}
            </div>
          </>
        )}
        </div>
      </div>

      <div className="gh-resources">
        <button
          className="gh-resources__header gh-panel-header-btn"
          type="button"
          onClick={() => togglePanel("resources")}
          aria-label={collapsedPanels.resources ? "Expand resources panel" : "Collapse resources panel"}
        >
          <span className="gh-panel-heading">
            <span className="gh-panel-arrow" aria-hidden="true">
              <PanelChevron collapsed={collapsedPanels.resources} />
            </span>
            <span>Resources</span>
          </span>
        </button>
        <div
          className={`gh-panel-body gh-panel-body--resources${collapsedPanels.resources ? " is-collapsed" : ""}`}
        >
        {!hasLiveState ? (
          <div className="gh-resources__sync">
            Syncing live simulation data...
          </div>
        ) : (
          <>
            <div className="gh-resources__tabs">
              <button
                type="button"
                className={`gh-resources__tab ${resourcesTab === "overview" ? "is-active" : ""}`}
                onClick={() => setResourcesTab("overview")}
              >
                Overview
              </button>
              <button
                type="button"
                className={`gh-resources__tab ${resourcesTab === "vitamins" ? "is-active" : ""}`}
                onClick={() => setResourcesTab("vitamins")}
              >
                Vitamins
              </button>
            </div>
            {resourcesTab === "overview" ? (
              <>
            <div className="gh-resources__row">
              <span className="gh-resources__label">Water</span>
              <div className="gh-resources__bar-track">
                <div
                  className={`gh-resources__bar-fill ${barClass(waterPct)}`}
                  style={{
                    width: `${Math.max(0, Math.min(100, waterPct * 100))}%`,
                  }}
                />
              </div>
              <span className="gh-resources__value">
                {Math.round(hud.waterL)}L
              </span>
            </div>
            <div className="gh-resources__row">
              <span className="gh-resources__label">Calories</span>
              <div className="gh-resources__bar-track">
                <div
                  className={`gh-resources__bar-fill ${
                    hud.caloriesNeededPerDay > 0
                      ? hud.caloriesAvailable / hud.caloriesNeededPerDay > 3
                        ? "gh-bar--ok"
                        : hud.caloriesAvailable / hud.caloriesNeededPerDay > 1
                          ? "gh-bar--warn"
                          : "gh-bar--crit"
                      : "gh-bar--crit"
                  }`}
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        hud.caloriesNeededPerDay > 0
                          ? (hud.caloriesAvailable /
                              (hud.caloriesNeededPerDay * 10)) *
                              100
                          : 0,
                      ),
                    )}%`,
                  }}
                />
              </div>
              <span className="gh-resources__value">
                {Math.round(hud.caloriesAvailable).toLocaleString()} kcal
              </span>
            </div>
            <div className="gh-resources__row">
              <span className="gh-resources__label">Crops</span>
              <span className="gh-resources__value gh-resources__value--wide">
                {hud.cropsGrowing} growing / {hud.cropsReady} ready
                {hud.harvestedCount > 0 && ` / ${hud.harvestedCount} harvested`}
              </span>
            </div>
              </>
            ) : (
              <div className="gh-resources__vitamins">
                <div className="gh-resources__vitamins-title">
                  Essential Vitamins (from consumed food)
                </div>
                {hud.caloriesConsumedToday > 0 && (
                  <div className="gh-resources__subtle">
                    Consumed today: {Math.round(hud.caloriesConsumedToday).toLocaleString()} kcal
                  </div>
                )}
                {vitaminOrder.map((vit) => {
                  const pct = Math.max(0, Number(hud.vitaminLevels?.[vit]) || 0);
                  return (
                    <div key={vit} className="gh-resources__vitamin-row">
                      <span className="gh-resources__vitamin-label">{vit}</span>
                      <div className="gh-resources__bar-track">
                        <div
                          className={`gh-resources__bar-fill ${vitaminBarClass(pct)}`}
                          style={{
                            width: `${Math.max(0, Math.min(100, pct))}%`,
                          }}
                        />
                      </div>
                      <span className="gh-resources__value">{Math.round(pct)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
            {resourcesTab === "overview" && (
              <>
            <div className="gh-resources__env">
              <span className="gh-resources__env-item">{hud.tempC}°C</span>
              <span className="gh-resources__env-sep">·</span>
              <span className="gh-resources__env-item">{hud.co2Ppm}ppm</span>
              <span className="gh-resources__env-sep">·</span>
              <span className="gh-resources__env-item">
                {hud.humidityPct}%RH
              </span>
              <span className="gh-resources__env-sep">·</span>
              <span className="gh-resources__env-item">
                {hud.lightHours}h light
              </span>
            </div>

            {Object.keys(hud.cropBreakdown).length > 0 && (
              <div className="gh-resources__crop-breakdown">
                {Object.entries(hud.cropBreakdown).map(([name, count]) => (
                  <span
                    key={name}
                    className="gh-resources__crop-chip"
                    style={cropChipStyle(name)}
                  >
                    {name}: {count}
                  </span>
                ))}
              </div>
            )}

            {hud.seedReserve && Object.keys(hud.seedReserve).length > 0 && (
              <div className="gh-resources__crop-breakdown">
                <span className="gh-resources__label" style={{ width: '100%', marginBottom: 2 }}>Seed Reserve</span>
                {Object.entries(hud.seedReserve).map(([name, count]) => (
                  <span
                    key={`reserve-${name}`}
                    className="gh-resources__crop-chip"
                    style={cropChipStyle(name)}
                  >
                    {name}: {count}
                  </span>
                ))}
              </div>
            )}

            {hud.activeEvents.length > 0 && (
              <div className="gh-resources__events">
                {hud.activeEvents.map((ev) => (
                  <span key={ev} className="gh-resources__event-tag">
                    {ev.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
              </>
            )}
          </>
        )}
        </div>
      </div>
      </div>

      <div className="gh-timeline">
        <button
          className="gh-timeline-play"
          onClick={() => setIsPlaying((p) => !p)}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <button
          className={`gh-timeline-play gh-timeline-ff${isFastForward ? " gh-timeline-ff--active" : ""}`}
          onClick={() => setIsFastForward((f) => !f)}
          aria-label={isFastForward ? "Normal speed" : "Fast forward (3x)"}
        >
          ▶▶
        </button>
        <div className="gh-timeline-track">
          <span className="gh-timeline-label">Sol 1</span>
          <input
            type="range"
            className="gh-timeline-slider"
            min={1}
            max={totalDays}
            value={isDragging ? sliderValue : Math.max(1, Math.min(totalDays, currentSol))}
            onChange={handleSliderChange}
            onMouseUp={handleSliderCommit}
            onTouchEnd={handleSliderCommit}
          />
          <span className="gh-timeline-label">Sol {totalDays}</span>
        </div>
      </div>
    </div>
  );
}
