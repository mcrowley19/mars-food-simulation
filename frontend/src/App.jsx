import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Mars from "./components/Mars";
import Stars from "./components/Stars";
import InitialiseSession from "./components/InitialiseSession";
import LearnMore from "./components/LearnMore";
import GreenhouseScene from "./components/greenhouse/GreenhouseScene";
import "./App.css";

function App() {
  const [screen, setScreen] = useState("landing");
  const [isTransitioning, setIsTransitioning] = useState(false);

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
    const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
      mission_days: config?.timeframe ?? 350,
      astronaut_count: config?.astronauts ?? 4,
      seed_amounts: seedAmounts,
    };

    let setupOk = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`${API}/setup/manual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(setupPayload),
        });
        if (res.ok) {
          const setupState = await res.json();
          if (setupState?.setup_complete) {
            setupOk = true;
            break;
          }
        }
      } catch {}
      await delay(700);
    }

    const seedSummary = types.join(", ") || "mixed crops";
    const prompt = [
      "Create a Mars greenhouse startup plan.",
      `Crew: ${config?.astronauts ?? 4}`,
      `Mission days: ${config?.timeframe ?? 350}`,
      `Water: ${config?.water ?? 2000}L`,
      `Nutrients/Fertilizer: ${config?.fertilizer ?? 500}kg`,
      `Soil: ${config?.soil ?? 1500}kg`,
      `Selected crops: ${seedSummary}`,
      `Weather profile: ${config?.weather ?? "Calm"}`,
      `Air composition: ${config?.airComp ?? "Hab Mix"}`,
    ].join(" ");

    if (setupOk) {
      fetch(`${API}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }).catch(() => {});
    } else {
      // Fallback: still try invoke once in case setup eventually completed server-side.
      fetch(`${API}/invoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }).catch(() => {});
    }

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
            Mars Food
            <br />
            Simulation
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
        <GreenhouseScene onExit={() => setScreen("landing")} />
      )}
    </div>
  );
}

export default App;
