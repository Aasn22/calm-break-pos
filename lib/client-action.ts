export type ActionResult = { ok: true } | { ok: false; message: string }

/** Always release UI pending state, and never treat a rejected request as success. */
export async function runClientAction<T extends ActionResult>(
  action: () => Promise<T>,
  ui: { pending: (value: boolean) => void; message: (value: string) => void },
  failure: string,
): Promise<T | null> {
  ui.pending(true)
  ui.message('')
  try {
    const result = await action()
    if (!result.ok) {
      ui.message(result.message)
      return null
    }
    return result
  } catch {
    ui.message(failure)
    return null
  } finally {
    ui.pending(false)
  }
}

export async function endClientSession(
  signOut: () => Promise<{
    data: { success?: boolean } | null
    error: unknown
  }>,
  navigate: () => void,
) {
  const result = await signOut()
  if (result.error || !result.data?.success) throw new Error('Sign-out failed')
  navigate()
}
