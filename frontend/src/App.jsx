import { Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Mars from "./components/Mars";
import Stars from "./components/Stars";
import InitialiseSession from "./components/InitialiseSession";
import "./App.css";

async function App() {
  const [screen, setScreen] = useState("landing");
  const response = await fetch("http://localhost:8000/invoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "Plan the first 30 days of crops" }),
  });
  return (
    <div className="landing">
      <div className="canvas-container">
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
            <Mars />
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

      <div className="overlay">
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
            <button className="cta-primary" onClick={() => setScreen("init")}>
              Launch Simulation
            </button>
            <button className="cta-secondary">Learn More</button>
          </div>
        </header>

        <footer className="landing-footer">
          <p>Built for the future of space colonization</p>
        </footer>
      </div>

      {screen === "init" && (
        <InitialiseSession onBack={() => setScreen("landing")} />
      )}
    </div>
  );
}

export default App;
