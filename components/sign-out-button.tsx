'use client'

import { useRef, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import { endClientSession, runClientAction } from '@/lib/client-action'

export function SignOutButton({
  destination,
}: {
  destination: '/' | '/operations'
}) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  async function signOut() {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await runClientAction(
        async () => {
          await endClientSession(
            () => authClient.signOut(),
            () => location.assign(destination),
          )
          return { ok: true }
        },
        { pending: setPending, message: setMessage },
        'Sign-out could not be confirmed. Please retry; if it continues, contact the administrator.',
      )
    } finally {
      inFlight.current = false
    }
  }
  return (
    <div className="signout-control">
      <button
        className="text-button"
        type="button"
        onClick={() => void signOut()}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {message && (
        <p className="signout-error" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}
