'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveProfile } from '@/app/actions/fulfilment'
import { runClientAction } from '@/lib/client-action'
export function ProfileForm({
  name,
  allergies,
}: {
  name: string
  allergies: string
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  return (
    <form
      className="staff-form profile-fields"
      onSubmit={async (e) => {
        e.preventDefault()
        const f = new FormData(e.currentTarget)
        const r = await runClientAction(
          () =>
            saveProfile({ name: f.get('name'), allergies: f.get('allergies') }),
          { pending: setBusy, message: setMessage },
          'Could not save profile.',
        )
        if (r) {
          setMessage(
            'Profile saved. Operations can see your latest allergy note on every linked order.',
          )
          router.refresh()
        }
      }}
    >
      <label>
        Name
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={name}
        />
      </label>
      <label>
        Allergies / safety notes
        <textarea
          name="allergies"
          maxLength={1000}
          defaultValue={allergies}
          placeholder="For example: severe peanut allergy"
        />
      </label>
      <p className="people-explainer">
        These notes appear on orders for the café/shop team. Speak to the team
        directly about severe allergies; the system does not certify food as
        allergen-free.
      </p>
      <button className="primary-button" disabled={busy}>
        Save profile
      </button>
      {message && (
        <p className="order-notice" role="status">
          {message}
        </p>
      )}
    </form>
  )
}
