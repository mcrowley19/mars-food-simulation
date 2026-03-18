import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Mars from "./components/Mars";
import Stars from "./components/Stars";
import InitialiseSession from "./components/InitialiseSession";
import LearnMore from "./components/LearnMore";
import GreenhouseScene from "./components/GreenhouseScene";
import "./App.css";

function App() {
  const [screen, setScreen] = useState("landing");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [simConfig, setSimConfig] = useState(null);

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
    const seedSummary = Array.isArray(config?.seedTypes)
      ? config.seedTypes.join(", ")
      : "mixed crops";
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

    try {
      await fetch("http://localhost:8000/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    } catch {
      // Backend may be unavailable; UI should remain responsive.
    }

    setSimConfig(config);
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
        <GreenhouseScene onExit={() => setScreen("landing")} totalDays={simConfig?.timeframe ?? 350} />
      )}
    </div>
  );
}

export default App;
