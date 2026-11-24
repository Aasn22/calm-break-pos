import { and, asc, eq, ne, or, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { randomUUID } from 'node:crypto'
import * as schema from '../db/schema'
import {
  createAccountSchema,
  editAccountSchema,
  resetAccountSchema,
} from '../admin-accounts'
const { user, account, session } = schema
const workspace = 'calm-break-main'
export class AccountManagementError extends Error {}
const safeFields = {
  id: user.id,
  name: user.name,
  username: user.username,
  employeeId: user.employeeId,
  role: user.role,
  isApproved: user.isApproved,
  creditLimit: user.creditLimit,
  monthlyDeductionLimit: user.monthlyDeductionLimit,
}

export function accountManagement(db: NodePgDatabase<typeof schema>) {
  return {
    async list(actorId: string) {
      const [actor] = await db
        .select()
        .from(user)
        .where(
          and(
            eq(user.id, actorId),
            eq(user.workspaceId, workspace),
            eq(user.role, 'admin'),
            eq(user.isApproved, true),
          ),
        )
      if (!actor)
        throw new AccountManagementError('Administrator access is required.')
      return db
        .select(safeFields)
        .from(user)
        .where(eq(user.workspaceId, workspace))
        .orderBy(asc(user.name))
    },
    async mutate(
      actorId: string,
      operation: 'create' | 'edit' | 'reset',
      input: unknown,
      administratorPassword: unknown,
    ) {
      const parsed = (
        operation === 'create'
          ? createAccountSchema
          : operation === 'edit'
            ? editAccountSchema
            : resetAccountSchema
      ).safeParse(input)
      if (!parsed.success)
        throw new AccountManagementError(
          parsed.error.issues[0]?.message || 'Review the account fields.',
        )
      if (
        typeof administratorPassword !== 'string' ||
        !administratorPassword ||
        administratorPassword.length > 128
      )
        throw new AccountManagementError(
          'Enter your own administrator password to confirm this change.',
        )
      return db.transaction(async (tx) => {
        // Serialize privileged changes, including the last-admin invariant.
        await tx.execute(sql`select pg_advisory_xact_lock(157821, 94834)`)
        const [actor] = await tx
          .select()
          .from(user)
          .where(and(eq(user.id, actorId), eq(user.workspaceId, workspace)))
          .for('update')
        if (!actor || actor.role !== 'admin' || !actor.isApproved)
          throw new AccountManagementError('Administrator access is required.')
        const [credential] = await tx
          .select({ password: account.password })
          .from(account)
          .where(
            and(
              eq(account.userId, actor.id),
              eq(account.providerId, 'credential'),
            ),
          )
        if (
          !credential?.password ||
          !(await verifyPassword({
            hash: credential.password,
            password: administratorPassword,
          }))
        )
          throw new AccountManagementError(
            'Your administrator password could not be verified.',
          )
        if (operation === 'create') {
          const data = createAccountSchema.parse(input)
          const exists = await tx
            .select({ id: user.id })
            .from(user)
            .where(
              or(
                eq(user.username, data.username),
                data.employeeId
                  ? eq(user.employeeId, data.employeeId)
                  : sql`false`,
              ),
            )
          if (exists.length)
            throw new AccountManagementError(
              'The username or employee ID is already in use.',
            )
          const id = randomUUID(),
            now = new Date()
          await tx
            .insert(user)
            .values({
              id,
              workspaceId: workspace,
              name: data.name,
              email: `${id}@managed.calm-break.invalid`,
              emailVerified: true,
              username: data.username,
              employeeId: data.employeeId || null,
              role: data.role,
              isApproved: data.isApproved,
              approvedAt: data.isApproved ? now : null,
              approvedBy: data.isApproved ? actor.id : null,
              creditLimit: data.creditLimit.toFixed(2),
              monthlyDeductionLimit: data.monthlyDeductionLimit.toFixed(2),
            })
          await tx
            .insert(account)
            .values({
              id: randomUUID(),
              accountId: id,
              userId: id,
              providerId: 'credential',
              password: await hashPassword(data.password),
            })
          return { selfChanged: false }
        }
        const targetId = (parsed.data as { id: string }).id
        const [target] = await tx
          .select()
          .from(user)
          .where(and(eq(user.id, targetId), eq(user.workspaceId, workspace)))
          .for('update')
        if (!target)
          throw new AccountManagementError(
            'Account not found in this workspace.',
          )
        if (operation === 'reset') {
          const data = resetAccountSchema.parse(input)
          const changed = await tx
            .update(account)
            .set({
              password: await hashPassword(data.password),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(account.userId, target.id),
                eq(account.providerId, 'credential'),
              ),
            )
            .returning({ id: account.id })
          if (!changed.length)
            throw new AccountManagementError(
              'This account has no password credential. No change was made.',
            )
        } else {
          const data = editAccountSchema.parse(input)
          if (
            target.id === actor.id &&
            (data.role !== 'admin' || !data.isApproved)
          )
            throw new AccountManagementError(
              'You cannot suspend or demote your own administrator account.',
            )
          if (
            target.role === 'admin' &&
            target.isApproved &&
            (data.role !== 'admin' || !data.isApproved)
          ) {
            const others = await tx
              .select({ id: user.id })
              .from(user)
              .where(
                and(
                  eq(user.workspaceId, workspace),
                  eq(user.role, 'admin'),
                  eq(user.isApproved, true),
                  ne(user.id, target.id),
                ),
              )
            if (!others.length)
              throw new AccountManagementError(
                'At least one active administrator must remain.',
              )
          }
          const exists = await tx
            .select({ id: user.id })
            .from(user)
            .where(
              and(
                ne(user.id, target.id),
                or(
                  eq(user.username, data.username),
                  data.employeeId
                    ? eq(user.employeeId, data.employeeId)
                    : sql`false`,
                ),
              ),
            )
          if (exists.length)
            throw new AccountManagementError(
              'The username or employee ID is already in use.',
            )
          await tx
            .update(user)
            .set({
              name: data.name,
              username: data.username,
              employeeId: data.employeeId || null,
              role: data.role,
              isApproved: data.isApproved,
              approvedAt: data.isApproved ? new Date() : null,
              approvedBy: data.isApproved ? actor.id : null,
              creditLimit: data.creditLimit.toFixed(2),
              monthlyDeductionLimit: data.monthlyDeductionLimit.toFixed(2),
              updatedAt: new Date(),
            })
            .where(eq(user.id, target.id))
        }
        // Role/suspension changes and password resets revoke every active session.
        await tx.delete(session).where(eq(session.userId, target.id))
        return { selfChanged: target.id === actor.id }
      })
    },
  }
}
