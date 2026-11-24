import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { applyPortalSchema } from '../lib/db/migrate'
import { authOrigins } from '../lib/auth-origins'
import { endClientSession, runClientAction } from '../lib/client-action'
import * as schema from '../lib/db/schema'

const env = {
  NODE_ENV: 'production',
  BETTER_AUTH_URL: 'https://www.myplate.digital',
  VERCEL_PROJECT_PRODUCTION_URL: 'www.myplate.digital',
  VERCEL_URL: 'preview-exact.vercel.app',
}

test('all observed Calm Break aliases are explicitly trusted without trusting arbitrary tenants', () => {
  const config = authOrigins(env)
  for (const host of [
    'calm-break-pos.vercel.app',
    'www.myplate.digital',
    'myplate.digital',
    'calm-break-pos-calm-projects.vercel.app',
    'calm-break-pos-git-main-calm-projects.vercel.app',
    'preview-exact.vercel.app',
  ]) {
    assert.ok(config.trustedOrigins.includes(`https://${host}`))
    assert.ok(config.baseURL.allowedHosts.includes(host))
  }
  assert.equal(
    config.trustedOrigins.includes('https://attacker.vercel.app'),
    false,
  )
  assert.equal(config.baseURL.allowedHosts.includes('*.vercel.app'), false)
  assert.equal(config.trustedOrigins.includes('http://localhost:3000'), false)
  assert.equal(
    config.trustedOrigins.includes(
      'https://calm-break-pos.vercel.app.evil.test',
    ),
    false,
  )
})

test('real auth handler reproduces old 403, then revokes a session and expires cookies on the repaired alias', async () => {
  const pg = new PGlite()
  try {
    await applyPortalSchema(pg)
    const database = drizzleAdapter(drizzle(pg, { schema }), {
      provider: 'pg',
      schema,
    })
    const secret = randomBytes(32).toString('hex')
    const old = betterAuth({
      database,
      secret,
      baseURL: 'https://www.myplate.digital',
      trustedOrigins: ['https://www.myplate.digital'],
    })
    const oldResponse = await old.handler(
      new Request('https://calm-break-pos.vercel.app/api/auth/sign-out', {
        method: 'POST',
        headers: {
          origin: 'https://calm-break-pos.vercel.app',
          'content-type': 'application/json',
          cookie: 'better-auth.session_token=test',
        },
        body: '{}',
      }),
    )
    assert.equal(oldResponse.status, 403)
    const auth = betterAuth({
      database,
      secret,
      ...authOrigins(env),
      emailAndPassword: {
        enabled: true,
        minPasswordLength: 12,
        autoSignIn: false,
      },
      rateLimit: { enabled: false },
    })
    // Test-only identity/password generated in memory, never shipped to deployments.
    const email = `${randomBytes(8).toString('hex')}@example.test`
    const password = randomBytes(24).toString('hex')
    await auth.api.signUpEmail({
      body: { name: 'Isolated test', email, password },
    })
    const signedIn = await auth.handler(
      new Request('https://calm-break-pos.vercel.app/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          origin: 'https://calm-break-pos.vercel.app',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      }),
    )
    assert.equal(signedIn.status, 200)
    const cookie = signedIn.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ')
    assert.ok(cookie)
    assert.equal((await pg.query('SELECT id FROM session')).rows.length, 1)
    const session = await auth.api.getSession({
      headers: new Headers({ cookie, host: 'calm-break-pos.vercel.app' }),
    })
    assert.ok(session?.user)
    for (const forgedOrigin of [
      'https://attacker.vercel.app',
      'https://calm-break-pos.vercel.app.evil.test',
    ]) {
      const denied = await auth.handler(
        new Request('https://calm-break-pos.vercel.app/api/auth/sign-out', {
          method: 'POST',
          headers: {
            origin: forgedOrigin,
            cookie,
            'content-type': 'application/json',
          },
          body: '{}',
        }),
      )
      assert.equal(denied.status, 403)
      assert.equal((await pg.query('SELECT id FROM session')).rows.length, 1)
    }
    const signedOut = await auth.handler(
      new Request('https://calm-break-pos.vercel.app/api/auth/sign-out', {
        method: 'POST',
        headers: {
          origin: 'https://calm-break-pos.vercel.app',
          cookie,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    )
    assert.equal(signedOut.status, 200)
    assert.equal((await signedOut.json()).success, true)
    assert.equal((await pg.query('SELECT id FROM session')).rows.length, 0)
    assert.ok(
      signedOut.headers
        .getSetCookie()
        .some((v) => v.includes('session_token=;') && /max-age=0/i.test(v)),
    )
    assert.equal(
      await auth.api.getSession({
        headers: new Headers({ cookie, host: 'calm-break-pos.vercel.app' }),
      }),
      null,
    )
  } finally {
    await pg.close()
  }
})

test('POS action pending state clears on success, validation failures and network exceptions', async () => {
  for (const mode of ['success', 'validation', 'exception']) {
    const pending: boolean[] = [],
      messages: string[] = []
    const result = await runClientAction(
      async () => {
        if (mode === 'exception') throw new Error('private server detail')
        return mode === 'success'
          ? { ok: true as const, orderNumber: 42 }
          : { ok: false as const, message: 'Item is unavailable.' }
      },
      {
        pending: (value) => pending.push(value),
        message: (value) => messages.push(value),
      },
      'Request failed; check the order board before retrying.',
    )
    assert.deepEqual(pending, [true, false])
    if (mode === 'success') assert.equal(result?.orderNumber, 42)
    else {
      assert.equal(result, null)
      assert.ok(messages.at(-1))
      assert.ok(!messages.join(' ').includes('private'))
    }
  }
})

test('sign-out UI only navigates after confirmed success, never on 403/network failure', async () => {
  let navigated = false
  const navigate = () => {
    navigated = true
  }
  await assert.rejects(() =>
    endClientSession(
      async () => ({ data: null, error: { status: 403 } }),
      navigate,
    ),
  )
  assert.equal(navigated, false)
  await assert.rejects(() =>
    endClientSession(async () => {
      throw new Error('network')
    }, navigate),
  )
  assert.equal(navigated, false)
  await endClientSession(
    async () => ({ data: { success: true }, error: null }),
    navigate,
  )
  assert.equal(navigated, true)
})
