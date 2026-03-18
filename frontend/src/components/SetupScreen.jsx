import { useState } from 'react'
import './SetupScreen.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SEED_TYPES = ['potato', 'wheat', 'lettuce', 'tomato', 'soybean', 'radish', 'pea', 'kale', 'carrot']

export default function SetupScreen({ onSetupComplete }) {
  const [mode, setMode] = useState(null) // null | 'ai' | 'manual'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [aiReasoning, setAiReasoning] = useState(null)

  // Manual form state
  const [form, setForm] = useState({
    water_l: 5000,
    fertilizer_kg: 200,
    soil_kg: 1000,
    floor_space_m2: 50,
    mission_days: 450,
    astronaut_count: 4,
    seed_amounts: Object.fromEntries(SEED_TYPES.map(s => [s, 0])),
  })

  const setField = (key, val) => setForm(prev => ({ ...prev, [key]: val }))
  const setSeed = (seed, val) => setForm(prev => ({
    ...prev,
    seed_amounts: { ...prev.seed_amounts, [seed]: val },
  }))

  // Validation
  const validate = () => {
    const nums = ['water_l', 'fertilizer_kg', 'soil_kg', 'floor_space_m2', 'mission_days', 'astronaut_count']
    for (const k of nums) {
      if (form[k] < 0) return `${k.replace(/_/g, ' ')} cannot be negative`
    }
    const totalSeeds = Object.values(form.seed_amounts).reduce((a, b) => a + b, 0)
    if (totalSeeds === 0) return 'Select at least one seed type with amount > 0'
    for (const [seed, amt] of Object.entries(form.seed_amounts)) {
      if (amt < 0) return `${seed} amount cannot be negative`
    }
    return null
  }

  const handleAiSetup = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/setup/ai-optimised`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'AI setup failed')
      }
      const state = await res.json()
      setAiReasoning(state.ai_setup_reasoning)
      onSetupComplete(state)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  const handleManualSetup = async () => {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    // Filter out zero-amount seeds
    const filteredSeeds = Object.fromEntries(
      Object.entries(form.seed_amounts).filter(([, v]) => v > 0)
    )

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/setup/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, seed_amounts: filteredSeeds }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Setup failed')
      }
      const state = await res.json()
      onSetupComplete(state)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  // AI loading screen
  if (loading && (mode === 'ai' || mode === null)) {
    return (
      <div className="ss-container">
        <div className="ss-loading">
          <div className="ss-spinner-lg" />
          <h2>AI is designing your greenhouse...</h2>
          <p>Querying the Mars knowledge base and optimising crop selection</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ss-container">
      <div className="ss-header">
        <span className="ss-tag">SYS · SETUP</span>
        <h1 className="ss-title">Mission Configuration</h1>
        <p className="ss-subtitle">Choose how to configure your Martian greenhouse</p>
      </div>

      {error && (
        <div className="ss-error">
          <span>Error: {error}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {!mode && (
        <div className="ss-cards">
          {/* AI Card */}
          <div className="ss-card" onClick={() => { setMode('ai'); handleAiSetup() }}>
            <div className="ss-card-badge">RECOMMENDED</div>
            <div className="ss-card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>AI Optimised</h2>
            <p>Let the AI design the optimal greenhouse for a 4-astronaut, 450-day Mars mission. No configuration needed.</p>
            <button className="ss-btn ss-btn-primary" onClick={e => { e.stopPropagation(); setMode('ai'); handleAiSetup() }}>
              Launch AI Setup
            </button>
          </div>

          {/* Manual Card */}
          <div className="ss-card" onClick={() => setMode('manual')}>
            <div className="ss-card-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2>Manual Setup</h2>
            <p>Configure every parameter yourself — water, soil, seeds, crew size, and mission duration.</p>
            <button className="ss-btn ss-btn-secondary" onClick={e => { e.stopPropagation(); setMode('manual') }}>
              Configure Manually
            </button>
          </div>
        </div>
      )}

      {mode === 'manual' && (
        <div className="ss-manual">
          <button className="ss-back" onClick={() => setMode(null)}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to modes
          </button>

          <div className="ss-form-grid">
            {/* Resource inputs */}
            <div className="ss-form-card">
              <h3><span className="ss-form-tag">RES</span> Resources</h3>
              <label>
                <span>Water supply (L)</span>
                <input type="number" min="0" value={form.water_l} onChange={e => setField('water_l', +e.target.value)} />
              </label>
              <label>
                <span>Fertilizer (kg)</span>
                <input type="number" min="0" value={form.fertilizer_kg} onChange={e => setField('fertilizer_kg', +e.target.value)} />
              </label>
              <label>
                <span>Soil (kg)</span>
                <input type="number" min="0" value={form.soil_kg} onChange={e => setField('soil_kg', +e.target.value)} />
              </label>
            </div>

            {/* Greenhouse inputs */}
            <div className="ss-form-card">
              <h3><span className="ss-form-tag">GRH</span> Greenhouse</h3>
              <label>
                <span>Floor space (m²)</span>
                <input type="number" min="0" value={form.floor_space_m2} onChange={e => setField('floor_space_m2', +e.target.value)} />
              </label>
            </div>

            {/* Mission inputs */}
            <div className="ss-form-card">
              <h3><span className="ss-form-tag">MSN</span> Mission</h3>
              <label>
                <span>Mission duration (days)</span>
                <input type="number" min="1" value={form.mission_days} onChange={e => setField('mission_days', +e.target.value)} />
              </label>
              <label>
                <span>Astronaut count</span>
                <input type="number" min="1" max="12" value={form.astronaut_count} onChange={e => setField('astronaut_count', +e.target.value)} />
              </label>
            </div>

            {/* Seed amounts */}
            <div className="ss-form-card ss-form-card--wide">
              <h3><span className="ss-form-tag">SEED</span> Seed Amounts</h3>
              <div className="ss-seed-grid">
                {SEED_TYPES.map(seed => (
                  <label key={seed} className="ss-seed-input">
                    <span>{seed}</span>
                    <input type="number" min="0" value={form.seed_amounts[seed]} onChange={e => setSeed(seed, +e.target.value)} />
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="ss-manual-footer">
            <button
              className={`ss-btn ss-btn-primary ${loading ? 'ss-btn--loading' : ''}`}
              onClick={handleManualSetup}
              disabled={loading}
            >
              {loading ? <><span className="ss-spinner" /> Setting up...</> : 'Launch Simulation'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
