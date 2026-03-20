import { Component } from "react";

/**
 * Prevents a WebGL/shader failure from blanking the whole landing hero (Zen/Firefox edge cases).
 */
export default class LandingCanvasErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="landing-canvas-fallback"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 80% 60% at 50% 45%, #5c2814 0%, #1a0a04 55%, #0a0508 100%)",
            pointerEvents: "none",
          }}
        />
      );
    }
    return this.props.children;
  }
}
