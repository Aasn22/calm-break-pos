import { and, desc, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema'
import { policyInput, type LoyaltyView } from '../operations-modules'
import { OperationsError, requireManager } from './purchasing'
const { user, orders, loyaltyPolicy, loyaltyEntries } = schema,
  workspace = 'calm-break-main'
const defaults = {
  configured: false,
  enabled: false,
  pointsPerDollar: 1,
  rewardPoints: 100,
  rewardLabel: 'Café reward',
}
export function loyalty(db: NodePgDatabase<typeof schema>) {
  return {
    async view(actorId: string, customer = false): Promise<LoyaltyView> {
      if (!customer) await requireManager(db, actorId)
      else {
        const [u] = await db
          .select()
          .from(user)
          .where(
            and(
              eq(user.id, actorId),
              eq(user.workspaceId, workspace),
              eq(user.isApproved, true),
              eq(user.role, 'customer'),
            ),
          )
        if (!u) throw new OperationsError('Approved customer access required.')
      }
      const [policy] = await db
        .select()
        .from(loyaltyPolicy)
        .where(eq(loyaltyPolicy.workspaceId, workspace))
      const members = await db
        .select({ id: user.id, name: user.name, employeeId: user.employeeId })
        .from(user)
        .where(
          and(
            eq(user.workspaceId, workspace),
            eq(user.role, 'customer'),
            ...(customer ? [eq(user.id, actorId)] : []),
          ),
        )
      const entries = await db
        .select()
        .from(loyaltyEntries)
        .where(
          and(
            eq(loyaltyEntries.workspaceId, workspace),
            ...(customer ? [eq(loyaltyEntries.customerId, actorId)] : []),
          ),
        )
        .orderBy(desc(loyaltyEntries.createdAt))
      const completed = customer
        ? []
        : await db
            .select({
              id: orders.id,
              orderNumber: orders.orderNumber,
              total: orders.total,
              customerUserId: orders.customerUserId,
            })
            .from(orders)
            .where(
              and(
                eq(orders.workspaceId, workspace),
                eq(orders.status, 'completed'),
              ),
            )
            .orderBy(desc(orders.createdAt))
      return {
        ...(policy ? { ...policy, configured: true } : defaults),
        fulfilledIds: entries
          .filter((e) => e.kind === 'fulfill')
          .map((e) => e.id.replace(/^fulfilled:/, '')),
        members: members.map((m) => ({
          ...m,
          points: entries
            .filter((e) => e.customerId === m.id)
            .reduce((n, e) => n + e.points, 0),
        })),
        entries: entries.slice(0, 100),
        eligibleOrders: completed.filter(
          (o) => o.customerUserId && !entries.some((e) => e.orderId === o.id),
        ),
      }
    },
    async configure(actorId: string, input: unknown) {
      await requireManager(db, actorId)
      const p = policyInput.safeParse(input)
      if (!p.success)
        throw new OperationsError('Review the earning and reward rules.')
      await db
        .insert(loyaltyPolicy)
        .values({ workspaceId: workspace, ...p.data })
        .onConflictDoUpdate({
          target: loyaltyPolicy.workspaceId,
          set: { ...p.data, updatedAt: new Date() },
        })
    },
    async award(actorId: string, orderId: string) {
      await requireManager(db, actorId)
      return db.transaction(async (tx) => {
        const [policy] = await tx
          .select()
          .from(loyaltyPolicy)
          .where(eq(loyaltyPolicy.workspaceId, workspace))
          .for('share')
        if (!policy?.enabled)
          throw new OperationsError('Enable the loyalty program first.')
        const [order] = await tx
          .select()
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.workspaceId, workspace)))
          .for('update')
        if (!order || order.status !== 'completed' || !order.customerUserId)
          throw new OperationsError(
            'Only completed, customer-linked orders qualify.',
          )
        const [member] = await tx
          .select()
          .from(user)
          .where(
            and(
              eq(user.id, order.customerUserId),
              eq(user.workspaceId, workspace),
              eq(user.role, 'customer'),
              eq(user.isApproved, true),
            ),
          )
          .for('update')
        if (!member)
          throw new OperationsError('An active customer account is required.')
        const points = Math.floor(Number(order.total) * policy.pointsPerDollar)
        if (points < 1 || points > 1000000000)
          throw new OperationsError(
            'Order has no eligible points or exceeds the points limit.',
          )
        const inserted = await tx
          .insert(loyaltyEntries)
          .values({
            id: crypto.randomUUID(),
            workspaceId: workspace,
            customerId: member.id,
            actorId,
            orderId,
            points,
            kind: 'earn',
            note: `Order #${order.orderNumber} · ${policy.pointsPerDollar} points/$`,
          })
          .onConflictDoNothing({ target: loyaltyEntries.orderId })
          .returning({ id: loyaltyEntries.id })
        if (!inserted.length)
          throw new OperationsError(
            'Points have already been awarded for this order.',
          )
      })
    },
    async fulfill(actorId: string, redemptionId: string) {
      await requireManager(db, actorId)
      return db.transaction(async (tx) => {
        const [redemption] = await tx
          .select()
          .from(loyaltyEntries)
          .where(
            and(
              eq(loyaltyEntries.id, redemptionId),
              eq(loyaltyEntries.workspaceId, workspace),
              eq(loyaltyEntries.kind, 'redeem'),
            ),
          )
          .for('update')
        if (!redemption)
          throw new OperationsError('Reward redemption not found.')
        const saved = await tx
          .insert(loyaltyEntries)
          .values({
            id: `fulfilled:${redemptionId}`,
            workspaceId: workspace,
            customerId: redemption.customerId,
            actorId,
            points: 0,
            kind: 'fulfill',
            note: `Reward handed over: ${redemption.note}`,
          })
          .onConflictDoNothing({ target: loyaltyEntries.id })
          .returning({ id: loyaltyEntries.id })
        if (!saved.length)
          throw new OperationsError('This reward has already been fulfilled.')
      })
    },
    async redeem(
      actorId: string,
      customerId: string,
      key: string,
      customer = false,
    ) {
      if (!customer) await requireManager(db, actorId)
      else if (actorId !== customerId)
        throw new OperationsError('You can redeem only your own points.')
      if (!/^[0-9a-f-]{36}$/i.test(key))
        throw new OperationsError('Invalid redemption key.')
      return db.transaction(async (tx) => {
        const [policy] = await tx
          .select()
          .from(loyaltyPolicy)
          .where(eq(loyaltyPolicy.workspaceId, workspace))
          .for('share')
        if (!policy?.enabled)
          throw new OperationsError('Loyalty is currently disabled.')
        const [member] = await tx
          .select()
          .from(user)
          .where(
            and(
              eq(user.id, customerId),
              eq(user.workspaceId, workspace),
              eq(user.role, 'customer'),
              eq(user.isApproved, true),
            ),
          )
          .for('update')
        if (!member)
          throw new OperationsError('An active customer account is required.')
        const [prior] = await tx
          .select()
          .from(loyaltyEntries)
          .where(eq(loyaltyEntries.id, key))
        if (prior) {
          if (
            prior.customerId !== customerId ||
            prior.workspaceId !== workspace
          )
            throw new OperationsError('Invalid redemption.')
          return
        }
        const [balance] = await tx
          .select({
            points: sql<number>`coalesce(sum(${loyaltyEntries.points}),0)::integer`,
          })
          .from(loyaltyEntries)
          .where(
            and(
              eq(loyaltyEntries.customerId, customerId),
              eq(loyaltyEntries.workspaceId, workspace),
            ),
          )
        if (balance.points < policy.rewardPoints)
          throw new OperationsError('Not enough points for this reward.')
        await tx.insert(loyaltyEntries).values({
          id: key,
          workspaceId: workspace,
          customerId,
          actorId,
          points: -policy.rewardPoints,
          kind: 'redeem',
          note: policy.rewardLabel,
        })
      })
    },
  }
}
