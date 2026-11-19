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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
/** Tree membership, with names supplied by the subagent runtime. */
export interface PresetMembership {
    /** Whether this Agent leads the tree or is one of its members. */
    readonly role: 'lead' | 'teammate';
    /** The tree root this Agent belongs to; the Agent itself when it leads. */
    readonly root: Agent;
    /** Model-facing name: `lead` for the root, the path for a member. */
    readonly name: string;
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
export declare function membershipOf(ctx: Context, agent: Agent): PresetMembership | undefined;
/** One child known to this root, including durable names and live execution state. */
export interface PresetMemberView {
    /** The child Session identity. */
    readonly id: SessionId;
    /** Durable member name, or the Session id when it has none. */
    readonly name: string;
    /** Every row this module reports is a member, never the Lead. */
    readonly role: 'teammate';
    /** Current execution state; `provisioning` only while creation is in flight. */
    readonly status: 'running' | 'provisioning' | 'inactive';
    /** Backend the child was created through, when the catalog recorded one. */
    readonly provider?: string;
}
/**
 * Track a member before the runtime publishes its catalog or lifecycle events.
 * @param root - the Team Lead Agent the creation belongs to.
 * @param childId - the identity reserved for this creation.
 * @param name - the member name this creation will carry.
 * @returns a disposer to call once creation has published or failed.
 */
export declare function reserveMember(root: Agent, childId: SessionId, name: string): () => void;
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
export declare function teamMembers(ctx: Context, root: Agent): PresetMemberView[];
/**
 * Count members whose current work prevents changing the frozen Team definition.
 * @param ctx - host context carrying the projections and the Agent registry.
 * @param root - the Team Lead Agent whose tree is read.
 * @returns how many members are running or provisioning.
 */
export declare function executingMemberCount(ctx: Context, root: Agent): number;
