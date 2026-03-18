import './LearnMore.css'

const FEATURES = [
  {
    tag: 'SIM',
    title: 'Physics-Based Simulation',
    desc: 'Every sol the engine runs a full resource loop — photosynthesis rates are calculated against your dome\'s light exposure, CO₂ levels, and available water. Crops grow, wilt, or thrive based on real agronomic models adapted for Martian gravity and radiation.',
  },
  {
    tag: 'AGR',
    title: 'Multi-Crop Agriculture',
    desc: 'Select from 10 crop varieties, each with distinct caloric output, water demand, and growth cycle. Manage intercropping strategies to maximise yield per m² while keeping your crew fed across the full mission duration.',
  },
  {
    tag: 'CRW',
    title: 'Crew Management',
    desc: 'Your astronauts consume calories, water and oxygen every sol. Monitor individual health metrics, assign crew to greenhouse duties, and balance work schedules against rest requirements to maintain peak productivity.',
  },
  {
    tag: 'ENV',
    title: 'Martian Environment',
    desc: 'Mars throws dust storms, temperature swings of over 100 °C between day and night, and cosmic radiation events. Your dome integrity and ECLSS systems must be kept operational or the cascade of failures begins fast.',
  },
  {
    tag: 'RES',
    title: 'Resource Chains',
    desc: 'Water is recycled through a closed-loop ECLSS. Fertilizer is synthesised from regolith and crew waste. Track every kilogram — resupply missions are 6-month round trips and the simulation will not wait for them.',
  },
  {
    tag: 'BIO',
    title: 'Pollinator Ecosystem',
    desc: 'Introduce insect colonies to boost crop yield by up to 30%. Maintain healthy pollinator populations by ensuring adequate flowering plants, temperature stability, and pesticide-free pest management strategies.',
  },
]

const DAILY = [
  {
    icon: '◎',
    title: 'Sol Report',
    desc: 'Every simulated sol generates a full mission report — calories grown vs. consumed, water balance, crop health per bay, and crew status. Spot shortfalls before they become emergencies.',
  },
  {
    icon: '◈',
    title: 'Alerts & Events',
    desc: 'Random events fire throughout the simulation: equipment failures, dust storms, crew illness, unexpected crop blight. Each alert surfaces in the daily feed with a time window to respond.',
  },
  {
    icon: '◇',
    title: 'Trend Graphs',
    desc: 'Visualise caloric surplus/deficit, water reserves, and crop yield trajectories across the full mission timeline. Identify inflection points before your stockpiles hit critical thresholds.',
  },
  {
    icon: '◉',
    title: 'Intervention Log',
    desc: 'Every decision you make — rerouting water, adjusting grow-light schedules, isolating a sick crew member — is logged with its downstream effect on mission outcomes.',
  },
]

export default function LearnMore({ onClose }) {
  return (
    <div className="lm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lm-panel">

        {/* ── Header ── */}
        <div className="lm-header">
          <div className="lm-header__text">
            <span className="lm-mono">PLATFORM · OVERVIEW</span>
            <h1 className="lm-h1">How the Simulation Works</h1>
            <p className="lm-lead">
              A closed-system model of food production on Mars — built for researchers,
              educators, and space-agriculture enthusiasts who want to stress-test
              survival strategies before humanity needs them for real.
            </p>
          </div>
          <button className="lm-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Simulation features ── */}
        <section className="lm-section">
          <div className="lm-section__label">
            <span className="lm-mono">01 — SIMULATION ENGINE</span>
          </div>
          <div className="lm-features-grid">
            {FEATURES.map(f => (
              <div key={f.tag} className="lm-feature-card">
                <div className="lm-feature-card__top">
                  <span className="lm-tag">{f.tag}</span>
                  <h3 className="lm-feature-card__title">{f.title}</h3>
                </div>
                <p className="lm-feature-card__desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Daily checkup ── */}
        <section className="lm-section">
          <div className="lm-section__label">
            <span className="lm-mono">02 — DAILY CHECKUP</span>
          </div>
          <p className="lm-section__intro">
            Each sol you review four live dashboards that keep you ahead of
            resource shortfalls and crew health crises.
          </p>
          <div className="lm-daily-grid">
            {DAILY.map(d => (
              <div key={d.title} className="lm-daily-card">
                <span className="lm-daily-card__icon">{d.icon}</span>
                <div>
                  <h4 className="lm-daily-card__title">{d.title}</h4>
                  <p className="lm-daily-card__desc">{d.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer CTA ── */}
        <div className="lm-footer">
          <p className="lm-footer__text">Ready to start your mission?</p>
          <button className="lm-footer__close" onClick={onClose}>Got it — close</button>
        </div>

      </div>
    </div>
  )
}
