import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useResponsive } from '../hooks/useResponsive'

const MS = ({ name, size = 19, color, style = {} }) => (
  <span style={{
    fontFamily: "'Material Symbols Outlined'",
    fontVariationSettings: "'FILL' 0,'wght' 300",
    fontStyle: 'normal', lineHeight: 1,
    display: 'inline-block', verticalAlign: 'middle',
    fontSize: size, color, ...style,
  }}>{name}</span>
)

// --- Hero canvas (3-D sine-wave grid) ---
function HeroCanvas() {
  const ref = useRef(null)
  const t0 = useRef(performance.now())
  const raf = useRef(null)

  useEffect(() => {
    const c = ref.current
    function draw() {
      const W = c.clientWidth, H = c.clientHeight
      if (!W || !H) { raf.current = requestAnimationFrame(draw); return }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr)
      if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr)
      const ctx = c.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const t = (performance.now() - t0.current) / 1000
      const cols = 50, rows = 34, focal = 300, camY = 66, stepX = 28, stepZ = 15
      const cx = W * 0.5, horizon = H * 0.40
      const pts = []
      for (let j = 0; j < rows; j++) {
        const row = []; const z = 22 + j * stepZ; const scale = focal / z
        for (let i = 0; i < cols; i++) {
          const wx = (i - cols / 2) * stepX
          const wy = Math.sin(i * 0.34 + t * 1.05) * 7 + Math.cos(j * 0.5 - t * 0.85) * 9 + Math.sin((i + j) * 0.26 + t * 0.7) * 6
          row.push({ x: cx + wx * scale, y: horizon + (camY - wy) * scale })
        }
        pts.push(row)
      }
      const hl = (Math.sin(t * 0.45) * 0.5 + 0.5) * rows
      for (let j = 0; j < rows; j++) {
        const near = 1 - j / rows
        let a = near * 0.46 + 0.03; let col = '223,208,184'
        const d = Math.abs(j - hl)
        if (d < 2.4) { a = Math.min(0.6, a + 0.26); col = '217,169,74' }
        ctx.beginPath()
        for (let i = 0; i < cols; i++) { const p = pts[j][i]; i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y) }
        ctx.strokeStyle = 'rgba(' + col + ',' + a + ')'; ctx.lineWidth = 1; ctx.stroke()
      }
      for (let i = 0; i < cols; i += 2) {
        ctx.beginPath()
        for (let j = 0; j < rows; j++) { const p = pts[j][i]; j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y) }
        ctx.strokeStyle = 'rgba(148,137,121,0.06)'; ctx.lineWidth = 1; ctx.stroke()
      }
      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
}

// --- Live demo chart (anomaly score) ---
function DemoChart() {
  const ref = useRef(null)
  const bufRef = useRef([])
  const t0 = useRef(performance.now())
  const lastPush = useRef(0)
  const raf = useRef(null)
  const statusRef = useRef(null)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1) }
  function scoreAt(p) {
    let base
    if (p < 46) base = 0.20 + 0.04 * Math.sin(p * 0.5)
    else if (p < 72) base = lerp(0.24, 0.70, (p - 46) / 26)
    else base = lerp(0.70, 0.93, (p - 72) / 28)
    const amp = p < 46 ? 0.022 : 0.055
    return clamp(base + (Math.random() - 0.5) * amp * 2 + 0.015 * Math.sin(p * 1.4), 0, 1)
  }

  useEffect(() => {
    for (let i = 0; i < 92; i++) bufRef.current.push(scoreAt((i / 92) * 100))

    function draw() {
      const c = ref.current; if (!c) return
      const W = c.clientWidth, H = c.clientHeight; if (!W || !H) { raf.current = requestAnimationFrame(draw); return }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      if (c.width !== Math.round(W * dpr)) c.width = Math.round(W * dpr)
      if (c.height !== Math.round(H * dpr)) c.height = Math.round(H * dpr)
      const ctx = c.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      const now = performance.now()
      const t = (now - t0.current) / 1000
      const phase = (t % 15) / 15 * 100
      if (now - lastPush.current > 52) {
        bufRef.current.push(scoreAt(phase))
        if (bufRef.current.length > 92) bufRef.current.shift()
        lastPush.current = now
      }
      const buf = bufRef.current, n = buf.length
      const padB = 18, padT = 10, gh = H - padB - padT
      const X = i => (i / (n - 1)) * W
      const Y = v => padT + (1 - v) * gh
      const sc = buf[n - 1]
      const zone = sc >= 0.65 ? 'rust' : sc >= 0.5 ? 'ochre' : 'olive'
      const colMap = { olive: '#AEBC74', ochre: '#D9A94A', rust: '#CB5B3C' }
      const lineCol = colMap[zone]
      ctx.strokeStyle = 'rgba(57,62,70,0.5)'; ctx.lineWidth = 1
      ;[0.25, 0.5, 0.75].forEach(g => {
        ctx.beginPath(); ctx.moveTo(0, padT + g * gh); ctx.lineTo(W, padT + g * gh); ctx.stroke()
      })
      const ty = Y(0.65)
      ctx.fillStyle = 'rgba(203,91,60,0.06)'; ctx.fillRect(0, padT, W, ty - padT)
      ctx.beginPath(); ctx.moveTo(0, Y(buf[0]))
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(buf[i]))
      ctx.lineTo(W, H - padB); ctx.lineTo(0, H - padB); ctx.closePath()
      const grad = ctx.createLinearGradient(0, padT, 0, H)
      grad.addColorStop(0, zone === 'rust' ? 'rgba(203,91,60,.28)' : zone === 'ochre' ? 'rgba(217,169,74,.24)' : 'rgba(174,188,116,.22)')
      grad.addColorStop(1, 'rgba(34,40,49,0)')
      ctx.fillStyle = grad; ctx.fill()
      ctx.beginPath(); ctx.moveTo(0, Y(buf[0]))
      for (let i = 1; i < n; i++) ctx.lineTo(X(i), Y(buf[i]))
      ctx.strokeStyle = lineCol; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke()
      ctx.beginPath(); ctx.setLineDash([6, 5]); ctx.moveTo(0, ty); ctx.lineTo(W, ty)
      ctx.strokeStyle = 'rgba(203,91,60,.7)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([])
      const hx = X(n - 1), hy = Y(sc)
      ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fillStyle = zone === 'rust' ? 'rgba(203,91,60,.25)' : 'rgba(174,188,116,.2)'; ctx.fill()
      ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI * 2); ctx.fillStyle = lineCol; ctx.strokeStyle = '#222831'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke()
      if (statusRef.current) {
        const label = sc >= 0.65 ? 'ANOMALY' : sc >= 0.5 ? 'DRIFT' : 'NORMAL'
        statusRef.current.textContent = label
        if (label === 'ANOMALY') { statusRef.current.style.background = 'rgba(203,91,60,.16)'; statusRef.current.style.color = '#E0987F'; statusRef.current.style.borderColor = 'rgba(203,91,60,.45)' }
        else if (label === 'DRIFT') { statusRef.current.style.background = 'rgba(217,169,74,.14)'; statusRef.current.style.color = '#E4C281'; statusRef.current.style.borderColor = 'rgba(217,169,74,.4)' }
        else { statusRef.current.style.background = 'rgba(123,138,67,.14)'; statusRef.current.style.color = '#C6D196'; statusRef.current.style.borderColor = 'rgba(123,138,67,.4)' }
      }
      raf.current = requestAnimationFrame(draw)
    }
    raf.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf.current)
  }, [])

  return (
    <div style={{ background: '#222831', border: '1px solid #2f3742', borderRadius: 20, padding: '24px 24px 20px', boxShadow: '0 30px 70px rgba(0,0,0,.35)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.16em', color: '#948979', textTransform: 'uppercase' }}>Anomaly Score · Live</span>
          <span style={{ fontSize: 12.5, color: '#6f6a60' }}>Isolation Forest detector</span>
        </div>
        <span ref={statusRef} style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em', padding: '6px 13px', borderRadius: 999, background: 'rgba(123,138,67,.14)', color: '#C6D196', border: '1px solid rgba(123,138,67,.4)' }}>NORMAL</span>
      </div>
      <canvas ref={ref} style={{ width: '100%', height: 240, display: 'block' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, fontSize: 11, color: '#6f6a60' }}>
        <span>−4 min</span>
        <span style={{ color: '#E0987F' }}>— — threshold 0.65</span>
        <span>now</span>
      </div>
    </div>
  )
}

// --- Scroll reveal hook ---
function useScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll('[data-reveal]'))

    // Group siblings sharing the same parent so each gets a stagger offset
    const parentMap = new Map()
    els.forEach(el => {
      const p = el.parentElement
      if (!parentMap.has(p)) parentMap.set(p, [])
      parentMap.get(p).push(el)
    })

    els.forEach(el => {
      const siblings = parentMap.get(el.parentElement) || []
      const idx = siblings.indexOf(el)
      const delay = idx * 90

      // Different starting transforms by element type
      const tag = el.tagName.toLowerCase()
      const initTransform =
        tag === 'span' ? 'translateY(14px)' :
        tag === 'h2'   ? 'translateY(26px) scale(0.98)' :
                         'translateY(46px) scale(0.95)'

      el.style.opacity = '0'
      el.style.transform = initTransform
      el.style.willChange = 'opacity, transform'
      el.style.transition = [
        `opacity 0.72s cubic-bezier(.22,1,.36,1) ${delay}ms`,
        `transform 0.72s cubic-bezier(.22,1,.36,1) ${delay}ms`,
      ].join(', ')
    })

    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return
          entry.target.style.opacity = '1'
          entry.target.style.transform = 'translateY(0) scale(1)'
          setTimeout(() => { entry.target.style.willChange = 'auto' }, 900)
          io.unobserve(entry.target)
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -64px 0px' }
    )

    els.forEach(el => io.observe(el))

    // Failsafe — show everything even if IO never fires
    const failsafe = setTimeout(() => {
      els.forEach(el => {
        el.style.opacity = '1'
        el.style.transform = 'none'
        el.style.willChange = 'auto'
      })
    }, 4000)

    return () => { io.disconnect(); clearTimeout(failsafe) }
  }, [])
}

// --- Nav ---
function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { isMobile } = useResponsive()
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      background: scrolled ? 'rgba(27,32,39,.86)' : 'rgba(27,32,39,.72)',
      backdropFilter: scrolled ? 'blur(14px)' : 'blur(12px)',
      borderBottom: `1px solid ${scrolled ? '#2f3742' : 'transparent'}`,
      transition: 'background .3s, border-color .3s',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', height: 66, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <a href="#top" style={{ display: 'flex', flexDirection: 'column', gap: 5, lineHeight: 1 }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: '#948979', letterSpacing: '-.01em' }}>Auguard</span>
          {!isMobile && <span style={{ fontWeight: 500, fontSize: 8.5, color: '#5d5850', letterSpacing: '.04em', textTransform: 'uppercase' }}>AI-Powered Predictive Maintenance For APU Systems</span>}
        </a>
        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link to="/auth" style={{ padding: '8px 16px', borderRadius: 9, background: '#DFD0B8', color: '#1B2027', fontSize: 13, fontWeight: 700 }}>Sign in</Link>
            <button onClick={() => setMenuOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, border: '1px solid #393E46', borderRadius: 9, background: 'rgba(34,40,49,.6)', cursor: 'pointer' }}>
              <MS name={menuOpen ? 'close' : 'menu'} color="#948979" size={20} />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {['#how|How it works', '#demo|Live demo', '#fault|Fault locator', '#team|Team'].map(s => {
              const [href, label] = s.split('|')
              return <a key={href} href={href} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: 500, color: '#a59c8c' }}>{label}</a>
            })}
            <Link to="/auth" style={{ marginLeft: 8, padding: '9px 20px', borderRadius: 9, background: '#DFD0B8', color: '#1B2027', fontSize: 13.5, fontWeight: 700 }}>Sign in</Link>
          </div>
        )}
      </div>
      {isMobile && menuOpen && (
        <div style={{ background: 'rgba(27,32,39,.97)', borderTop: '1px solid #2f3742', padding: '10px 20px 16px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {['#how|How it works', '#demo|Live demo', '#fault|Fault locator', '#team|Team'].map(s => {
            const [href, label] = s.split('|')
            return <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{ padding: '12px 14px', borderRadius: 9, fontSize: 14, fontWeight: 500, color: '#a59c8c' }}>{label}</a>
          })}
        </div>
      )}
    </nav>
  )
}

const TEAM = [
  { initials: 'MH', name: 'Mohamed Hamed', grad: '150deg,#393E46,#948979', col: '#DFD0B8' },
  { initials: 'EM', name: 'Eman Mousa',    grad: '150deg,#3a3010,#c2913a', col: '#E4C281' },
  { initials: 'EH', name: 'Eman Hussien',  grad: '150deg,#1e2a10,#7b8a43', col: '#C6D196' },
  { initials: 'HG', name: 'Hana Gohar',    grad: '150deg,#4a2820,#CB5B3C', col: '#E0987F' },
  { initials: 'MW', name: 'Mohamed Wael',  grad: '150deg,#393E46,#948979', col: '#DFD0B8' },
  { initials: 'FS', name: 'Fatema Salah',  grad: '150deg,#3a3010,#c2913a', col: '#E4C281' },
  { initials: 'TA', name: 'Tasneem Almorsi', grad: '150deg,#1e2a10,#7b8a43', col: '#C6D196' },
  { initials: 'SA', name: 'Samar Abo Samra', grad: '150deg,#4a2820,#CB5B3C', col: '#E0987F' },
]

export default function Landing() {
  useScrollReveal()
  const { isMobile, isTablet } = useResponsive()

  return (
    <div style={{ position: 'relative' }}>
      <Nav />

      {/* ── HERO ── */}
      <section id="top" style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <HeroCanvas />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1100px 620px at 72% 8%, rgba(148,137,121,.10), transparent 60%),linear-gradient(180deg, rgba(27,32,39,.55) 0%, rgba(27,32,39,.2) 38%, rgba(27,32,39,.82) 84%, #1B2027 100%)' }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 20px' : '0 30px', width: '100%' }}>
          <div style={{ maxWidth: 760 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 15px', border: '1px solid #393E46', borderRadius: 999, background: 'rgba(34,40,49,.6)', backdropFilter: 'blur(6px)', marginBottom: 28 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#AEBC74', animation: 'scblink 1.5s infinite' }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.16em', color: '#cabfa6', textTransform: 'uppercase' }}>AI Predictive Maintenance</span>
            </div>
            <h1 style={{ fontSize: 'clamp(42px,6.4vw,82px)', fontWeight: 800, lineHeight: 1.02, letterSpacing: '-.035em', color: '#DFD0B8' }}>
              Predict the failure<br />before it happens.
            </h1>
            <p style={{ marginTop: 26, fontSize: 'clamp(16px,1.4vw,19px)', lineHeight: 1.6, color: '#a59c8c', maxWidth: 560, fontWeight: 400 }}>
              Auguard reads every sensor on a metro air compressor, catches anomalies the moment behaviour drifts, and tells your team exactly which part to inspect — long before a breakdown reaches the platform.
            </p>
            <div style={{ marginTop: 38, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Link to="/auth" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '15px 28px', borderRadius: 11, background: '#DFD0B8', color: '#1B2027', fontSize: 15, fontWeight: 700 }}>
                Get started <MS name="arrow_forward" size={19} color="#1B2027" />
              </Link>
              <a href="#demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '15px 26px', borderRadius: 11, border: '1px solid #4a5160', background: 'rgba(34,40,49,.5)', color: '#DFD0B8', fontSize: 15, fontWeight: 600 }}>
                See it live <MS name="play_circle" size={19} color="#DFD0B8" />
              </a>
            </div>
          </div>
        </div>
        <a href="#how" className="float" style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.2em', color: '#7c756a', textTransform: 'uppercase' }}>Scroll</span>
          <MS name="keyboard_arrow_down" size={22} color="#948979" />
        </a>
      </section>

      {/* ── PROBLEM ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '80px 20px 60px' : '130px 30px 90px' }}>
        <span data-reveal style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.2em', color: '#948979', textTransform: 'uppercase', marginBottom: 22 }}>The problem</span>
        <h2 data-reveal style={{ fontSize: 'clamp(28px,3.6vw,46px)', fontWeight: 700, lineHeight: 1.14, letterSpacing: '-.02em', color: '#DFD0B8', maxWidth: 880 }}>
          Most compressor failures send warning signs for days. Reactive maintenance waits for the breakdown anyway.
        </h2>
        <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 16 }}>
          {[
            { icon: 'block', color: '#E0987F', title: 'Unplanned downtime', body: 'A single failed compressor can pull a train from service and stall an entire line during peak hours.' },
            { icon: 'visibility_off', color: '#E4C281', title: 'Hidden warning signs', body: 'Pressure and temperature drift well before failure — but periodic manual checks miss the pattern.' },
            { icon: 'payments', color: '#948979', title: 'Costly, reactive repairs', body: 'Fixing after the fact costs far more — in parts, labour and lost service — than acting on an early signal.' },
          ].map(({ icon, color, title, body }) => (
            <div data-reveal key={title} style={{ background: '#222831', border: '1px solid #2f3742', borderRadius: 16, padding: 26 }}>
              <MS name={icon} size={30} color={color} />
              <h3 style={{ marginTop: 16, fontSize: 17, fontWeight: 600, color: '#DFD0B8' }}>{title}</h3>
              <p style={{ marginTop: 9, fontSize: 14, lineHeight: 1.6, color: '#948979' }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ background: '#1e242d', borderTop: '1px solid #262d38', borderBottom: '1px solid #262d38' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '70px 20px' : '120px 30px' }}>
          <span data-reveal style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.2em', color: '#948979', textTransform: 'uppercase', marginBottom: 18 }}>How it works</span>
          <h2 data-reveal style={{ fontSize: 'clamp(28px,3.6vw,46px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-.02em', color: '#DFD0B8', maxWidth: 700 }}>
            From raw sensor data to the right fix — automatically.
          </h2>
          <div style={{ marginTop: 50, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 22 }}>
            {[
              { n: '01', icon: 'sensors', bg: 'rgba(148,137,121,.14)', bd: '#393E46', iconCol: '#DFD0B8', title: 'Sense', body: 'Fifteen analog and digital channels — pressure, motor current, oil temperature and more — stream continuously from every compressor unit.' },
              { n: '02', icon: 'radar', bg: 'rgba(217,169,74,.14)', bd: 'rgba(217,169,74,.32)', iconCol: '#E4C281', title: 'Detect', body: 'AI watches every channel and flags anomalies the instant behaviour drifts from normal — then pinpoints the failing component and forecasts time left.' },
              { n: '03', icon: 'build', bg: 'rgba(123,138,67,.14)', bd: 'rgba(123,138,67,.32)', iconCol: '#C6D196', title: 'Act', body: 'Your team gets a prioritised alert naming the exact part to inspect and the recommended action — with time to fix it before failure.' },
            ].map(({ n, icon, bg, bd, iconCol, title, body }) => (
              <div data-reveal key={n} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#7c756a', letterSpacing: '.1em' }}>{n}</span>
                  <div style={{ flex: 1, height: 1, background: '#333b45' }} />
                </div>
                <div style={{ width: 52, height: 52, borderRadius: 13, background: bg, border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MS name={icon} size={26} color={iconCol} />
                </div>
                <h3 style={{ fontSize: 19, fontWeight: 600, color: '#DFD0B8' }}>{title}</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#948979' }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── LIVE DEMO ── */}
      <section id="demo" style={{ maxWidth: 1140, margin: '0 auto', padding: isMobile ? '70px 20px' : '130px 30px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr .85fr', gap: isMobile ? 32 : 50, alignItems: 'center' }}>
          <div data-reveal><DemoChart /></div>
          <div data-reveal>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.2em', color: '#948979', textTransform: 'uppercase', marginBottom: 18 }}>Live detection</span>
            <h2 style={{ fontSize: 'clamp(26px,3vw,40px)', fontWeight: 700, lineHeight: 1.14, letterSpacing: '-.02em', color: '#DFD0B8' }}>
              Watch the score climb from calm to critical.
            </h2>
            <p style={{ marginTop: 18, fontSize: 15, lineHeight: 1.65, color: '#948979' }}>
              As sensor behaviour drifts, the anomaly score rises. The moment it crosses the threshold, Auguard fires a critical alert — automatically, with no human watching the dial.
            </p>
            <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 12, background: 'rgba(123,138,67,.1)', border: '1px solid rgba(123,138,67,.3)' }}>
              <MS name="verified" size={24} color="#C6D196" />
              <span style={{ fontSize: 14, color: '#cabfa6', lineHeight: 1.5 }}><b style={{ color: '#DFD0B8', fontWeight: 700 }}>99.5%</b> of failures caught in testing.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAULT LOCALIZATION ── */}
      <section id="fault" style={{ background: '#1e242d', borderTop: '1px solid #262d38', borderBottom: '1px solid #262d38' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', padding: isMobile ? '70px 20px' : '120px 30px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '.9fr 1.1fr', gap: isMobile ? 32 : 50, alignItems: 'center' }}>
            <div data-reveal>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.2em', color: '#948979', textTransform: 'uppercase', marginBottom: 18 }}>Fault locator</span>
              <h2 style={{ fontSize: 'clamp(26px,3vw,40px)', fontWeight: 700, lineHeight: 1.14, letterSpacing: '-.02em', color: '#DFD0B8' }}>
                Not just "something's wrong." The exact part.
              </h2>
              <p style={{ marginTop: 18, fontSize: 15, lineHeight: 1.65, color: '#948979' }}>
                Auguard traces an anomaly back to the sensors driving it — so a technician walks up to the unit knowing precisely where to look, not guessing.
              </p>
              <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[{ label: 'TP2 · Compressor', w: '88%', score: '0.71', strong: true },
                  { label: 'H1 · Pressure',   w: '67%', score: '0.54', strong: true },
                  { label: 'DV · Pressure',   w: '48%', score: '0.39', strong: false }].map(({ label, w, score, strong }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: strong ? '#DFD0B8' : '#cabfa6', width: 110 }}>{label}</span>
                    <div style={{ flex: 1, height: 9, borderRadius: 999, background: '#161c24', overflow: 'hidden' }}>
                      <div style={{ width: w, height: '100%', borderRadius: 999, background: strong ? 'linear-gradient(90deg,#CB5B3C,#E0987F)' : 'linear-gradient(90deg,#948979,#cabfa6)' }} />
                    </div>
                    <span style={{ fontSize: 12.5, color: strong ? '#E0987F' : '#948979', fontWeight: 600, width: 34, textAlign: 'right' }}>{score}</span>
                  </div>
                ))}
              </div>
            </div>
            <div data-reveal>
              <svg viewBox="0 0 520 420" style={{ width: '100%', height: 'auto', display: 'block' }}>
                <line x1="260" y1="210" x2="120" y2="96" stroke="#CB5B3C" strokeWidth="1.6" strokeDasharray="4 5" opacity="0.6" />
                <line x1="260" y1="210" x2="400" y2="96" stroke="#CB5B3C" strokeWidth="1.6" strokeDasharray="4 5" opacity="0.6" />
                <line x1="260" y1="210" x2="120" y2="324" stroke="#3a4654" strokeWidth="1.4" strokeDasharray="4 5" />
                <line x1="260" y1="210" x2="400" y2="324" stroke="#3a4654" strokeWidth="1.4" strokeDasharray="4 5" />
                <rect x="196" y="150" width="128" height="120" rx="18" fill="#222831" stroke="#4a5160" strokeWidth="1.5" />
                <rect x="214" y="172" width="92" height="10" rx="5" fill="#393E46" />
                <rect x="214" y="192" width="64" height="8" rx="4" fill="#333b45" />
                <circle cx="260" cy="232" r="15" fill="none" stroke="#948979" strokeWidth="2" />
                <circle cx="260" cy="232" r="6" fill="#948979" />
                <text x="260" y="292" textAnchor="middle" fill="#7c756a" fontSize="11" fontWeight="600" letterSpacing="1">APU UNIT</text>
                <circle cx="120" cy="96" r="13" fill="#CB5B3C" className="pulse-r" />
                <circle cx="120" cy="96" r="26" fill="none" stroke="rgba(203,91,60,.4)" strokeWidth="1.4" />
                <text x="120" y="56" textAnchor="middle" fill="#E0987F" fontSize="13" fontWeight="600">TP2</text>
                <text x="120" y="140" textAnchor="middle" fill="#7c756a" fontSize="10.5">Compressor</text>
                <circle cx="400" cy="96" r="13" fill="#CB5B3C" style={{ animation: 'scpulseR 1.9s infinite .4s' }} />
                <circle cx="400" cy="96" r="26" fill="none" stroke="rgba(203,91,60,.4)" strokeWidth="1.4" />
                <text x="400" y="56" textAnchor="middle" fill="#E0987F" fontSize="13" fontWeight="600">H1</text>
                <text x="400" y="140" textAnchor="middle" fill="#7c756a" fontSize="10.5">Pressure</text>
                <circle cx="120" cy="324" r="11" fill="#2a3340" stroke="#7b8a43" strokeWidth="2" />
                <circle cx="120" cy="324" r="4" fill="#AEBC74" />
                <text x="120" y="362" textAnchor="middle" fill="#948979" fontSize="12">Oil Temp</text>
                <text x="120" y="378" textAnchor="middle" fill="#5d6b3a" fontSize="10" fontWeight="600">NORMAL</text>
                <circle cx="400" cy="324" r="11" fill="#2a3340" stroke="#7b8a43" strokeWidth="2" />
                <circle cx="400" cy="324" r="4" fill="#AEBC74" />
                <text x="400" y="362" textAnchor="middle" fill="#948979" fontSize="12">Motor Current</text>
                <text x="400" y="378" textAnchor="middle" fill="#5d6b3a" fontSize="10" fontWeight="600">NORMAL</text>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── ROLES ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '70px 20px 60px' : '130px 30px 90px' }}>
        <span data-reveal style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.2em', color: '#948979', textTransform: 'uppercase', marginBottom: 18 }}>Built for the whole team</span>
        <h2 data-reveal style={{ fontSize: 'clamp(28px,3.6vw,46px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-.02em', color: '#DFD0B8', maxWidth: 640 }}>
          Role-based access, from control room to workshop.
        </h2>
        <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 16 }}>
          {[
            { icon: 'admin_panel_settings', bg: 'rgba(148,137,121,.16)', bd: '#393E46', ic: '#DFD0B8', title: 'Admin',      body: 'Full oversight — create and escalate alerts, assign work, broadcast notifications and manage every account.' },
            { icon: 'build',                bg: 'rgba(217,169,74,.14)',   bd: 'rgba(217,169,74,.32)', ic: '#E4C281', title: 'Technician', body: 'Sees alerts assigned to them, acknowledges the job, and resolves it once the fix is verified on the unit.' },
            { icon: 'monitoring',           bg: 'rgba(123,138,67,.14)',   bd: 'rgba(123,138,67,.32)', ic: '#C6D196', title: 'Operator',   body: 'Monitors live dashboards and assigned alerts, keeping an eye on fleet health through every shift.' },
          ].map(({ icon, bg, bd, ic, title, body }) => (
            <div data-reveal key={title} style={{ background: '#222831', border: '1px solid #2f3742', borderRadius: 16, padding: 28 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: bg, border: `1px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MS name={icon} size={25} color={ic} />
              </div>
              <h3 style={{ marginTop: 18, fontSize: 18, fontWeight: 700, color: '#DFD0B8' }}>{title}</h3>
              <p style={{ marginTop: 9, fontSize: 14, lineHeight: 1.6, color: '#948979' }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TEAM ── */}
      <section id="team" style={{ background: '#1e242d', borderTop: '1px solid #262d38' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '70px 20px' : '120px 30px' }}>
          <span data-reveal style={{ display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.2em', color: '#948979', textTransform: 'uppercase', marginBottom: 18 }}>The team</span>
          <h2 data-reveal style={{ fontSize: 'clamp(28px,3.6vw,46px)', fontWeight: 700, lineHeight: 1.12, letterSpacing: '-.02em', color: '#DFD0B8', maxWidth: 640 }}>
            The people behind Auguard.
          </h2>
          <div style={{ marginTop: 48, display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(3,1fr)' : 'repeat(4,1fr)', gap: 14 }}>
            {TEAM.map(({ initials, name, grad, col }) => (
              <div data-reveal key={name} style={{ background: '#222831', border: '1px solid #2f3742', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 14 }}>
                <div style={{ width: 66, height: 66, borderRadius: '50%', background: `linear-gradient(${grad})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, fontWeight: 700, color: col }}>{initials}</div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: '#DFD0B8' }}>{name}</div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: '#7c756a' }}>SmartMetro Team</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER CTA ── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '80px 20px 50px' : '140px 30px 70px', textAlign: 'center' }}>
          <h2 data-reveal style={{ fontSize: 'clamp(32px,4.6vw,60px)', fontWeight: 800, lineHeight: 1.06, letterSpacing: '-.03em', color: '#DFD0B8', maxWidth: 760, margin: '0 auto' }}>
            Stop reacting to breakdowns. Start predicting them.
          </h2>
          <div data-reveal style={{ marginTop: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
            <Link to="/auth" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '15px 30px', borderRadius: 11, background: '#DFD0B8', color: '#1B2027', fontSize: 15, fontWeight: 700 }}>
              Get started <MS name="arrow_forward" size={19} color="#1B2027" />
            </Link>
            <Link to="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '15px 28px', borderRadius: 11, border: '1px solid #4a5160', background: 'transparent', color: '#DFD0B8', fontSize: 15, fontWeight: 600 }}>
              Explore the dashboard
            </Link>
          </div>
        </div>
        <div style={{ borderTop: '1px solid #262d38' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '20px 20px' : 30, display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, lineHeight: 1 }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: '#948979', letterSpacing: '-.01em' }}>Auguard</span>
              <span style={{ fontWeight: 500, fontSize: 8, color: '#5d5850', letterSpacing: '.04em', textTransform: 'uppercase' }}>AI-Powered Predictive Maintenance For APU Systems</span>
            </div>
            <span style={{ fontSize: 12, color: '#6f6a60' }}>Predictive Maintenance · MetroPT-3 · Graduation Project 2025</span>
          </div>
        </div>
      </section>
    </div>
  )
}
