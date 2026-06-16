import { useState, useEffect } from 'react'

function getBreakpoints() {
  const w = window.innerWidth
  return { isMobile: w < 768, isTablet: w < 1100 }
}

export function useResponsive() {
  const [s, setS] = useState(getBreakpoints)
  useEffect(() => {
    const fn = () => setS(getBreakpoints())
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])
  return s
}
