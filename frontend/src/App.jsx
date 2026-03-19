import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Mars from "./components/Mars";
import Stars from "./components/Stars";
import InitialiseSession from "./components/InitialiseSession";
import LearnMore from "./components/LearnMore";
import GreenhouseScene from "./components/greenhouse/GreenhouseScene";
import { getSessionId } from "./utils/session";
import { API_BASE_URL } from "./utils/api";
import "./App.css";

function App() {
  const [screen, setScreen] = useState("landing");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [awaitAgents, setAwaitAgents] = useState(false);

  const isDashboard = screen === "dashboard";
  const isGreenhouse = screen === "greenhouse";

  const handleLaunch = () => {
    if (isTransitioning || isDashboard || isGreenhouse) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setScreen("dashboard");
      setIsTransitioning(false);
    }, 900);
  };

  const handleBackToLanding = () => {
    setScreen("landing");
  };

  const handleBeginSimulation = async (config) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const sessionId = getSessionId();

    const types = Array.isArray(config?.seedTypes) ? config.seedTypes : [];
    const totalPacks = config?.seedAmt ?? 40;
    const perType = types.length > 0 ? Math.floor(totalPacks / types.length) : 0;
    const seedAmounts = {};
    types.forEach((t, i) => {
      const name = t.toLowerCase();
      seedAmounts[name] = perType + (i < totalPacks % types.length ? 1 : 0);
    });

    const setupPayload = {
      water_l: config?.water ?? 2000,
      fertilizer_kg: config?.fertilizer ?? 500,
      soil_kg: config?.soil ?? 1500,
      floor_space_m2: config?.space ?? 80,
      mission_days: config?.timeframe ?? 450,
      astronaut_count: config?.astronauts ?? 4,
      seed_amounts: seedAmounts,
      food_supplies_kcal: config?.foodSupplies ?? 1500000,
      fuel_kg: config?.fuelKg ?? 40000,
    };

    let setupOk = false;
    let setupError = "Manual setup failed.";
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`${API_BASE_URL}/setup/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-id": sessionId },
          body: JSON.stringify(setupPayload),
        });
        if (res.ok) {
          const setupState = await res.json();
          if (setupState?.setup_complete) {
            setupOk = true;
            break;
          }
          setupError = "Setup did not complete successfully.";
        } else {
          const errorText = await res.text().catch(() => "");
          setupError = errorText || `Manual setup failed with HTTP ${res.status}`;
        }
      } catch (e) {
        setupError = e?.message || "Network error while running manual setup.";
      }
      await delay(700);
    }

    if (!setupOk) {
      throw new Error(setupError);
    }

    const seedSummary = types.join(", ") || "mixed crops";
    const prompt = [
      "Create a Mars greenhouse startup plan.",
      `Crew: ${config?.astronauts ?? 4}`,
      `Mission days: ${config?.timeframe ?? 450}`,
      `Water: ${config?.water ?? 2000}L`,
      `Nutrients/Fertilizer: ${config?.fertilizer ?? 500}kg`,
      `Soil: ${config?.soil ?? 1500}kg`,
      `Selected crops: ${seedSummary}`,
      `Weather profile: ${config?.weather ?? "Calm"}`,
      `Air composition: ${config?.airComp ?? "Hab Mix"}`,
    ].join(" ");

    setAwaitAgents(true);
    fetch(`${API_BASE_URL}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ prompt }),
    }).catch(() => {});

    setScreen("greenhouse");
  };

  const handleBeginAI = async (aiCfg) => {
    const sessionId = getSessionId();
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    let startOk = false;
    let startError = "AI setup failed to start.";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${API_BASE_URL}/setup/ai-optimised`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-session-id": sessionId },
          body: JSON.stringify({
            astronaut_count: aiCfg?.astronauts ?? 4,
            mission_days: aiCfg?.timeframe ?? 450,
            max_cargo_kg: aiCfg?.maxCargoKg ?? 50000,
          }),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          startError = detail || `AI setup failed with HTTP ${res.status}`;
        } else {
          startOk = true;
          break;
        }
      } catch (e) {
        startError = e?.message || "Network error while starting AI setup.";
      }
      await delay(1200);
    }

    if (!startOk) {
      throw new Error(startError);
    }

    const startedAt = Date.now();
    const timeoutMs = 240000; // 4 minutes
    let setupState = null;
    while (Date.now() - startedAt < timeoutMs) {
      await delay(2000);
      let statusRes;
      try {
        statusRes = await fetch(`${API_BASE_URL}/setup-status`, {
          headers: { "x-session-id": sessionId },
        });
      } catch {
        continue;
      }
      if (!statusRes.ok) continue;
      const status = await statusRes.json().catch(() => null);
      if (!status) continue;
      if (status.ai_setup_error) {
        throw new Error(`AI setup failed: ${status.ai_setup_error}`);
      }
      if (status.setup_complete && status.setup_mode === "ai_optimised") {
        const stateRes = await fetch(`${API_BASE_URL}/state`, {
          headers: { "x-session-id": sessionId },
        });
        if (!stateRes.ok) {
          throw new Error("AI setup completed, but state retrieval failed.");
        }
        setupState = await stateRes.json();
        break;
      }
    }

    if (!setupState) {
      throw new Error("AI setup timed out. Please try again.");
    }

    // Return state so InitialiseSession can show the summary card
    return setupState;
  };

  const handleLaunchAI = (aiState) => {
    const sessionId = getSessionId();

    const prompt = [
      "The AI has set up the greenhouse with optimal supplies for 4 astronauts over 450 sols.",
      aiState.ai_setup_reasoning ? `Reasoning: ${aiState.ai_setup_reasoning}` : "",
      "Assess the initial state and begin managing the greenhouse.",
    ].filter(Boolean).join(" ");

    setAwaitAgents(true);
    fetch(`${API_BASE_URL}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ prompt }),
    }).catch(() => {});

    setScreen("greenhouse");
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const tag = target?.tagName?.toLowerCase?.();
      const isTypingField =
        target?.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select";

      if (
        event.code === "Space" &&
        screen === "landing" &&
        !isTransitioning &&
        !isTypingField
      ) {
        event.preventDefault();
        setIsTransitioning(true);
        setTimeout(() => {
          setScreen("dashboard");
          setIsTransitioning(false);
        }, 900);
      }

      if (
        event.key === "Escape" &&
        (screen === "dashboard" || screen === "learn" || screen === "greenhouse")
      ) {
        event.preventDefault();
        setScreen("landing");
        setIsTransitioning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen, isTransitioning]);

  return (
    <div className="landing">
      <div
        className={`canvas-container ${
          isTransitioning || isDashboard ? "canvas-container--dashboard" : ""
        }`}
      >
        <Canvas
          camera={{ position: [0, 0, 5.5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
        >
          <ambientLight intensity={0.08} />
          <directionalLight
            position={[5, 2, 5]}
            intensity={2.2}
            color="#fff0dc"
          />
          <directionalLight
            position={[-4, -1, 3]}
            intensity={0.15}
            color="#ff8050"
          />
          <pointLight position={[-6, 3, -4]} intensity={0.4} color="#ffd4b8" />
          <Suspense fallback={null}>
            <Mars dashboardActive={isTransitioning || isDashboard} />
            <Stars />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            rotateSpeed={0.3}
            autoRotate={false}
          />
        </Canvas>
      </div>

      <div
        className={`overlay ${
          isTransitioning || isDashboard ? "overlay--exit-left" : ""
        }`}
      >
        <header className="hero-header">
          <span className="tagline">Simulation Platform</span>
          <h1>
            Sol-450
          </h1>
          <p className="subtitle">
            Modeling sustainable agriculture for humanity's next frontier.
            Growing food on Mars starts here.
          </p>
          <div className="cta-group">
            <button className="cta-primary" onClick={handleLaunch}>
              Launch Simulation
            </button>
            <button className="cta-secondary" onClick={() => setScreen("learn")}>Learn More</button>
          </div>
        </header>

        <footer className="landing-footer">
          <p>Built for the future of space colonization</p>
        </footer>
      </div>

      <div
        className={`dashboard-shell ${
          isTransitioning || isDashboard ? "dashboard-shell--active" : ""
        }`}
      >
        <InitialiseSession
          onBack={handleBackToLanding}
          disableBackdropClose={true}
          onBeginSimulation={handleBeginSimulation}
          onBeginAI={handleBeginAI}
          onLaunchAI={handleLaunchAI}
        />
      </div>

      <div
        className={`keyboard-hints ${
          isDashboard ? "keyboard-hints--dashboard" : "keyboard-hints--landing"
        }`}
      >
        <div className="keyboard-hints__chip">
          <span className="keyboard-hints__label">Quick Nav</span>
        </div>
        {screen === "landing" && (
          <div className="keyboard-hints__chip">
            <kbd>Space</kbd>
            <span>Launch Dashboard</span>
          </div>
        )}
        {(screen === "dashboard" || screen === "learn" || screen === "greenhouse") && (
          <div className="keyboard-hints__chip">
            <kbd>Esc</kbd>
            <span>Back to Landing</span>
          </div>
        )}
      </div>
      {screen === "learn" && <LearnMore onClose={() => setScreen("landing")} />}
      {screen === "greenhouse" && (
        <GreenhouseScene onExit={() => { setScreen("landing"); setAwaitAgents(false); }} awaitAgents={awaitAgents} />
      )}
    </div>
  );
}

export default App;
