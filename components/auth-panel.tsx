'use client'

import { AuthBrandStory, CalmBrand } from '@/components/calm-brand'
import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  registerCustomerAccount,
  signInWithIdentifier,
} from '@/app/actions/auth'

export function AuthPanel({
  mode,
  portal,
}: {
  mode: 'sign-in' | 'sign-up'
  portal: 'customer' | 'operations'
}) {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const isCustomer = portal === 'customer'
  const isRegistration = mode === 'sign-up'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    setPending(true)

    try {
      if (isRegistration) {
        const result = await registerCustomerAccount({
          employeeId: identifier,
          password,
        })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setIdentifier('')
        setPassword('')
        setNotice(
          'Registration received. An administrator must approve your employee ID before you can sign in and order.',
        )
        return
      }

      const result = await signInWithIdentifier({
        portal,
        identifier,
        password,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.replace(result.destination)
      router.refresh()
    } catch {
      setError(
        'We could not complete that request. Check your details and try again.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="branded-auth-layout">
      <AuthBrandStory operations={!isCustomer} />
      <div className="auth-form-side">
        <div className="auth-mobile-brand">
          <CalmBrand href={isCustomer ? '/' : '/operations'} />
        </div>
        <div className="auth-card">
          <div className="auth-kicker">
            {isCustomer ? 'YOUR CALM BREAK' : 'TEAM ACCESS'}
          </div>
          <h1>
            {isRegistration
              ? 'Your break starts here.'
              : isCustomer
                ? 'Welcome back.'
                : 'Ready for a great shift?'}
          </h1>
          <p className="auth-intro">
            {isCustomer
              ? isRegistration
                ? 'Register with your Kuda Villingili employee ID. Ordering starts after admin approval.'
                : 'Sign in with your Kuda Villingili employee ID to see the menu and your orders.'
              : 'Sign in with your team username. Administrators may also use their registered email.'}
          </p>
          <form onSubmit={submit} className="auth-form">
            <label>
              {isCustomer ? 'Employee ID' : 'Username or admin email'}
              <input
                value={identifier}
                onChange={(event) =>
                  setIdentifier(
                    isCustomer
                      ? event.target.value.toUpperCase()
                      : event.target.value,
                  )
                }
                type="text"
                autoComplete="username"
                autoCapitalize={isCustomer ? 'characters' : 'none'}
                placeholder={isCustomer ? 'KV0000' : 'Your username or email'}
                maxLength={isCustomer ? 6 : 254}
                pattern={isCustomer ? 'KV[0-9]{4}' : undefined}
                title={
                  isCustomer
                    ? 'Use KV followed by exactly four digits.'
                    : undefined
                }
                required
              />
            </label>
            <label>
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete={
                  isRegistration ? 'new-password' : 'current-password'
                }
                minLength={isRegistration ? 12 : undefined}
                maxLength={128}
                required
              />
            </label>
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="order-notice" role="status">
                {notice}
              </p>
            )}
            <button className="primary-button" disabled={pending}>
              {pending
                ? 'Please wait…'
                : isRegistration
                  ? 'Request access'
                  : 'Sign in'}
            </button>
          </form>
          {isCustomer && (
            <p className="auth-switch">
              {isRegistration ? 'Already registered?' : 'First time here?'}{' '}
              <Link href={isRegistration ? '/sign-in' : '/sign-up'}>
                {isRegistration ? 'Sign in' : 'Request access'}
              </Link>
            </p>
          )}
          {!isCustomer && (
            <Link className="back-link" href="/">
              Back to customer menu
            </Link>
          )}
        </div>
        <p className="auth-security-note">
          Your account. Your space. Secure access.
        </p>
      </div>
    </div>
  )
}
