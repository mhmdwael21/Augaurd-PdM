export default function StatusBadge({ status }) {
  const styles = {
    NORMAL: {
      background: 'rgba(123,138,67,.14)', color: '#C6D196',
      border: '1px solid rgba(123,138,67,.4)',
    },
    DRIFT: {
      background: 'rgba(217,169,74,.14)', color: '#E4C281',
      border: '1px solid rgba(217,169,74,.4)',
    },
    ANOMALY: {
      background: 'rgba(203,91,60,.16)', color: '#E0987F',
      border: '1px solid rgba(203,91,60,.45)',
      animation: 'scpulse 1.9s infinite',
    },
  }
  const s = styles[status] || styles.NORMAL
  return (
    <span style={{
      fontSize: 11.5, fontWeight: 700, letterSpacing: '.1em',
      padding: '6px 13px', borderRadius: 999,
      ...s,
    }}>
      {status}
    </span>
  )
}
