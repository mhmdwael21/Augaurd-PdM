export default function Toast({ title, time, sub, onDismiss, titleColor = '#E0987F' }) {
  return (
    <div style={{
      position: 'fixed', top: 22, right: 26, zIndex: 50,
      width: 330, padding: '16px 18px',
      background: '#2a2019', border: '1px solid rgba(203,91,60,.55)',
      borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,.5)',
      animation: 'sctoast .4s ease both',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 30, height: 30, borderRadius: 8,
          background: 'rgba(203,91,60,.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'scpulse 1.6s infinite',
        }}>
          <span style={{
            fontFamily: "'Material Symbols Outlined'",
            fontVariationSettings: "'FILL' 0,'wght' 300",
            fontStyle: 'normal', lineHeight: 1,
            display: 'inline-block', verticalAlign: 'middle',
            fontSize: 17, color: titleColor,
          }}>warning</span>
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: titleColor }}>{title}</span>
          <span style={{ fontSize: 10, color: '#948979', letterSpacing: '.06em' }}>{time}</span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#948979', fontSize: 16, lineHeight: 1,
          }}>×</button>
        )}
      </div>
      <span style={{ fontSize: 12.5, lineHeight: 1.4, color: '#d8c9af' }}>{sub}</span>
    </div>
  )
}
