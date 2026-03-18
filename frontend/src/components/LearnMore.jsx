export default function LearnMore({ onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(5, 2, 8, 0.74)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        display: "grid",
        placeItems: "center",
        padding: "24px",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        style={{
          width: "min(760px, 100%)",
          borderRadius: "16px",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          background: "rgba(18, 12, 26, 0.88)",
          boxShadow: "0 18px 60px rgba(0, 0, 0, 0.45)",
          padding: "28px",
          color: "#f5f0eb",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            marginBottom: "14px",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "28px", fontWeight: 600 }}>
            About Mars Food Simulation
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#f5f0eb",
              borderRadius: "8px",
              padding: "8px 12px",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <p style={{ marginTop: 0, lineHeight: 1.7, color: "rgba(245,240,235,0.85)" }}>
          This simulation explores sustainable crop planning for a Martian habitat.
          Configure mission resources, crew constraints, greenhouse conditions, and
          environmental parameters to test food production strategies over long-duration
          missions.
        </p>
      </section>
    </div>
  );
}
