import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Mars from "./components/Mars";
import Stars from "./components/Stars";
import InitialiseSession from "./components/InitialiseSession";
import SetupScreen from "./components/SetupScreen";
import "./App.css";

const API = "http://localhost:8000";

function App() {
  const [screen, setScreen] = useState("landing");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [initialState, setInitialState] = useState(null);

  // Check setup status on mount
  useEffect(() => {
    fetch(`${API}/setup-status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.setup_complete) {
          setSetupComplete(true);
        }
      })
      .catch(() => {});
  }, []);

  const isDashboard = screen === "dashboard";

  const handleLaunch = () => {
    if (isTransitioning || isDashboard) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setScreen("dashboard");
      setIsTransitioning(false);
    }, 900);
  };

  const handleSetupComplete = (state) => {
    setSetupComplete(true);
    setInitialState(state);
  };

  const handleBackToLanding = () => {
    setScreen("landing");
  };

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
        {!setupComplete ? (
          <SetupScreen onSetupComplete={handleSetupComplete} />
        ) : (
          <InitialiseSession
            onBack={handleBackToLanding}
            disableBackdropClose={true}
            initialState={initialState}
          />
        )}
      </div>
    </div>
  );
}

export default App;
