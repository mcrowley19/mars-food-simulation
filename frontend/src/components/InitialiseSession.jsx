import { useState } from 'react'
import './InitialiseSession.css'

const SEED_OPTIONS  = ['Potato', 'Wheat', 'Lettuce', 'Tomato', 'Soybean', 'Spinach', 'Radish', 'Pea', 'Kale', 'Carrot']

// Kcal per kg for each crop and maturity days — used to compute minimum food supplies
const CROP_DATA = {
  Potato:  { maturity: 90 },
  Wheat:   { maturity: 120 },
  Lettuce: { maturity: 30 },
  Tomato:  { maturity: 70 },
  Soybean: { maturity: 80 },
  Spinach: { maturity: 40 },
  Radish:  { maturity: 25 },
  Pea:     { maturity: 60 },
  Kale:    { maturity: 55 },
  Carrot:  { maturity: 75 },
}
const CREW_KCAL_PER_DAY = 2500

function calcMinFuelKg(space, timeframe) {
  const dailyKwh = (0.3 * space * 12) + (3.0 * 24)
  return Math.ceil((dailyKwh * timeframe) / 3.5)
}

function calcMinFoodKcal(astronauts, seedTypes) {
  if (seedTypes.length === 0) return astronauts * CREW_KCAL_PER_DAY * 30
  const fastest = Math.min(...seedTypes.map(s => CROP_DATA[s]?.maturity ?? 60))
  return astronauts * CREW_KCAL_PER_DAY * fastest
}

const DEFAULTS = {
  fertilizer: 500,
  water:       2000,
  soil:        1500,
  space:       20,
  seedAmt:     40,
  seedTypes:   ['Potato', 'Wheat', 'Lettuce'],
  bugs:        20,
  astronauts:  4,
  timeframe:   450,
  foodSupplies: 1500000,
  fuelKg:       40000,
}

/* ── Stepper ── */
function Stepper({ value, onChange, min = 0, max = Infinity, step = 1, unit }) {
  return (
    <div className="is-stepper">
      <button
        className="is-stepper__btn"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
      >−</button>
      <span className="is-stepper__display">
        <span className="is-stepper__val">{value.toLocaleString()}</span>
        {unit && <span className="is-stepper__unit">{unit}</span>}
      </span>
      <button
        className="is-stepper__btn"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
      >+</button>
    </div>
  )
}

/* ── Multi-select chips ── */
function Chips({ options, selected, onChange }) {
  const toggle = opt =>
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt])
  return (
    <div className="is-chips">
      {options.map(opt => (
        <button
          key={opt}
          className="is-chip"
          data-active={selected.includes(opt)}
          onClick={() => toggle(opt)}
        >{opt}</button>
      ))}
    </div>
  )
}

/* ── Param row ── */
function ParamRow({ label, children }) {
  return (
    <div className="is-param-row">
      <span className="is-param-row__label">{label}</span>
      <div className="is-param-row__control">{children}</div>
    </div>
  )
}

/* ── Main component ── */
export default function InitialiseSession({ onBack, disableBackdropClose = false, onBeginSimulation, onBeginAI, onLaunchAI }) {
  const [mode, setMode]           = useState(null) // null = choosing, 'manual' = form, 'ai' = loading, 'ai-review' = summary
  const [cfg, setCfg]             = useState(DEFAULTS)
  const [launching, setLaunching] = useState(false)
  const [manualError, setManualError] = useState('')
  const [aiState, setAiState]     = useState(null)
  const [aiLogs, setAiLogs]       = useState([])
  const [aiError, setAiError]     = useState('')
  const [aiCfg, setAiCfg]         = useState({ astronauts: 4, timeframe: 450, maxCargoKg: 50000 })
  const setAi = (key, val) => setAiCfg(prev => ({ ...prev, [key]: val }))

  const set    = (key, val) => setCfg(prev => {
    const next = { ...prev, [key]: val }
    // Auto-clamp food supplies when astronauts or seed types change
    if (key === 'astronauts' || key === 'seedTypes') {
      const min = calcMinFoodKcal(next.astronauts, next.seedTypes)
      if (next.foodSupplies < min) next.foodSupplies = min
    }
    // Auto-clamp fuel when space or timeframe changes
    if (key === 'space' || key === 'timeframe') {
      const min = calcMinFuelKg(next.space, next.timeframe)
      if (next.fuelKg < min) next.fuelKg = min
    }
    return next
  })
  const reset  = () => setCfg(DEFAULTS)

  const foodKg = Math.round(cfg.foodSupplies / 1500) // ~1.5 kcal/g for packed food
  const totalSupplies = cfg.fertilizer + cfg.water + cfg.soil + foodKg + cfg.fuelKg
  const minFoodKcal = calcMinFoodKcal(cfg.astronauts, cfg.seedTypes)
  const minFuelKg = calcMinFuelKg(cfg.space, cfg.timeframe)

  const changedCount = [
    cfg.fertilizer    !== DEFAULTS.fertilizer,
    cfg.water         !== DEFAULTS.water,
    cfg.soil          !== DEFAULTS.soil,
    cfg.foodSupplies  !== DEFAULTS.foodSupplies,
    cfg.fuelKg        !== DEFAULTS.fuelKg,
    cfg.space         !== DEFAULTS.space,
    cfg.seedAmt       !== DEFAULTS.seedAmt,
    cfg.bugs          !== DEFAULTS.bugs,
    cfg.astronauts    !== DEFAULTS.astronauts,
    cfg.timeframe     !== DEFAULTS.timeframe,
  ].filter(Boolean).length

  const handleBegin = async () => {
    setLaunching(true)
    setManualError('')
    try {
      if (onBeginSimulation) {
        await onBeginSimulation(cfg)
      } else {
        await new Promise(resolve => setTimeout(resolve, 1200))
      }
    } catch (e) {
      setManualError(e?.message || 'Something went wrong while starting the manual setup. Please try again.')
    } finally {
      setLaunching(false)
    }
  }

  const handleAIBegin = async () => {
    setMode('ai')
    setAiLogs([])
    setAiError('')

    const LOG_STEPS = [
      { delay: 0,    text: 'Initialising crop planner agent…' },
      { delay: 1200, text: 'Connecting to Mars Knowledge Base…' },
      { delay: 2800, text: 'Querying crop yield data for 10 seed types…' },
      { delay: 5000, text: 'Analysing nutritional coverage for 4 astronauts × 450 sols…' },
      { delay: 7500, text: 'Evaluating water & nutrient budgets under Mars constraints…' },
      { delay: 10000, text: 'Optimising seed ratios for caloric density and micronutrient diversity…' },
      { delay: 13000, text: 'Computing floor space and staggered planting schedule…' },
      { delay: 16000, text: 'Running final validation checks…' },
    ]

    const timers = []
    for (const step of LOG_STEPS) {
      timers.push(setTimeout(() => {
        setAiLogs(prev => [...prev, { time: Date.now(), text: step.text }])
      }, step.delay))
    }
    try {
      if (onBeginAI) {
        const state = await onBeginAI(aiCfg)
        timers.forEach(clearTimeout)
        setAiLogs(prev => [...prev, { time: Date.now(), text: 'Optimal loadout computed. Ready for review.', done: true }])
        setAiState(state)
        await new Promise(r => setTimeout(r, 800))
        setMode('ai-review')
      }
    } catch (e) {
      timers.forEach(clearTimeout)
      const message = e?.message || 'Something went wrong. Please try again.'
      setAiError(message)
      setAiLogs(prev => [...prev, { time: Date.now(), text: `Error: ${message}`, error: true }])
    }
  }

  if (mode === null) {
    return (
      <div
        className="is-overlay"
        onClick={e => {
          if (!disableBackdropClose && e.target === e.currentTarget) onBack()
        }}
      >
        <div className="is-panel is-panel--mode-select">
          <div className="is-topbar">
            <button className="is-back" onClick={onBack}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div className="is-title">
              <span className="is-title__mono">SYS · INIT</span>
              <h1 className="is-title__h1">Choose Setup Mode</h1>
            </div>
            <div style={{ width: 160 }} />
          </div>

          <div className="is-mode-select">
            <button className="is-mode-card" onClick={() => setMode('manual')}>
              <span className="is-mode-card__tag">MANUAL</span>
              <span className="is-mode-card__title">Custom Supplies</span>
              <span className="is-mode-card__desc">
                Configure every parameter yourself — water, seeds, crew size, floor space, and more.
              </span>
            </button>

            <button className="is-mode-card is-mode-card--ai" onClick={() => setMode('ai-config')}>
              <span className="is-mode-card__tag">AI OPTIMISED</span>
              <span className="is-mode-card__title">Optimal Loadout</span>
              <span className="is-mode-card__desc">
                Set crew size, mission duration and cargo capacity — AI handles the rest.
              </span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'ai-config') {
    return (
      <div className="is-overlay">
        <div className="is-panel is-panel--mode-select">
          <div className="is-topbar">
            <button className="is-back" onClick={() => setMode(null)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div className="is-title">
              <span className="is-title__mono">SYS · AI</span>
              <h1 className="is-title__h1">Mission Parameters</h1>
            </div>
            <div style={{ width: 160 }} />
          </div>

          <div className="is-ai-config">
            <div className="is-card">
              <div className="is-card__header">
                <span className="is-card__tag">MSN</span>
                <span className="is-card__name">Mission Constraints</span>
              </div>
              <ParamRow label="Astronauts">
                <Stepper value={aiCfg.astronauts} onChange={v => setAi('astronauts', v)} min={1} max={12} step={1} unit="crew" />
              </ParamRow>
              <ParamRow label="Duration">
                <Stepper value={aiCfg.timeframe} onChange={v => setAi('timeframe', v)} min={50} step={10} unit="sols" />
              </ParamRow>
              <ParamRow label="Max Cargo">
                <Stepper value={aiCfg.maxCargoKg} onChange={v => setAi('maxCargoKg', v)} min={5000} step={5000} unit="kg" />
              </ParamRow>
              <div className="is-card__hint">
                The AI will optimise seeds, water, food, fuel and floor space to fit within {aiCfg.maxCargoKg.toLocaleString()} kg
              </div>
            </div>

            <button className="is-btn-begin is-btn-begin--ai" onClick={handleAIBegin}>
              Run AI Optimisation
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'ai') {
    return (
      <div className="is-overlay">
        <div className="is-panel is-panel--mode-select">
          <div className="is-topbar is-topbar--left">
            <div className="is-title is-title--left">
              <span className="is-title__mono">SYS · AI</span>
              <h1 className="is-title__h1">AI Optimised Setup</h1>
            </div>
          </div>
          <div className="is-ai-terminal">
            <div className="is-ai-terminal__header">
              <span className="is-ai-terminal__dot" />
              <span className="is-ai-terminal__dot" />
              <span className="is-ai-terminal__dot" />
              <span className="is-ai-terminal__title">crop-planner-agent</span>
            </div>
            <div className="is-ai-terminal__body">
              {aiLogs.map((log, i) => (
                <div
                  key={i}
                  className={`is-ai-terminal__line${log.done ? ' is-ai-terminal__line--done' : ''}${log.error ? ' is-ai-terminal__line--error' : ''}`}
                >
                  <span className="is-ai-terminal__prefix">›</span>
                  <span className="is-ai-terminal__text">{log.text}</span>
                </div>
              ))}
              {!aiLogs.some(l => l.done || l.error) && (
                <div className="is-ai-terminal__line is-ai-terminal__line--active">
                  <span className="is-ai-terminal__cursor" />
                </div>
              )}
            </div>
            {aiError && (
              <div className="is-ai-loading__actions">
                <button className="is-btn-reset" onClick={() => setMode(null)}>
                  Back
                </button>
                <button className="is-btn-begin" onClick={handleAIBegin}>
                  Retry AI Setup
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (mode === 'ai-review' && aiState) {
    const seeds = aiState.seed_amounts || {}
    const totalPlants = Object.values(seeds).reduce((a, b) => a + b, 0)
    return (
      <div className="is-overlay">
        <div className="is-panel is-panel--mode-select">
          <div className="is-topbar">
            <button className="is-back" onClick={() => setMode(null)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div className="is-title">
              <span className="is-title__mono">SYS · AI</span>
              <h1 className="is-title__h1">Optimal Loadout</h1>
            </div>
            <div style={{ width: 160 }} />
          </div>

          <div className="is-ai-summary">
            <div className="is-ai-summary__card">
              <div className="is-ai-summary__heading">Supply Manifest</div>
              <div className="is-ai-summary__subtitle">
                {aiState.astronaut_count || aiCfg.astronauts} astronauts · {aiState.mission_days || aiCfg.timeframe} sols · {aiCfg.maxCargoKg.toLocaleString()} kg cargo limit
              </div>

              <div className="is-ai-summary__grid">
                <div className="is-ai-summary__item">
                  <span className="is-ai-summary__label">Water</span>
                  <span className="is-ai-summary__value">{(aiState.water_l || 0).toLocaleString()} L</span>
                </div>
                <div className="is-ai-summary__item">
                  <span className="is-ai-summary__label">Fertilizer</span>
                  <span className="is-ai-summary__value">{(aiState.fertilizer_kg || 0).toLocaleString()} kg</span>
                </div>
                <div className="is-ai-summary__item">
                  <span className="is-ai-summary__label">Soil</span>
                  <span className="is-ai-summary__value">{(aiState.soil_kg || 0).toLocaleString()} kg</span>
                </div>
                <div className="is-ai-summary__item">
                  <span className="is-ai-summary__label">Floor Space</span>
                  <span className="is-ai-summary__value">{(aiState.floor_space_m2 || 0).toLocaleString()} m²</span>
                </div>
                <div className="is-ai-summary__item">
                  <span className="is-ai-summary__label">Food Supplies</span>
                  <span className="is-ai-summary__value">{(aiState.food_supplies_kcal || 0).toLocaleString()} kcal</span>
                </div>
                <div className="is-ai-summary__item">
                  <span className="is-ai-summary__label">Fuel</span>
                  <span className="is-ai-summary__value">{(aiState.fuel_kg || 0).toLocaleString()} kg</span>
                </div>
              </div>

              <div className="is-ai-summary__seeds-section">
                <span className="is-ai-summary__seeds-label">Seeds — {totalPlants} plants</span>
                <div className="is-ai-summary__seeds">
                  {Object.entries(seeds).map(([name, count]) => (
                    <span key={name} className="is-ai-summary__seed-chip">
                      {name} <strong>{count}</strong>
                    </span>
                  ))}
                </div>
              </div>

              {aiState.ai_setup_reasoning && (
                <div className="is-ai-summary__reasoning">
                  <span className="is-ai-summary__reasoning-label">AI Reasoning</span>
                  <p className="is-ai-summary__reasoning-text">{aiState.ai_setup_reasoning}</p>
                </div>
              )}
            </div>

            <button
              className="is-btn-begin is-btn-begin--ai"
              onClick={() => onLaunchAI && onLaunchAI(aiState)}
            >
              Begin Mission
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="is-overlay"
      onClick={e => {
        if (!disableBackdropClose && e.target === e.currentTarget) onBack()
      }}
    >
      <div className="is-panel">

        {/* ── Top bar ── */}
        <div className="is-topbar">
          <button className="is-back" onClick={() => setMode(null)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>

          <div className="is-title">
            <span className="is-title__mono">SYS · MANUAL</span>
            <h1 className="is-title__h1">Custom Supplies</h1>
          </div>

          <div className="is-supply-pill">
            <span className="is-supply-pill__label">Total Supplies</span>
            <span className="is-supply-pill__val">{totalSupplies.toLocaleString()} units</span>
          </div>
        </div>

        {/* ── Body: config grid + overview sidebar ── */}
        <div className="is-body">
        <div className="is-grid">

          {/* Supplies */}
          <div className="is-card">
            <div className="is-card__header">
              <span className="is-card__tag">RES</span>
              <span className="is-card__name">Supplies</span>
            </div>
            <ParamRow label="Fertilizer">
              <Stepper value={cfg.fertilizer} onChange={v => set('fertilizer', v)} step={50} unit="kg" />
            </ParamRow>
            <ParamRow label="Water">
              <Stepper value={cfg.water} onChange={v => set('water', v)} step={1000} unit="L" />
            </ParamRow>
            <ParamRow label="Soil">
              <Stepper value={cfg.soil} onChange={v => set('soil', v)} step={100} unit="kg" />
            </ParamRow>
            <ParamRow label="Food Supplies">
              <Stepper value={cfg.foodSupplies} onChange={v => set('foodSupplies', Math.max(minFoodKcal, v))} step={10000} min={minFoodKcal} unit="kcal" />
            </ParamRow>
            {cfg.foodSupplies <= minFoodKcal && (
              <div className="is-card__hint">Min {minFoodKcal.toLocaleString()} kcal to survive until first harvest</div>
            )}
            <ParamRow label="Fuel">
              <Stepper value={cfg.fuelKg} onChange={v => set('fuelKg', Math.max(minFuelKg, v))} step={1000} min={minFuelKg} unit="kg" />
            </ParamRow>
            {cfg.fuelKg <= minFuelKg && (
              <div className="is-card__hint">Min {minFuelKg.toLocaleString()} kg fuel for lights + life support</div>
            )}
          </div>

          {/* Greenhouse */}
          <div className="is-card">
            <div className="is-card__header">
              <span className="is-card__tag">GRH</span>
              <span className="is-card__name">Greenhouse</span>
            </div>
            <ParamRow label="Floor Space">
              <Stepper value={cfg.space} onChange={v => set('space', v)} step={10} min={10} unit="m²" />
            </ParamRow>
            <div className="is-card__hint">
              0.25 m² per plant → max {Math.floor(cfg.space / 0.25)} plants
            </div>
            <ParamRow label="Seed Amount">
              <Stepper value={cfg.seedAmt} onChange={v => set('seedAmt', v)} step={5} unit="packs" />
            </ParamRow>
          </div>

          {/* Seed types — wide card */}
          <div className="is-card is-card--wide">
            <div className="is-card__header">
              <span className="is-card__tag">SEED</span>
              <span className="is-card__name">Seed Types</span>
              <span className="is-card__count">{cfg.seedTypes.length} selected</span>
            </div>
            <Chips options={SEED_OPTIONS} selected={cfg.seedTypes} onChange={v => set('seedTypes', v)} />
          </div>

          {/* Crew & Biology */}
          <div className="is-card">
            <div className="is-card__header">
              <span className="is-card__tag">BIO</span>
              <span className="is-card__name">Crew &amp; Organisms</span>
            </div>
            <ParamRow label="Astronauts">
              <Stepper value={cfg.astronauts} onChange={v => set('astronauts', v)} min={1} max={12} step={1} unit="crew" />
            </ParamRow>
            <ParamRow label="Pollinators">
              <Stepper value={cfg.bugs} onChange={v => set('bugs', v)} step={5} unit="insects" />
            </ParamRow>
          </div>

          {/* Mission */}
          <div className="is-card">
            <div className="is-card__header">
              <span className="is-card__tag">MSN</span>
              <span className="is-card__name">Mission</span>
            </div>
            <ParamRow label="Time Frame">
              <Stepper value={cfg.timeframe} onChange={v => set('timeframe', v)} min={50} step={10} unit="sols" />
            </ParamRow>
          </div>

        </div>

        {/* ── Overview sidebar ── */}
        <aside className="is-overview">
          <div className="is-ov__heading">
            <span className="is-ov__mono">OVERVIEW</span>
            <span className="is-ov__badge">{changedCount > 0 ? `${changedCount} modified` : 'defaults'}</span>
          </div>

          <div className="is-ov__section">
            <span className="is-ov__section-label">Crew</span>
            <div className="is-ov__rows">
              <div className="is-ov__row">
                <span className="is-ov__row-key">Astronauts</span>
                <span className="is-ov__row-val">{cfg.astronauts}</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">Pollinators</span>
                <span className="is-ov__row-val">{cfg.bugs.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="is-ov__section">
            <span className="is-ov__section-label">Mission</span>
            <div className="is-ov__rows">
              <div className="is-ov__row">
                <span className="is-ov__row-key">Duration</span>
                <span className="is-ov__row-val">{cfg.timeframe} sols</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">≈ Earth days</span>
                <span className="is-ov__row-val">{Math.round(cfg.timeframe * 1.027)}</span>
              </div>
            </div>
          </div>

          <div className="is-ov__section">
            <span className="is-ov__section-label">Greenhouse</span>
            <div className="is-ov__rows">
              <div className="is-ov__row">
                <span className="is-ov__row-key">Floor space</span>
                <span className="is-ov__row-val">{cfg.space} m²</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">Seed packs</span>
                <span className="is-ov__row-val">{cfg.seedAmt}</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">Crop types</span>
                <span className="is-ov__row-val">{cfg.seedTypes.length}</span>
              </div>
            </div>
          </div>

          <div className="is-ov__section">
            <span className="is-ov__section-label">Supplies</span>
            <div className="is-ov__rows">
              <div className="is-ov__row">
                <span className="is-ov__row-key">Fertilizer</span>
                <span className="is-ov__row-val">{cfg.fertilizer.toLocaleString()} kg</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">Water</span>
                <span className="is-ov__row-val">{cfg.water.toLocaleString()} L</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">Soil</span>
                <span className="is-ov__row-val">{cfg.soil.toLocaleString()} kg</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">Food</span>
                <span className="is-ov__row-val">{cfg.foodSupplies.toLocaleString()} kcal</span>
              </div>
              <div className="is-ov__row">
                <span className="is-ov__row-key">Fuel</span>
                <span className="is-ov__row-val">{cfg.fuelKg.toLocaleString()} kg</span>
              </div>
            </div>
          </div>

          <div className="is-ov__section">
            <span className="is-ov__section-label">Crops</span>
            <div className="is-ov__chips">
              {cfg.seedTypes.length === 0
                ? <span className="is-ov__empty">None selected</span>
                : cfg.seedTypes.map(s => <span key={s} className="is-ov__crop">{s}</span>)
              }
            </div>
          </div>

          <div className="is-ov__total">
            <span className="is-ov__total-label">Total Supplies</span>
            <span className="is-ov__total-val">{totalSupplies.toLocaleString()}</span>
            <span className="is-ov__total-unit">kg / L combined</span>
          </div>

          <div className="is-ov__customised">
            <div className="is-readiness">
              <div className="is-readiness__bar">
                <div className="is-readiness__fill" style={{ width: `${changedCount * 10}%` }} />
              </div>
              <span className="is-readiness__label">{changedCount} of 9 parameters customised</span>
            </div>
          </div>

          <div className="is-ov__actions">
            {manualError && (
              <div className="is-card__hint">{manualError}</div>
            )}
            <button className="is-btn-reset" onClick={reset}>Reset Defaults</button>
            <button
              className={`is-btn-begin${launching ? ' is-btn-begin--loading' : ''}`}
              onClick={handleBegin}
              disabled={launching}
            >
              {launching ? <><span className="is-spinner" />Initialising…</> : 'Begin Simulation'}
            </button>
          </div>
        </aside>

        </div>{/* end is-body */}

      </div>
    </div>
  )
}
