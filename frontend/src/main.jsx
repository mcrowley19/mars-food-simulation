import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

function startAnimatedMarsFavicon() {
  if (typeof window === 'undefined') return
  if (window.__marsFaviconStarted) return
  window.__marsFaviconStarted = true

  const link =
    document.querySelector("link[rel='icon']") ||
    document.querySelector("link[rel='shortcut icon']")
  if (!link) return

  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const stars = [
    [11, 14, 1.1],
    [51, 12, 0.95],
    [56, 45, 0.85],
    [9, 49, 0.8],
  ]

  const tex = new Image()
  tex.src = '/mars-texture.jpg'

  const draw = (shiftPx) => {
    ctx.clearRect(0, 0, 64, 64)

    // Space backdrop.
    const bg = ctx.createRadialGradient(32, 25, 4, 32, 32, 36)
    bg.addColorStop(0, '#19213a')
    bg.addColorStop(1, '#070b14')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, 64, 64)

    ctx.fillStyle = '#dbe6ff'
    stars.forEach(([x, y, r]) => {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    })

    // Atmospheric glow.
    const atmo = ctx.createRadialGradient(32, 32, 12, 32, 32, 22)
    atmo.addColorStop(0.7, 'rgba(0,0,0,0)')
    atmo.addColorStop(1, 'rgba(255,159,111,0.45)')
    ctx.fillStyle = atmo
    ctx.beginPath()
    ctx.arc(32, 32, 19, 0, Math.PI * 2)
    ctx.fill()

    // Planet clip.
    ctx.save()
    ctx.beginPath()
    ctx.arc(32, 32, 16, 0, Math.PI * 2)
    ctx.clip()

    // Base body color below texture.
    const marsBase = ctx.createRadialGradient(27, 25, 3, 32, 32, 20)
    marsBase.addColorStop(0, '#ffcd9f')
    marsBase.addColorStop(0.5, '#dc7348')
    marsBase.addColorStop(1, '#7e2e21')
    ctx.fillStyle = marsBase
    ctx.fillRect(16, 16, 32, 32)

    if (tex.complete && tex.naturalWidth > 0) {
      const sx = shiftPx % tex.naturalWidth
      const w1 = Math.min(tex.naturalWidth - sx, tex.naturalWidth)
      const dw1 = 32 * (w1 / tex.naturalWidth)
      ctx.globalAlpha = 0.82
      ctx.drawImage(tex, sx, 0, w1, tex.naturalHeight, 16, 16, dw1, 32)
      if (w1 < tex.naturalWidth) {
        const w2 = tex.naturalWidth - w1
        const dw2 = 32 * (w2 / tex.naturalWidth)
        ctx.drawImage(tex, 0, 0, w2, tex.naturalHeight, 16 + dw1, 16, dw2, 32)
      }
      ctx.globalAlpha = 1
    }

    // Day/night terminator.
    const shade = ctx.createLinearGradient(16, 0, 48, 0)
    shade.addColorStop(0, 'rgba(0,0,0,0)')
    shade.addColorStop(0.58, 'rgba(0,0,0,0.08)')
    shade.addColorStop(1, 'rgba(0,0,0,0.58)')
    ctx.fillStyle = shade
    ctx.fillRect(16, 16, 32, 32)

    // Specular highlight.
    const spec = ctx.createRadialGradient(27, 24, 1, 28, 24, 14)
    spec.addColorStop(0, 'rgba(255,255,255,0.5)')
    spec.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = spec
    ctx.fillRect(16, 16, 32, 32)
    ctx.restore()

    // Planet rim.
    ctx.strokeStyle = 'rgba(255,190,144,0.42)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(32, 32, 16, 0, Math.PI * 2)
    ctx.stroke()

    link.setAttribute('type', 'image/png')
    link.setAttribute('href', canvas.toDataURL('image/png'))
  }

  let shift = 0
  const tick = () => {
    shift += 8
    draw(shift)
    window.setTimeout(() => requestAnimationFrame(tick), 90)
  }

  tex.onload = () => {
    draw(0)
    tick()
  }
  tex.onerror = () => {
    draw(0)
  }
}

startAnimatedMarsFavicon()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
