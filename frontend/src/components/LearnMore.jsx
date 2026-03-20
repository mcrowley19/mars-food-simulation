import './LearnMore.css'

const GITHUB_REPO_URL = 'https://github.com/mcrowley19/mars-food-simulation'

const SIM_FEATURES = [
  {
    tag: 'SOL',
    title: 'Sol-by-Sol Simulation',
    desc: 'Each Martian day runs a full resource loop — crew water and calorie consumption, crop growth and ageing, auto-harvest of mature plants, food spoilage, and staggered replanting from seed reserves. All deterministic arithmetic, no AI in the sim loop.',
  },
  {
    tag: 'CRP',
    title: '10 Crop Varieties',
    desc: 'From 25-day radishes to 120-day wheat, each crop has distinct maturity time, water demand, caloric yield, and shelf life. Two-thirds of seeds are planted at launch; the rest are held in reserve for staggered replanting as harvests come in.',
  },
  {
    tag: 'NRG',
    title: 'Energy Model',
    desc: 'Grow lights burn 0.3 kW per m² for ~12 hours a day. Life support runs at 3 kW constant. Fuel yields 3.5 kWh per kg. Run out and lights drop to 10% intensity — crops start to fail and the calorie balance spirals.',
  },
  {
    tag: 'ENV',
    title: 'Martian Events',
    desc: 'Dust storms cut light intensity. CO₂ spikes stress crops. Water recycler faults drain reserves. Event probabilities are sampled from a Mars knowledge base, so each mission plays out differently.',
  },
  {
    tag: 'HPH',
    title: 'Crop Health Scoring',
    desc: 'Four stress factors — water (35%), light (25%), nutrients (20%), environment (20%) — combine into a daily health score. A running cumulative average tracks each plant\'s lifetime condition and scales final yield at harvest.',
  },
  {
    tag: 'ROT',
    title: 'Food Shelf Life',
    desc: 'Harvested food expires — lettuce lasts 7 days, soybeans 120, wheat 180. A running calorie balance tracks harvest gains minus daily crew consumption minus spoiled batches. Let too much rot and your crew starves.',
  },
]

const AGENTS = [
  {
    icon: '⬡',
    title: 'Orchestrator',
    desc: 'The central coordinator. Reads the full simulation state each sol, prioritises water → fuel → calories → stagger plantings, and delegates specific tasks to the five specialist agents below.',
  },
  {
    icon: '⬢',
    title: 'Crop Planner',
    desc: 'Decides which crops to plant and when, balancing seed reserves, shelf life overlap, and caloric targets to keep the crew fed across the entire mission.',
  },
  {
    icon: '⬢',
    title: 'Resource Manager',
    desc: 'Monitors water, nutrients, fuel, and calorie reserves. Flags shortages early and recommends conservation strategies — like reducing water-hungry crops when supply runs low.',
  },
  {
    icon: '⬢',
    title: 'Harvest Optimiser',
    desc: 'Identifies crops that are ready to harvest and decides the best timing — balancing freshness against calorie need so food doesn\'t rot on the shelf before it\'s eaten.',
  },
  {
    icon: '⬢',
    title: 'Environment Monitor',
    desc: 'Watches temperature, CO₂, humidity, and light levels. Recommends parameter adjustments to keep the greenhouse in the optimal growing range for active crops.',
  },
  {
    icon: '⬢',
    title: 'Fault Handler',
    desc: 'Responds to simulation crises — dust storms, fuel depletion, mass crop death. Triages the situation and coordinates emergency measures to keep the mission alive.',
  },
]

const TECH = [
  {
    icon: '◎',
    title: '3D Colony Visualisation',
    desc: 'React 19 and Three.js render a top-down isometric Mars colony — geodesic domes, individual crop meshes that grow and change colour with health, a day/night cycle with dawn and dusk lighting, and per-plant tooltips on hover.',
  },
  {
    icon: '◈',
    title: 'FastAPI Simulation Backend',
    desc: 'A Python backend runs the simulation engine, manages per-session state in DynamoDB, and exposes a REST API. Each browser tab gets its own isolated mission via session IDs — no interference between players.',
  },
  {
    icon: '◇',
    title: 'Strands Agents on Bedrock',
    desc: 'The AI agents use the Strands framework running Amazon Bedrock Nova Micro. Specialist agents are lazy-loaded on first delegation. They can call simulation tools directly — harvesting crops, adjusting water, planting seeds — and query the knowledge base.',
  },
  {
    icon: '◉',
    title: 'MCP Knowledge Base',
    desc: 'A Mars agricultural knowledge base on Bedrock AgentCore provides crop biology, optimal growing conditions, astronaut nutritional requirements, and environmental parameters via an MCP server. Values are sampled from documented ranges, giving realistic mission-to-mission variance.',
  },
]

const CROPS = [
  { name: 'Radish',  maturity: '25 d',  water: '0.15 L', kcal: '160',  shelf: '14 d'  },
  { name: 'Lettuce', maturity: '30 d',  water: '0.20 L', kcal: '150',  shelf: '7 d'   },
  { name: 'Spinach', maturity: '40 d',  water: '0.22 L', kcal: '230',  shelf: '7 d'   },
  { name: 'Kale',    maturity: '55 d',  water: '0.25 L', kcal: '490',  shelf: '10 d'  },
  { name: 'Pea',     maturity: '60 d',  water: '0.30 L', kcal: '810',  shelf: '5 d'   },
  { name: 'Carrot',  maturity: '75 d',  water: '0.30 L', kcal: '410',  shelf: '30 d'  },
  { name: 'Tomato',  maturity: '70 d',  water: '0.60 L', kcal: '180',  shelf: '14 d'  },
  { name: 'Soybean', maturity: '80 d',  water: '0.40 L', kcal: '1 470', shelf: '120 d' },
  { name: 'Potato',  maturity: '90 d',  water: '0.50 L', kcal: '770',  shelf: '60 d'  },
  { name: 'Wheat',   maturity: '120 d', water: '0.30 L', kcal: '3 390', shelf: '180 d' },
]

export default function LearnMore({ onClose }) {
  return (
    <div className="lm-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="lm-panel">

        {/* ── Header ── */}
        <div className="lm-header">
          <div className="lm-header__text">
            <span className="lm-mono">SOL-450 · OVERVIEW</span>
            <h1 className="lm-h1">How It Works</h1>
            <p className="lm-lead">
              A multi-agent greenhouse simulator for long-duration Mars missions.
              Configure a colony, launch AI-managed agricultural systems, and
              watch your crew survive — or not. Every sol, a team of AI agents
              makes autonomous decisions to keep your crops growing and your
              astronauts fed.
            </p>
            <a
              href={GITHUB_REPO_URL}
              className="lm-github-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source on GitHub — mcrowley19/mars-food-simulation
            </a>
          </div>
          <button className="lm-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Setup modes ── */}
        <section className="lm-section">
          <div className="lm-section__label">
            <span className="lm-mono">01 — MISSION SETUP</span>
          </div>
          <p className="lm-section__intro">
            Two ways to launch your mission. <strong>Manual</strong> — configure
            astronaut count, mission duration, floor space, water, nutrients,
            fuel, seed types, and food supplies yourself. <strong>AI-Optimised</strong> — set
            a cargo weight limit and crew size, and an AI agent calculates the
            optimal allocation for you, showing its reasoning before launch.
          </p>
        </section>

        {/* ── Simulation engine ── */}
        <section className="lm-section">
          <div className="lm-section__label">
            <span className="lm-mono">02 — SIMULATION ENGINE</span>
          </div>
          <div className="lm-features-grid">
            {SIM_FEATURES.map(f => (
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

        {/* ── AI agents ── */}
        <section className="lm-section">
          <div className="lm-section__label">
            <span className="lm-mono">03 — AI AGENTS</span>
          </div>
          <p className="lm-section__intro">
            Six AI agents built with the Strands framework on Amazon Bedrock
            coordinate every sol. The orchestrator delegates to five specialists — each
            can read the full sim state, query the Mars knowledge base, and call
            tools to harvest crops, adjust water, plant seeds, and set
            environment parameters directly.
          </p>
          <div className="lm-daily-grid lm-daily-grid--3col">
            {AGENTS.map(a => (
              <div key={a.title} className="lm-daily-card">
                <span className="lm-daily-card__icon">{a.icon}</span>
                <div>
                  <h4 className="lm-daily-card__title">{a.title}</h4>
                  <p className="lm-daily-card__desc">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Tech stack ── */}
        <section className="lm-section">
          <div className="lm-section__label">
            <span className="lm-mono">04 — TECH STACK</span>
          </div>
          <div className="lm-daily-grid">
            {TECH.map(t => (
              <div key={t.title} className="lm-daily-card">
                <span className="lm-daily-card__icon">{t.icon}</span>
                <div>
                  <h4 className="lm-daily-card__title">{t.title}</h4>
                  <p className="lm-daily-card__desc">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Crop reference ── */}
        <section className="lm-section">
          <div className="lm-section__label">
            <span className="lm-mono">05 — CROP REFERENCE</span>
          </div>
          <p className="lm-section__intro">
            Fallback values — the knowledge base may return slightly different
            numbers for each session, giving mission-to-mission variance.
          </p>
          <div className="lm-table-wrap">
            <table className="lm-table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Maturity</th>
                  <th>Water / day</th>
                  <th>kcal / kg</th>
                  <th>Shelf life</th>
                </tr>
              </thead>
              <tbody>
                {CROPS.map(c => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td>{c.maturity}</td>
                    <td>{c.water}</td>
                    <td>{c.kcal}</td>
                    <td>{c.shelf}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
