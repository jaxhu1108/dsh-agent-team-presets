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
export function membershipOf(ctx, agent) {
    if (agent.session.header.origin !== 'subagent')
        return { role: 'lead', root: agent, name: 'lead' };
    try {
        const root = ctx.subagents.rootOf(agent);
        return { role: root === agent ? 'lead' : 'teammate', root, name: ctx.subagents.namesOf(agent).self };
    }
    catch (error) {
        // A child is not published in the runtime until agent/created completes.
        if (error instanceof Error && 'code' in error && error.code === 'UNAUTHORIZED')
            return undefined;
        throw error;
    }
}
/** Admitted creations that have not been published yet, per tree root. */
const provisioning = new WeakMap();
/**
 * Track a member before the runtime publishes its catalog or lifecycle events.
 * @param root - the Team Lead Agent the creation belongs to.
 * @param childId - the identity reserved for this creation.
 * @param name - the member name this creation will carry.
 * @returns a disposer to call once creation has published or failed.
 */
export function reserveMember(root, childId, name) {
    let pending = provisioning.get(root);
    if (pending === undefined) {
        pending = new Map();
        provisioning.set(root, pending);
    }
    pending.set(childId, name);
    return () => { pending.delete(childId); };
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
export function teamMembers(ctx, root) {
    const rows = new Map();
    // A malformed durable stream makes `snapshot` throw. That is deliberately NOT
    // swallowed: an unreadable tree is undecidable, and reporting it as idle
    // would let a preset be rewritten while a member is still running.
    const catalog = ctx.sessionProjections.snapshot(root.session, ['subagentCatalog']).values['subagentCatalog'];
    for (const child of catalog ?? []) {
        // `provider` is recorded by the descriptor-backed catalog rows only, so it is
        // read through a widened view rather than assumed on every entry variant.
        const backend = child.provider;
        rows.set(child.id, {
            id: child.id,
            name: 'name' in child ? child.name ?? child.id : child.id,
            role: 'teammate',
            status: 'inactive',
            ...typeof backend === 'string' ? { provider: backend } : {},
        });
    }
    for (const child of ctx.agents.list()) {
        if (child === root || child.session.header.origin !== 'subagent')
            continue;
        const membership = membershipOf(ctx, child);
        if (membership?.root !== root)
            continue;
        rows.set(child.id, {
            ...rows.get(child.id),
            id: child.id,
            name: membership.name,
            role: 'teammate',
            status: child.status === 'running' ? 'running' : 'inactive',
        });
    }
    for (const [id, name] of provisioning.get(root) ?? []) {
        rows.set(id, { id, name, role: 'teammate', status: 'provisioning' });
    }
    return [...rows.values()];
}
/**
 * Count members whose current work prevents changing the frozen Team definition.
 * @param ctx - host context carrying the projections and the Agent registry.
 * @param root - the Team Lead Agent whose tree is read.
 * @returns how many members are running or provisioning.
 */
export function executingMemberCount(ctx, root) {
    return teamMembers(ctx, root).filter(member => member.status !== 'inactive').length;
}
