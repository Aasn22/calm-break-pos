'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
export function AutoRefresh() {
  const router = useRouter()
  const [at, setAt] = useState('')
  useEffect(() => {
    function update() {
      if (document.visibilityState === 'visible') {
        router.refresh()
        setAt(new Date().toLocaleTimeString())
      }
    }
    const id = setInterval(update, 5000)
    window.addEventListener('focus', update)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', update)
    }
  }, [router])
  return (
    <small className="sync-label" role="status">
      Refreshes every 5s{at ? ` · checked ${at}` : ''}
    </small>
  )
}
