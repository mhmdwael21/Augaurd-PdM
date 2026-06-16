import { useRef, useEffect } from 'react'

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }

export default function AnomalyChart({ buf = [], zone = 'olive', width = 480, height = 170, threshold = 0.65, big = true }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const W = c.clientWidth || width
    const H = c.clientHeight || height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const n = buf.length
    if (n < 2) return

    const min = 0, max = 1
    const padB = 18, padT = 10, gh = H - padB - padT
    const X = i => (i / (n - 1)) * W
    const Y = v => padT + (1 - clamp(v, min, max)) * gh

    const colMap = { olive: '#AEBC74', ochre: '#D9A94A', rust: '#CB5B3C' }
    const lineCol = colMap[zone] || colMap.olive

    // gridlines
    if (big) {
      ctx.strokeStyle = 'rgba(57,62,70,0.5)'
      ctx.lineWidth = 1
      ;[0.25, 0.5, 0.75].forEach(g => {
        ctx.beginPath()
        ctx.setLineDash([2, 5])
        ctx.moveTo(0, padT + (1 - g) * gh)
        ctx.lineTo(W, padT + (1 - g) * gh)
        ctx.stroke()
      })
      ctx.setLineDash([])
    }

    // danger zone above threshold
    const ty = Y(threshold)
    ctx.fillStyle = 'rgba(203,91,60,0.07)'
    ctx.fillRect(0, padT, W, Math.max(0, ty - padT))

    // area fill
    ctx.beginPath()
    ctx.moveTo(X(0), Y(buf[0]))
    for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(buf[i]))
    ctx.lineTo(W, H - padB)
    ctx.lineTo(0, H - padB)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, padT, 0, H)
    const alphaMap = { rust: '0.28', ochre: '0.24', olive: '0.22' }
    const rgbMap = { rust: '203,91,60', ochre: '217,169,74', olive: '174,188,116' }
    grad.addColorStop(0, `rgba(${rgbMap[zone] || rgbMap.olive},${alphaMap[zone] || alphaMap.olive})`)
    grad.addColorStop(1, 'rgba(34,40,49,0)')
    ctx.fillStyle = grad
    ctx.fill()

    // line
    ctx.beginPath()
    ctx.moveTo(X(0), Y(buf[0]))
    for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(buf[i]))
    ctx.strokeStyle = lineCol
    ctx.lineWidth = big ? 2.2 : 1.8
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.setLineDash([])
    ctx.stroke()

    // threshold dashed line
    ctx.beginPath()
    ctx.setLineDash([6, 4])
    ctx.moveTo(0, ty)
    ctx.lineTo(W, ty)
    ctx.strokeStyle = '#CB5B3C'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])

    // head dot
    const hx = X(n - 1), hy = Y(buf[n - 1])
    const r = big ? 4 : 3
    ctx.beginPath()
    ctx.arc(hx, hy, r + 4, 0, Math.PI * 2)
    ctx.fillStyle = zone === 'rust' ? 'rgba(203,91,60,0.25)' : 'rgba(174,188,116,0.2)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(hx, hy, r, 0, Math.PI * 2)
    ctx.fillStyle = lineCol
    ctx.strokeStyle = '#1B2027'
    ctx.lineWidth = 2
    ctx.fill()
    ctx.stroke()
  })

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  )
}
