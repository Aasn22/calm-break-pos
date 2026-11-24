'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'

export function AuthPanel({ mode, portal }: { mode: 'sign-in' | 'sign-up'; portal: 'customer' | 'operations' }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setPending(true)
    const result = mode === 'sign-up'
      ? await authClient.signUp.email({ name, email, password })
      : await authClient.signIn.email({ email, password })
    setPending(false)
    if (result.error) {
      setError('We could not complete that request. Check your details and try again.')
      return
    }
    router.replace(portal === 'operations' ? '/operations/workspace' : '/')
    router.refresh()
  }

  return <div className="auth-card">
    <div className="auth-kicker">{portal === 'operations' ? 'TEAM ACCESS' : 'YOUR CALM BREAK'}</div>
    <h1>{mode === 'sign-up' ? 'Create your account' : 'Welcome back'}</h1>
    <p className="auth-intro">{portal === 'operations' ? 'Sign in with the account provisioned by your manager.' : mode === 'sign-up' ? 'Create a customer account to place and track your orders.' : 'Sign in to see your orders and place a new one.'}</p>
    <form onSubmit={submit} className="auth-form">
      {mode === 'sign-up' && <label>Your name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={100} /></label>}
      <label>Email address<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'} minLength={12} maxLength={128} required /></label>
      {error && <p className="auth-error" role="alert">{error}</p>}
      <button className="primary-button" disabled={pending}>{pending ? 'Please wait…' : mode === 'sign-up' ? 'Create account' : 'Sign in'}</button>
    </form>
    {portal === 'customer' && <p className="auth-switch">{mode === 'sign-up' ? 'Already have an account?' : 'New to Calm Break?'} <Link href={mode === 'sign-up' ? '/sign-in' : '/sign-up'}>{mode === 'sign-up' ? 'Sign in' : 'Create an account'}</Link></p>}
    {portal === 'operations' && <Link className="back-link" href="/">Back to customer menu</Link>}
  </div>
}
