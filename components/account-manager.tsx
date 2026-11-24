'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { manageAccount } from '@/app/actions/accounts'
import { accountRoles, type ManagedAccount } from '@/lib/admin-accounts'
import { runClientAction } from '@/lib/client-action'

type Draft = {
  name: string
  username: string
  employeeId: string
  role: string
  isApproved: boolean
  creditLimit: string
  monthlyDeductionLimit: string
}
const blank: Draft = {
  name: '',
  username: '',
  employeeId: '',
  role: 'cashier',
  isApproved: true,
  creditLimit: '0',
  monthlyDeductionLimit: '0',
}
export function AccountManager({
  accounts,
  actorId,
}: {
  accounts: ManagedAccount[]
  actorId: string
}) {
  const dialog = useRef<HTMLElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)
  const router = useRouter()
  const [filter, setFilter] = useState('team'),
    [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ManagedAccount | null>(null),
    [mode, setMode] = useState<'edit' | 'reset' | 'create' | null>(null)
  const [draft, setDraft] = useState<Draft>(blank),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [adminPassword, setAdminPassword] = useState('')
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  const inFlight = useRef(false)
  const visible = useMemo(
    () =>
      accounts.filter(
        (a) =>
          (filter === 'all' ||
            (filter === 'customers'
              ? a.role === 'customer'
              : a.role !== 'customer')) &&
          `${a.name} ${a.username || ''} ${a.employeeId || ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [accounts, filter, search],
  )
  function open(
    mode: 'edit' | 'reset' | 'create',
    person: ManagedAccount | null = null,
  ) {
    setMode(mode)
    setSelected(person)
    setPassword('')
    setConfirmation('')
    setAdminPassword('')
    setMessage('')
    setDraft(
      person
        ? {
            ...person,
            username: person.username || '',
            employeeId: person.employeeId || '',
          }
        : blank,
    )
  }
  function close() {
    setMode(null)
    setPassword('')
    setConfirmation('')
    setAdminPassword('')
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current || !mode) return
    if (mode !== 'edit' && password !== confirmation) {
      setMessage('New passwords must match.')
      return
    }
    if (
      !window.confirm(
        mode === 'reset'
          ? `Reset the password for ${selected?.name}? All their sessions will be signed out.`
          : mode === 'create'
            ? `Create this ${draft.role} account?`
            : `Save access changes for ${selected?.name}? All their sessions will be signed out.`,
      )
    )
      return
    inFlight.current = true
    try {
      const data =
        mode === 'reset'
          ? { id: selected?.id, password, confirmation }
          : {
              ...draft,
              id: selected?.id,
              creditLimit: Number(draft.creditLimit),
              monthlyDeductionLimit: Number(draft.monthlyDeductionLimit),
              ...(mode === 'create' ? { password } : {}),
            }
      const result = await runClientAction(
        () => manageAccount(mode, data, adminPassword),
        { pending: setBusy, message: setMessage },
        'The change could not be confirmed. Refresh the directory before retrying.',
      )
      setAdminPassword('')
      setPassword('')
      setConfirmation('')
      if (result) {
        close()
        setMessage(
          mode === 'reset'
            ? 'Password updated and active sessions revoked. Share the new password through your secure credential process.'
            : 'Account saved. Existing orders and bills were preserved.',
        )
        if (result.selfChanged) {
          location.assign('/operations')
          return
        }
        router.refresh()
      }
    } finally {
      inFlight.current = false
    }
  }
  useEffect(() => {
    if (!mode) return
    restoreFocus.current = document.activeElement as HTMLElement
    const root = dialog.current
    const selectors =
      'button:not(:disabled), input:not(:disabled), select:not(:disabled)'
    root?.querySelector<HTMLElement>(selectors)?.focus()
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault()
        close()
      }
      if (event.key !== 'Tab' || !root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>(selectors))
      const first = items[0],
        last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', keyboard)
    return () => {
      document.removeEventListener('keydown', keyboard)
      restoreFocus.current?.focus()
    }
  }, [mode, busy])
  const self = selected?.id === actorId
  return (
    <section
      className="account-management"
      aria-label="Administrator account management"
    >
      <div className="ops-card">
        <div className="ops-card-heading">
          <div>
            <h2>People & access</h2>
            <p>
              Manage the team and customers. Changes require your administrator
              password.
            </p>
          </div>
          <button
            className="primary-button"
            type="button"
            onClick={() => open('create')}
          >
            Add account
          </button>
        </div>
        <div className="people-toolbar">
          <div
            className="menu-filters"
            role="group"
            aria-label="Account category"
          >
            {[
              ['team', 'Team'],
              ['customers', 'Customers'],
              ['all', 'All accounts'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`filter-chip ${filter === id ? 'is-active' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <label>
            Search accounts
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, username or employee ID"
            />
          </label>
        </div>
        <p className="people-explainer">
          Suspending an account blocks access and revokes sessions without
          deleting orders or bills. Admins can manage all roles; managers cannot
          use these full-access controls.
        </p>
        <div className="people-directory">
          {visible.map((person) => (
            <article className="people-row" key={person.id}>
              <div>
                <strong>
                  {person.name}
                  {person.id === actorId ? ' (you)' : ''}
                </strong>
                <small>
                  @{person.username || 'no username'}{' '}
                  {person.employeeId ? `· ${person.employeeId}` : ''}
                </small>
              </div>
              <div>
                <span className="status-pill">
                  {person.role.replaceAll('_', ' ')}
                </span>
                <small>
                  {person.isApproved
                    ? 'Active / approved'
                    : 'Suspended / awaiting approval'}
                </small>
              </div>
              <div>
                <small>Credit ${Number(person.creditLimit).toFixed(2)}</small>
                <small>
                  Monthly ${Number(person.monthlyDeductionLimit).toFixed(2)}
                </small>
              </div>
              <div className="people-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => open('edit', person)}
                >
                  Edit access
                </button>
                <button
                  type="button"
                  className="filter-chip"
                  onClick={() => open('reset', person)}
                >
                  Reset password
                </button>
              </div>
            </article>
          ))}
          {!visible.length && (
            <p className="ops-empty">No matching accounts.</p>
          )}
        </div>
      </div>
      {message && (
        <p className="order-notice" role="status">
          {message}
        </p>
      )}
      {mode && (
        <div className="account-modal-backdrop">
          <section
            ref={dialog}
            className="account-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="account-editor-title"
          >
            <div className="ops-card-heading">
              <div>
                <h2 id="account-editor-title">
                  {mode === 'create'
                    ? 'Create account'
                    : mode === 'reset'
                      ? `Reset password: ${selected?.name}`
                      : `Edit access: ${selected?.name}`}
                </h2>
                <p>
                  {mode === 'reset'
                    ? 'You cannot view the existing password. Resetting revokes every session.'
                    : 'Use approval to activate or suspend access. Existing records are preserved.'}
                </p>
              </div>
              <button
                type="button"
                className="filter-chip"
                disabled={busy}
                onClick={close}
              >
                Close
              </button>
            </div>
            <form className="staff-form" onSubmit={submit}>
              <fieldset disabled={busy} className="account-fields">
                {mode !== 'reset' && (
                  <>
                    <label>
                      Full name
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Username
                      <input
                        required
                        minLength={3}
                        maxLength={32}
                        pattern="[a-z0-9][a-z0-9._-]{2,31}"
                        autoComplete="off"
                        value={draft.username}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            username: e.target.value.toLowerCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      Employee ID{' '}
                      {draft.role === 'customer' ? '(required)' : '(optional)'}
                      <input
                        required={draft.role === 'customer'}
                        pattern="KV[0-9]{4}"
                        placeholder="KV0000"
                        maxLength={6}
                        value={draft.employeeId}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            employeeId: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={draft.role}
                        disabled={self}
                        onChange={(e) =>
                          setDraft({ ...draft, role: e.target.value })
                        }
                      >
                        {accountRoles.map((role) => (
                          <option key={role} value={role}>
                            {role.replaceAll('_', ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Account access
                      <select
                        disabled={self}
                        value={String(draft.isApproved)}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            isApproved: e.target.value === 'true',
                          })
                        }
                      >
                        <option value="true">Active / approved</option>
                        <option value="false">Suspended / not approved</option>
                      </select>
                    </label>
                    <label>
                      Credit limit ($)
                      <input
                        type="number"
                        min="0"
                        max="100000"
                        step="0.01"
                        required
                        value={draft.creditLimit}
                        onChange={(e) =>
                          setDraft({ ...draft, creditLimit: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Monthly deduction limit ($)
                      <input
                        type="number"
                        min="0"
                        max="100000"
                        step="0.01"
                        required
                        value={draft.monthlyDeductionLimit}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            monthlyDeductionLimit: e.target.value,
                          })
                        }
                      />
                    </label>
                  </>
                )}
                {mode !== 'edit' && (
                  <>
                    <label>
                      {mode === 'reset' ? 'New password' : 'Initial password'}
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <label>
                      Confirm new password
                      <input
                        type="password"
                        required
                        minLength={12}
                        maxLength={128}
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                  </>
                )}
                <label className="administrator-confirmation">
                  Your administrator password
                  <input
                    type="password"
                    required
                    maxLength={128}
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                  />
                </label>
                <p className="people-explainer">
                  {self
                    ? 'Changes to your own account will sign you out. You cannot demote or suspend yourself.'
                    : 'Access changes and password resets sign the selected person out everywhere.'}{' '}
                  Passwords are never displayed or logged.
                </p>
                {message && (
                  <p className="auth-error" role="alert">
                    {message}
                  </p>
                )}
                <button className="primary-button" disabled={busy}>
                  {busy
                    ? 'Saving…'
                    : mode === 'reset'
                      ? 'Confirm password reset'
                      : mode === 'create'
                        ? 'Create account'
                        : 'Save access changes'}
                </button>
              </fieldset>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
