import { useState, useRef } from 'react'
import './DailyCheckup.css'

const PLANT_TYPES = ['Potato', 'Wheat', 'Lettuce', 'Tomato', 'Soybean', 'Spinach', 'Radish', 'Pea', 'Kale', 'Carrot']
const LEAF_COLOR_OPTS = ['Healthy Green', 'Pale Green', 'Yellowing', 'Brown Spots', 'Wilting']
const GROWTH_STAGE_OPTS = ['Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Harvest Ready']
const HEALTH_OPTS = ['Excellent', 'Good', 'Fair', 'Poor', 'Critical']

const DEFAULTS = {
  humidity: 65,
  temperature: 22,
  soilMoisture: 45,
  lightIntensity: 12000,
  co2Level: 800,
  plantHeight: 15,
  leafColor: 'Healthy Green',
  growthStage: 'Vegetative',
  healthRating: 'Good',
  plantsInspected: PLANT_TYPES.slice(0, 3),
  notes: '',
  images: [],
}

/* ── Stepper ── */
function Stepper({ value, onChange, min = 0, max = 99999, step = 1, unit }) {
  return (
    <div className="dc-stepper">
      <button
        className="dc-stepper__btn"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
      >−</button>
      <span className="dc-stepper__display">
        <span className="dc-stepper__val">{value.toLocaleString()}</span>
        {unit && <span className="dc-stepper__unit">{unit}</span>}
      </span>
      <button
        className="dc-stepper__btn"
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
    <div className="dc-cycle">
      <button className="dc-cycle__arrow" onClick={prev}>‹</button>
      <span className="dc-cycle__val">{value}</span>
      <button className="dc-cycle__arrow" onClick={next}>›</button>
    </div>
  )
}

/* ── Multi-select chips ── */
function Chips({ options, selected, onChange }) {
  const toggle = opt =>
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt])
  return (
    <div className="dc-chips">
      {options.map(opt => (
        <button
          key={opt}
          className="dc-chip"
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
    <div className="dc-param-row">
      <span className="dc-param-row__label">{label}</span>
      <div className="dc-param-row__control">{children}</div>
    </div>
  )
}

/* ── Main component ── */
export default function DailyCheckup({ onBack }) {
  const [data, setData] = useState(DEFAULTS)
  const [submitting, setSubmitting] = useState(false)
  const [imagePreviews, setImagePreviews] = useState([])
  const fileInputRef = useRef(null)

  const set = (key, val) => setData(prev => ({ ...prev, [key]: val }))
  const reset = () => {
    setData(DEFAULTS)
    setImagePreviews([])
  }

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    const newPreviews = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue
      newPreviews.push({
        name: file.name,
        url: URL.createObjectURL(file),
        file,
      })
    }

    setImagePreviews(prev => [...prev, ...newPreviews])
    set('images', [...data.images, ...files.filter(f => f.type.startsWith('image/'))])

    // Reset the input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (idx) => {
    URL.revokeObjectURL(imagePreviews[idx].url)
    setImagePreviews(prev => prev.filter((_, i) => i !== idx))
    set('images', data.images.filter((_, i) => i !== idx))
  }

  const filledCount = [
    data.humidity !== DEFAULTS.humidity,
    data.temperature !== DEFAULTS.temperature,
    data.soilMoisture !== DEFAULTS.soilMoisture,
    data.lightIntensity !== DEFAULTS.lightIntensity,
    data.co2Level !== DEFAULTS.co2Level,
    data.plantHeight !== DEFAULTS.plantHeight,
    data.leafColor !== DEFAULTS.leafColor,
    data.growthStage !== DEFAULTS.growthStage,
    data.healthRating !== DEFAULTS.healthRating,
    data.notes.trim().length > 0,
    imagePreviews.length > 0,
  ].filter(Boolean).length

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      // Build the checkup report to send to backend
      const report = {
        humidity: data.humidity,
        temperature: data.temperature,
        soil_moisture: data.soilMoisture,
        light_intensity: data.lightIntensity,
        co2_level: data.co2Level,
        plant_height: data.plantHeight,
        leaf_color: data.leafColor,
        growth_stage: data.growthStage,
        health_rating: data.healthRating,
        plants_inspected: data.plantsInspected,
        notes: data.notes,
        image_count: imagePreviews.length,
      }

      await fetch('http://localhost:8000/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Daily greenhouse checkup report: ${JSON.stringify(report)}`,
        }),
      })
    } catch {
      // Backend may be unavailable
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dc-overlay" onClick={e => { if (e.target === e.currentTarget) onBack() }}>
      <div className="dc-panel">

        {/* ── Top bar ── */}
        <div className="dc-topbar">
          <button className="dc-back" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>

          <div className="dc-title">
            <span className="dc-title__mono">SYS · CHECKUP</span>
            <h1 className="dc-title__h1">Daily Checkup</h1>
          </div>

          <div className="dc-status-pill">
            <span className="dc-status-pill__label">Fields Updated</span>
            <span className="dc-status-pill__val">{filledCount} / 11</span>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="dc-body">
          <div className="dc-grid">

            {/* Environment Readings */}
            <div className="dc-card">
              <div className="dc-card__header">
                <span className="dc-card__tag">ENV</span>
                <span className="dc-card__name">Environment</span>
              </div>
              <ParamRow label="Humidity">
                <Stepper value={data.humidity} onChange={v => set('humidity', v)} step={1} min={0} max={100} unit="%" />
              </ParamRow>
              <ParamRow label="Temperature">
                <Stepper value={data.temperature} onChange={v => set('temperature', v)} step={1} min={-10} max={50} unit="°C" />
              </ParamRow>
              <ParamRow label="CO₂ Level">
                <Stepper value={data.co2Level} onChange={v => set('co2Level', v)} step={50} min={0} max={5000} unit="ppm" />
              </ParamRow>
            </div>

            {/* Soil & Light */}
            <div className="dc-card">
              <div className="dc-card__header">
                <span className="dc-card__tag">SOIL</span>
                <span className="dc-card__name">Soil &amp; Light</span>
              </div>
              <ParamRow label="Soil Moisture">
                <Stepper value={data.soilMoisture} onChange={v => set('soilMoisture', v)} step={1} min={0} max={100} unit="%" />
              </ParamRow>
              <ParamRow label="Light Intensity">
                <Stepper value={data.lightIntensity} onChange={v => set('lightIntensity', v)} step={500} min={0} max={100000} unit="lux" />
              </ParamRow>
            </div>

            {/* Plant Status */}
            <div className="dc-card">
              <div className="dc-card__header">
                <span className="dc-card__tag">PLT</span>
                <span className="dc-card__name">Plant Status</span>
              </div>
              <ParamRow label="Plant Height">
                <Stepper value={data.plantHeight} onChange={v => set('plantHeight', v)} step={1} min={0} max={300} unit="cm" />
              </ParamRow>
              <ParamRow label="Leaf Color">
                <CycleSelect options={LEAF_COLOR_OPTS} value={data.leafColor} onChange={v => set('leafColor', v)} />
              </ParamRow>
              <ParamRow label="Growth Stage">
                <CycleSelect options={GROWTH_STAGE_OPTS} value={data.growthStage} onChange={v => set('growthStage', v)} />
              </ParamRow>
            </div>

            {/* Health */}
            <div className="dc-card">
              <div className="dc-card__header">
                <span className="dc-card__tag">HLT</span>
                <span className="dc-card__name">Health Assessment</span>
              </div>
              <ParamRow label="Overall Health">
                <CycleSelect options={HEALTH_OPTS} value={data.healthRating} onChange={v => set('healthRating', v)} />
              </ParamRow>
            </div>

            {/* Plants inspected — wide card */}
            <div className="dc-card dc-card--wide">
              <div className="dc-card__header">
                <span className="dc-card__tag">CROP</span>
                <span className="dc-card__name">Plants Inspected</span>
                <span className="dc-card__count">{data.plantsInspected.length} selected</span>
              </div>
              <Chips options={PLANT_TYPES} selected={data.plantsInspected} onChange={v => set('plantsInspected', v)} />
            </div>

            {/* Photo upload — wide card */}
            <div className="dc-card dc-card--wide">
              <div className="dc-card__header">
                <span className="dc-card__tag">IMG</span>
                <span className="dc-card__name">Plant Photos</span>
                <span className="dc-card__count">{imagePreviews.length} uploaded</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleImageUpload}
              />
              <div className="dc-upload-zone" onClick={() => fileInputRef.current?.click()}>
                <svg className="dc-upload-zone__icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="dc-upload-zone__text">Click to upload plant photos</span>
                <span className="dc-upload-zone__hint">JPG, PNG — multiple files supported</span>
              </div>
              {imagePreviews.length > 0 && (
                <div className="dc-image-previews">
                  {imagePreviews.map((img, i) => (
                    <div key={i} className="dc-image-preview">
                      <img src={img.url} alt={img.name} />
                      <button className="dc-image-preview__remove" onClick={() => removeImage(i)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes — wide card */}
            <div className="dc-card dc-card--wide">
              <div className="dc-card__header">
                <span className="dc-card__tag">LOG</span>
                <span className="dc-card__name">Observations</span>
              </div>
              <textarea
                className="dc-textarea"
                value={data.notes}
                onChange={e => set('notes', e.target.value)}
                placeholder="Any additional observations about plant health, pest sightings, equipment issues, etc."
                maxLength={2000}
              />
            </div>
          </div>

          {/* ── Overview sidebar ── */}
          <aside className="dc-overview">
            <div className="dc-ov__heading">
              <span className="dc-ov__mono">SUMMARY</span>
              <span className="dc-ov__badge">{filledCount > 0 ? `${filledCount} updated` : 'defaults'}</span>
            </div>

            <div className="dc-ov__section">
              <span className="dc-ov__section-label">Environment</span>
              <div className="dc-ov__rows">
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">Humidity</span>
                  <span className="dc-ov__row-val">{data.humidity}%</span>
                </div>
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">Temperature</span>
                  <span className="dc-ov__row-val">{data.temperature}°C</span>
                </div>
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">CO₂</span>
                  <span className="dc-ov__row-val">{data.co2Level} ppm</span>
                </div>
              </div>
            </div>

            <div className="dc-ov__section">
              <span className="dc-ov__section-label">Soil & Light</span>
              <div className="dc-ov__rows">
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">Moisture</span>
                  <span className="dc-ov__row-val">{data.soilMoisture}%</span>
                </div>
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">Light</span>
                  <span className="dc-ov__row-val">{data.lightIntensity.toLocaleString()} lux</span>
                </div>
              </div>
            </div>

            <div className="dc-ov__section">
              <span className="dc-ov__section-label">Plants</span>
              <div className="dc-ov__rows">
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">Height</span>
                  <span className="dc-ov__row-val">{data.plantHeight} cm</span>
                </div>
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">Leaf color</span>
                  <span className="dc-ov__row-val">{data.leafColor}</span>
                </div>
                <div className="dc-ov__row">
                  <span className="dc-ov__row-key">Stage</span>
                  <span className="dc-ov__row-val">{data.growthStage}</span>
                </div>
              </div>
            </div>

            <div className="dc-ov__section">
              <span className="dc-ov__section-label">Photos</span>
              <div className="dc-ov__images">
                {imagePreviews.length === 0
                  ? <span className="dc-ov__empty">No photos</span>
                  : imagePreviews.map((_, i) => <span key={i} className="dc-ov__image-dot" />)
                }
              </div>
            </div>

            <div className="dc-ov__health">
              <span className="dc-ov__health-label">Health Rating</span>
              <span className="dc-ov__health-val">{data.healthRating}</span>
              <span className="dc-ov__health-unit">{data.plantsInspected.length} crops checked</span>
            </div>
          </aside>
        </div>

        {/* ── Footer ── */}
        <div className="dc-footer">
          <div className="dc-completeness">
            <div className="dc-completeness__bar">
              <div className="dc-completeness__fill" style={{ width: `${Math.round((filledCount / 11) * 100)}%` }} />
            </div>
            <span className="dc-completeness__label">{filledCount} of 11 fields updated</span>
          </div>
          <div className="dc-footer__actions">
            <button className="dc-btn-reset" onClick={reset}>Reset</button>
            <button
              className={`dc-btn-submit${submitting ? ' dc-btn-submit--loading' : ''}`}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <><span className="dc-spinner" />Submitting…</> : 'Submit Checkup'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
