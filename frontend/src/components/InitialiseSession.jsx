import { useState } from 'react'
import './InitialiseSession.css'

const SEED_OPTIONS  = ['Potato', 'Wheat', 'Lettuce', 'Tomato', 'Soybean', 'Spinach', 'Radish', 'Pea', 'Kale', 'Carrot']
const WEATHER_OPTS  = ['Calm', 'Gusty', 'Dust Storm', 'Variable']
const AIR_OPTS      = ['Earth Norm', 'Hab Mix', 'Mars Adapted', 'Experimental']

const DEFAULTS = {
  fertilizer: 500,
  water:       2000,
  soil:        1500,
  space:       80,
  seedAmt:     40,
  seedTypes:   ['Potato', 'Wheat', 'Lettuce'],
  bugs:        20,
  astronauts:  4,
  timeframe:   350,
  weather:     'Calm',
  airComp:     'Hab Mix',
}

/* ── Stepper ── */
function Stepper({ value, onChange, min = 0, max = 99999, step = 1, unit }) {
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

/* ── Cycle selector ── */
function CycleSelect({ options, value, onChange }) {
  const idx  = options.indexOf(value)
  const prev = () => onChange(options[(idx - 1 + options.length) % options.length])
  const next = () => onChange(options[(idx + 1) % options.length])
  return (
    <div className="is-cycle">
      <button className="is-cycle__arrow" onClick={prev}>‹</button>
      <span className="is-cycle__val">{value}</span>
      <button className="is-cycle__arrow" onClick={next}>›</button>
      <div className="is-cycle__dots">
        {options.map(opt => (
          <span key={opt} className="is-cycle__dot" data-active={opt === value} onClick={() => onChange(opt)} />
        ))}
      </div>
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
export default function InitialiseSession({ onBack }) {
  const [cfg, setCfg]             = useState(DEFAULTS)
  const [launching, setLaunching] = useState(false)

  const set    = (key, val) => setCfg(prev => ({ ...prev, [key]: val }))
  const reset  = () => setCfg(DEFAULTS)

  const totalSupplies = cfg.fertilizer + cfg.water + cfg.soil

  const changedCount = [
    cfg.fertilizer !== DEFAULTS.fertilizer,
    cfg.water      !== DEFAULTS.water,
    cfg.soil       !== DEFAULTS.soil,
    cfg.space      !== DEFAULTS.space,
    cfg.seedAmt    !== DEFAULTS.seedAmt,
    cfg.bugs       !== DEFAULTS.bugs,
    cfg.astronauts !== DEFAULTS.astronauts,
    cfg.timeframe  !== DEFAULTS.timeframe,
    cfg.weather    !== DEFAULTS.weather,
    cfg.airComp    !== DEFAULTS.airComp,
  ].filter(Boolean).length

  const handleBegin = () => {
    setLaunching(true)
    setTimeout(() => setLaunching(false), 2000)
  }

  return (
    <div className="is-overlay" onClick={e => { if (e.target === e.currentTarget) onBack() }}>
      <div className="is-panel">

        {/* ── Top bar ── */}
        <div className="is-topbar">
          <button className="is-back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>

          <div className="is-title">
            <span className="is-title__mono">SYS · INIT</span>
            <h1 className="is-title__h1">Initialise Session</h1>
          </div>

          <div className="is-supply-pill">
            <span className="is-supply-pill__label">Total Supplies</span>
            <span className="is-supply-pill__val">{totalSupplies.toLocaleString()} units</span>
          </div>
        </div>

        {/* ── Cards grid ── */}
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
              <Stepper value={cfg.water} onChange={v => set('water', v)} step={100} unit="L" />
            </ParamRow>
            <ParamRow label="Soil">
              <Stepper value={cfg.soil} onChange={v => set('soil', v)} step={100} unit="kg" />
            </ParamRow>
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

          {/* Environment */}
          <div className="is-card">
            <div className="is-card__header">
              <span className="is-card__tag">ENV</span>
              <span className="is-card__name">Environment</span>
            </div>
            <ParamRow label="Weather">
              <CycleSelect options={WEATHER_OPTS} value={cfg.weather} onChange={v => set('weather', v)} />
            </ParamRow>
            <ParamRow label="Air Composition">
              <CycleSelect options={AIR_OPTS} value={cfg.airComp} onChange={v => set('airComp', v)} />
            </ParamRow>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="is-footer">
          <div className="is-readiness">
            <div className="is-readiness__bar">
              <div className="is-readiness__fill" style={{ width: `${changedCount * 10}%` }} />
            </div>
            <span className="is-readiness__label">{changedCount} of 10 parameters customised</span>
          </div>
          <div className="is-footer__actions">
            <button className="is-btn-reset" onClick={reset}>Reset Defaults</button>
            <button
              className={`is-btn-begin${launching ? ' is-btn-begin--loading' : ''}`}
              onClick={handleBegin}
              disabled={launching}
            >
              {launching ? <><span className="is-spinner" />Initialising…</> : 'Begin Simulation'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
