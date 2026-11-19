/**
 * Subagent tree identity and execution state used by Team presets on DSH rc.3.
 *
 * rc.3 retired the standalone Team roster: a Team member is an ordinary
 * continuable subagent, so membership, names, and status come from
 * `ctx.subagents` and the `subagentCatalog` projection rather than from
 * `agentTeams.tryMembership()` / `listMembers()`.
 *
 * The one thing that service cannot answer is a member that has been admitted
 * but not yet published: `startActivation` resolves only after creation
 * publishes, so a creation in flight has no catalog row and no live Agent. The
 * synchronous `provisioning` map below covers exactly that window.
 *
 * This module is deliberately free of plugin state so every reader — the
 * execution monitor, the preset tools, and the member tool — agrees on the
 * same answers.
 * @module dsh-agent-team-presets/team-runtime
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-projection'
import type { SubagentCatalogEntry } from '@deepseek-ai/dsh-subagent'

/** Tree membership, with names supplied by the subagent runtime. */
export interface PresetMembership {
  /** Whether this Agent leads the tree or is one of its members. */
  readonly role: 'lead' | 'teammate'
  /** The tree root this Agent belongs to; the Agent itself when it leads. */
  readonly root: Agent
  /** Model-facing name: `lead` for the root, the path for a member. */
  readonly name: string
}

/**
 * Resolve published membership.
 *
 * Creation callbacks must NOT use this to identify a member this plugin is
 * creating: the runtime has not published that child yet. Use the reserved
 * snapshot identity (`membershipFor`) for that edge instead.
 * @param ctx - host context carrying the subagent service.
 * @param agent - exact live Agent to resolve.
 * @returns its tree role, or undefined when the child is not yet published.
 */
export function membershipOf(ctx: Context, agent: Agent): PresetMembership | undefined {
  if (agent.session.header.origin !== 'subagent') return { role: 'lead', root: agent, name: 'lead' }
  try {
    const root = ctx.subagents.rootOf(agent)
    return { role: root === agent ? 'lead' : 'teammate', root, name: ctx.subagents.namesOf(agent).self }
  } catch (error: unknown) {
    // A child is not published in the runtime until agent/created completes.
    if (error instanceof Error && 'code' in error && error.code === 'UNAUTHORIZED') return undefined
    throw error
  }
}

/** One child known to this root, including durable names and live execution state. */
export interface PresetMemberView {
  /** The child Session identity. */
  readonly id: SessionId
  /** Durable member name, or the Session id when it has none. */
  readonly name: string
  /** Every row this module reports is a member, never the Lead. */
  readonly role: 'teammate'
  /** Current execution state; `provisioning` only while creation is in flight. */
  readonly status: 'running' | 'provisioning' | 'inactive'
  /** Backend the child was created through, when the catalog recorded one. */
  readonly provider?: string
}

/** Admitted creations that have not been published yet, per tree root. */
const provisioning = new WeakMap<Agent, Map<SessionId, string>>()

/**
 * Track a member before the runtime publishes its catalog or lifecycle events.
 * @param root - the Team Lead Agent the creation belongs to.
 * @param childId - the identity reserved for this creation.
 * @param name - the member name this creation will carry.
 * @returns a disposer to call once creation has published or failed.
 */
export function reserveMember(root: Agent, childId: SessionId, name: string): () => void {
  let pending = provisioning.get(root)
  if (pending === undefined) { pending = new Map(); provisioning.set(root, pending) }
  pending.set(childId, name)
  return () => { pending.delete(childId) }
}

/**
 * Read durable direct children, live descendants, and admitted member
 * creations synchronously.
 *
 * The durable catalog is the authority for members with no live child: a
 * finished member is cold-resumable, so it still occupies its name even while
 * no Agent exists for it.
 * @param ctx - host context carrying the projections and the Agent registry.
 * @param root - the Team Lead Agent whose tree is read.
 * @returns every child of that root, Lead excluded.
 */
export function teamMembers(ctx: Context, root: Agent): PresetMemberView[] {
  const rows = new Map<SessionId, PresetMemberView>()
  // A malformed durable stream makes `snapshot` throw. That is deliberately NOT
  // swallowed: an unreadable tree is undecidable, and reporting it as idle
  // would let a preset be rewritten while a member is still running.
  const catalog = ctx.sessionProjections.snapshot(root.session, ['subagentCatalog']).values['subagentCatalog'] as SubagentCatalogEntry[] | undefined
  for (const child of catalog ?? []) {
    // `provider` is recorded by the descriptor-backed catalog rows only, so it is
    // read through a widened view rather than assumed on every entry variant.
    const backend = (child as { provider?: unknown }).provider
    rows.set(child.id, {
      id: child.id,
      name: 'name' in child ? child.name ?? child.id : child.id,
      role: 'teammate',
      status: 'inactive',
      ...typeof backend === 'string' ? { provider: backend } : {},
    })
  }
  for (const child of ctx.agents.list()) {
    if (child === root || child.session.header.origin !== 'subagent') continue
    const membership = membershipOf(ctx, child)
    if (membership?.root !== root) continue
    rows.set(child.id, {
      id: child.id,
      name: membership.name,
      role: 'teammate',
      status: child.status === 'running' ? 'running' : 'inactive',
    })
  }
  for (const [id, name] of provisioning.get(root) ?? []) {
    rows.set(id, { id, name, role: 'teammate', status: 'provisioning' })
  }
  return [...rows.values()]
}

/**
 * Count members whose current work prevents changing the frozen Team definition.
 * @param ctx - host context carrying the projections and the Agent registry.
 * @param root - the Team Lead Agent whose tree is read.
 * @returns how many members are running or provisioning.
 */
export function executingMemberCount(ctx: Context, root: Agent): number {
  return teamMembers(ctx, root).filter(member => member.status !== 'inactive').length
}
