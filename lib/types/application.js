/**
 * Apply one Team preset to one live Session.
 *
 * The captain's system prompt shadows the deployment persona for that Session,
 * the captain's independent tool mode scopes the Session's visible global tools,
 * and the Session gains `spawn_team_member`, which applies the selected member's
 * own persona, route, reasoning effort, and tool mode. The Session keeps the
 * model it already selected: a captain never changes the Session's route. A
 * member's persona and tool mode belong to the definition the Team task started
 * with; its route does not, so a corrected route reaches the next member the
 * task summons.
 * @module dsh-agent-team-presets/application
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { SessionId } from '@deepseek-ai/dsh-session';
import { randomUUID } from 'node:crypto';
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt';
import { IMPLICIT_TOOLS, availableMemberTarget, captainBriefing, definitionFingerprint, findMember, memberBriefing, memberTargets, memberTeamDivision, toolMode } from "./presets.js";
import { teamMembers, reserveMember } from "./team-runtime.js";
import { depthRefusal, routeRefusal } from "./delegation.js";
import { memberProviderFor } from "./member-identity.js";
import { guardPolicy, inheritedFilter, isOwnLayerTool, policyOf } from "./tool-policy.js";
import { LIST_TEAM_MEMBERS_DESCRIPTION, SPAWN_TEAM_MEMBER_DESCRIPTION } from "./tool-descriptions.js";
import { MANAGED_MEMBER_SCHEMA, inspectTeamMembers, routeOptions, routedMember } from "./member-reuse.js";
/** The route this plugin actually installed on one created member. */
const MEMBER_ROUTE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        provider: { type: 'string', required: true },
        model: { type: 'string', required: true },
        reasoningEffort: { type: 'string' },
    },
};
/** Output schema of one `spawn_team_member` result. */
const SPAWN_VALUE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        target: { type: 'string' },
        status: { type: 'string', required: true, enum: ['active', 'failed', 'reuse-required'] },
        message: { type: 'string' },
        candidates: { type: 'array', items: MANAGED_MEMBER_SCHEMA },
        creationReason: { type: 'string' },
        // The route this plugin installed from the member's frozen snapshot. The
        // host roster reports a different value (it falls back to the Lead's
        // options), so the two are never presented as one fact.
        configuredRoute: MEMBER_ROUTE_SCHEMA,
    },
};
/**
 * Register the captain's tool scope on one Session.
 * Invalid tool names reject application instead of granting unrestricted access.
 * @param agent - the live Session agent.
 * @param captain - configured policy and allow-list; custom-empty denies every global tool.
 * @returns the restriction disposer, or undefined for the default-all policy.
 */
function restrictCaptainTools(agent, captain) {
    if (toolMode(captain) === 'all')
        return undefined;
    const filter = inheritedFilter(agent, policyOf('captain', captain));
    return filter === undefined ? undefined : agent.ctx.tools.restrict(filter);
}
/**
 * Reject a Team this Session cannot apply, before any registration is touched.
 *
 * `tools.restrict` owns the authority on which global names an allow-list may
 * carry, and the probe applies and lifts it so the real application still
 * registers exactly one restriction. Every other registration a Team needs —
 * the two prompt sections and the member tool — uses names and orders fixed by
 * this plugin, so a captain allow-list naming an unknown tool is the failure an
 * adoption can actually hit. Callers check before releasing a running
 * application, so a refused preset never leaves a Session without one.
 * @param agent - the live Session agent about to take the Team.
 * @param team - the Team preset about to be applied.
 * @throws when the captain's custom allow-list names a tool this Session cannot restrict.
 */
export function assertTeamApplicable(agent, team) {
    const { captain } = team;
    if (toolMode(captain) === 'all')
        return;
    const filter = inheritedFilter(agent, policyOf(team.id, captain));
    if (filter !== undefined)
        agent.ctx.tools.restrict(filter)();
}
/**
 * Reject a Team whose allow-list names a capability this Session does not have.
 *
 * The settings catalog is the union of every standing Agent preset's tools, not
 * what one Session can actually call: a `minimal` Session composes no file
 * tools, so an allow-list naming one cannot be honoured. It is refused with the
 * missing names instead of being widened to the default-all policy or silently
 * trimmed, and the tool is never added just because the catalog lists it.
 * @param agent - the live Session agent about to take the Team.
 * @param team - the Team preset about to be applied.
 * @returns the refusal text, or undefined when every named capability is reachable.
 */
export function capabilityRefusal(agent, team) {
    const missing = new Map();
    const slots = [
        ['captain', team.captain],
        ...team.members.map((member, index) => [`member "${member.name.trim() === '' ? `member-${index + 1}` : member.name.trim()}"`, member]),
    ];
    for (const [label, slot] of slots) {
        if (toolMode(slot) !== 'custom')
            continue;
        for (const name of slot.tools) {
            if (isOwnLayerTool(name))
                continue;
            // An implicit tool is admitted by the policy itself and is never required
            // to exist, so a document written by an earlier version that still lists
            // one must not refuse the whole Team on a deployment that composes no such
            // tool.
            if (IMPLICIT_TOOLS.includes(name))
                continue;
            if (agent.ctx.tools.get(name, agent) !== undefined)
                continue;
            missing.set(label, [...missing.get(label) ?? [], name]);
        }
    }
    if (missing.size === 0)
        return undefined;
    const detail = [...missing].map(([label, names]) => `${label}: ${names.join(', ')}`).join('; ');
    return `Team "${team.id}" names capabilities this Session cannot reach (${detail}). The tools catalog lists the union `
        + 'of every Agent preset, not what this Session composes: select an Agent preset that provides those tools, or '
        + 'remove them from the allow-list.';
}
/** How an official creation refusal is explained to the Team Lead. */
const CONCURRENT_CAPACITY = /active child limit/i;
/** The Team's lifetime member allowance, which a finished member still occupies. */
const LIFETIME_QUOTA = /team member limit/i;
/**
 * Explain one failed creation in terms the captain can act on.
 *
 * The two limits are different: an activity slot frees itself when a member
 * finishes, while a used-up Team allowance never comes back. The official text
 * is always preserved verbatim inside the explanation, because it carries the
 * exact numbers the Host decided with.
 * @param error - the failure `startActivation` reported.
 * @param roster - the members this root already knows, so a spent allowance can
 *   name the slots that never became usable.
 * @returns the model-facing explanation.
 */
function classifySpawnFailure(error, roster = []) {
    const message = error instanceof Error ? error.message : String(error);
    if (CONCURRENT_CAPACITY.test(message)) {
        return 'No subagent slot is free right now: this deployment\'s concurrent subagent limit is reached. Wait for a '
            + `running member to finish, then summon again. (${message})`;
    }
    if (LIFETIME_QUOTA.test(message)) {
        const used = roster.length;
        const failed = roster.filter(entry => entry.status === 'failed').map(entry => entry.name);
        const occupancy = `${used} roster slot${used === 1 ? '' : 's'} occupied`;
        const spent = failed.length === 0
            ? ''
            : `, and ${failed.length} of them never became usable (${failed.join(', ')})`;
        return 'This Team has used up its lifetime member allowance. A member that already finished still occupies its '
            + `Team roster slot (${occupancy}${spent}), so this Team cannot summon another instance; finish the task with the `
            + `members it has. (${message})`;
    }
    return message;
}
/**
 * Register the model-facing member tool on one Session.
 *
 * Official rc.2's Team request accepts only `name`, `description`, `prompt`,
 * `context`, `provider`, and `signal`; the member's route, persona, and tool
 * scope therefore travel through the durable member snapshot this tool records
 * BEFORE `startActivation` is called, and are installed by the serial
 * `agent/created` listener. A refused snapshot refuses the spawn: a member that
 * could not be recorded must not be created, because nothing would re-scope it.
 * @param ctx - the plugin context providing `agentTeams`.
 * @param agent - the live Session agent that owns the tool.
 * @param team - the applied Team preset.
 * @param providers - continuable-subagent providers to spawn through.
 * @param stored - reads the latest stored definition of the applied Team.
 * @param members - the durable member runtime owned by this plugin activation.
 * @returns the tool registration disposer.
 */
function registerMemberTool(ctx, agent, team, providers, stored, members) {
    const targets = memberTargets(team);
    const summary = targets.map(({ target }) => target).join(', ');
    const reserved = new Map();
    const disposeList = agent.ctx.tools.register(defineTool({
        name: 'list_team_members',
        description: LIST_TEAM_MEMBERS_DESCRIPTION,
        parameters: {
            offset: { type: 'integer', description: 'Non-negative number of instances to skip. Defaults to 0.' },
        },
        isConcurrencySafe: () => true,
        output: {
            schema: {
                type: 'object', additionalProperties: false,
                properties: {
                    teamId: { type: 'string', required: true },
                    members: { type: 'array', required: true, items: MANAGED_MEMBER_SCHEMA },
                    nextOffset: { type: 'integer' }, issue: { type: 'string' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        async execute(args, exec) {
            if (exec.agent !== agent)
                throw new Error('list_team_members requires this Team captain');
            if (members === undefined)
                throw new Error('The preset member runtime is unavailable');
            const result = await inspectTeamMembers(ctx, agent, team, stored(), members);
            const offset = args.offset ?? 0;
            if (!Number.isSafeInteger(offset) || offset < 0)
                throw new Error('offset must be a non-negative safe integer');
            return {
                teamId: team.id, members: result.members.slice(offset, offset + 100),
                ...offset + 100 < result.members.length ? { nextOffset: offset + 100 } : {},
                ...result.issue === undefined ? {} : { issue: result.issue },
            };
        },
    }));
    let disposeSpawn;
    try {
        disposeSpawn = agent.ctx.tools.register(defineTool({
            name: 'spawn_team_member',
            description: `${SPAWN_TEAM_MEMBER_DESCRIPTION} Available members: ${summary.length === 0 ? '(none)' : summary}.`,
            parameters: {
                member: { type: 'string', required: true, description: 'Member target from the active Team preset roster.' },
                task: { type: 'string', required: true, description: 'Complete initial task for the member, including every fact it needs.' },
                description: { type: 'string', description: 'Short description of the delegated responsibility; defaults to the member preset description.' },
                creation_reason: {
                    type: 'string',
                    description: 'Explain why another instance is needed when this role already has one. Valid needs include independent parallel work or review, unrelated work needing isolated context, stale conclusions, updated role configuration, or replacement after confirmed non-resumable failure. Related follow-ups use send_message. Temporary capacity or closing errors call for waiting or retrying.',
                },
                context: {
                    type: 'string',
                    enum: ['fresh', 'fork'],
                    description: 'fresh starts without your history; fork inherits your completed turns. Defaults to fresh.',
                },
            },
            output: {
                schema: SPAWN_VALUE_SCHEMA,
                render: (_args, value) => [
                    { type: 'text', text: JSON.stringify(value) },
                ],
            },
            async execute(args, exec) {
                const caller = exec.agent;
                if (caller === undefined)
                    throw new Error('spawn_team_member requires a calling Agent');
                const resolved = findMember(team, args.member);
                if (resolved === undefined) {
                    throw new Error(`unknown Team member "${args.member}"; available members: ${targets.map(entry => entry.target).join(', ') || '(none)'}`);
                }
                const { member, target } = resolved;
                // No runtime means this Session was composed outside the plugin's
                // activation; a member it created could never be re-scoped, so refuse.
                if (members === undefined) {
                    throw new Error('This Session was composed without the preset member runtime, so a summoned member '
                        + 'could not be given its frozen configuration. Spawning a member is refused.');
                }
                const inventory = await inspectTeamMembers(ctx, caller, team, stored(), members);
                if (inventory.issue !== undefined)
                    throw new Error(inventory.issue);
                const candidates = inventory.members.filter(row => row.teamId === team.id && row.roleTarget === target);
                const pending = [...reserved].filter(([, roleTarget]) => roleTarget === target).map(([name]) => ({
                    management: 'preset', routeMode: 'unknown',
                    target: name, teamId: team.id, roleTarget: target,
                    activity: 'provisioning', snapshot: 'pending',
                    compatibility: 'unknown', differences: [], continuation: 'provisioning',
                }));
                const creationReason = args.creation_reason?.trim() || undefined;
                if (creationReason === undefined && candidates.length + pending.length > 0) {
                    return {
                        status: 'reuse-required',
                        message: 'Review list_team_members and the candidates before creating another instance. Continue related work with send_message using the exact target and compatible frozen configuration. For independent parallel work or review, isolated context, updated configuration, or a confirmed non-resumable replacement, call again with creation_reason. Wait or retry temporary capacity and closing failures.',
                        candidates: [...candidates, ...pending].slice(0, 100),
                    };
                }
                // Creation admission comes before anything durable exists: a refused
                // creation leaves no intent record, no roster row, and no model request.
                const depth = depthRefusal(ctx, caller);
                if (depth !== undefined)
                    throw new Error(depth);
                const context = args.context ?? 'fresh';
                // The alias is this member's durable identity: the Host writes it into the
                // child's own descriptor and the tree catalog, which is what tells this
                // member apart from a native teammate after a restart.
                const alias = memberProviderFor(providers, context);
                if ('error' in alias)
                    throw new Error(alias.error);
                // A member's model-facing name is a path from the root, so only its last
                // segment is the name unique among this Lead's children.
                const used = new Set(teamMembers(ctx, caller).map(row => row.name.split('/').pop() ?? row.name));
                for (const name of reserved.keys())
                    used.add(name);
                for (const entry of targets)
                    if (entry.target !== target)
                        used.add(entry.target);
                for (const row of inventory.members)
                    used.add(row.target);
                const instance = availableMemberTarget(target, used);
                reserved.set(instance, target);
                try {
                    return await members.admit(async () => {
                        const task = [{ type: 'text', text: args.task }];
                        // Read the route now, not when the Team was applied: a route corrected
                        // during this task applies to the next member it summons. It is then
                        // verified against the live registry before any durable intent, so an
                        // unusable route cannot fail inside the member's first turn.
                        const route = routeOptions(routedMember(member, stored()));
                        const unusableRoute = await routeRefusal(ctx, route);
                        if (unusableRoute !== undefined)
                            throw new Error(unusableRoute);
                        // Settings can change while the route check awaits, so the depth cap is
                        // re-read at the last moment before the durable intent is written.
                        const recheck = depthRefusal(ctx, caller);
                        if (recheck !== undefined)
                            throw new Error(recheck);
                        const policy = policyOf(team.id, member);
                        // The child identity is reserved and persisted BEFORE the Host starts
                        // creation: rc.3 publishes the child only after `agent/created`, so the
                        // snapshot is the only way the creation edge can identify this member.
                        const childId = SessionId(randomUUID());
                        const description = args.description
                            ?? (member.description.trim() === '' ? member.name.trim() || target : member.description.trim());
                        const prepared = await members.prepare({
                            root: caller,
                            childId,
                            target: instance,
                            teamId: team.id,
                            roleId: member.id,
                            displayName: member.name.trim(),
                            roleDescription: member.description.trim(),
                            // The definition a Team task froze owns the member's persona, its
                            // team context, and its tool scope; `routedMember` above owns only
                            // the route, so a corrected model reaches the next member summoned.
                            persona: memberBriefing(team, member, instance),
                            teamSection: memberTeamDivision(team, instance),
                            roster: targets.map(entry => ({
                                target: entry.target,
                                display: entry.member.name.trim(),
                                description: entry.member.description.trim(),
                            })),
                            route,
                            policy,
                            spawnContext: context,
                        });
                        if (prepared.kind === 'refused')
                            throw new Error(prepared.reason);
                        // Admitted but not yet published: this reservation is what keeps the
                        // new member visible to the name scan and to the execution monitor
                        // during the creation window.
                        const release = reserveMember(caller, childId, instance);
                        try {
                            const activation = members.track(await ctx.subagents.startActivation({
                                provider: alias.name,
                                label: description,
                                prompt: task,
                                parent: caller,
                                signal: exec.signal,
                                delivery: 'parent',
                                name: instance,
                                childId,
                            }));
                            return {
                                target: activation.name,
                                status: 'active',
                                ...creationReason === undefined ? {} : { creationReason },
                                ...route === undefined ? {} : { configuredRoute: { ...route } },
                            };
                        }
                        catch (error) {
                            // A failed spawn may still have created a child, so the snapshot is
                            // never deleted; it is only marked when no child was observed.
                            await members.markFailed(caller.id, instance);
                            // A member whose own route is unusable fails inside its first turn,
                            // and the Host then reports only its provisioning checkpoint. Name the
                            // member's real cause so the fault is not mistaken for a Team fault.
                            const cause = members.failureOf(caller.id, instance);
                            const reported = classifySpawnFailure(error, teamMembers(ctx, caller));
                            if (cause === undefined)
                                throw new Error(reported, { cause: error });
                            throw new Error(`${reported} (the member's own first request failed: ${cause})`, { cause: error });
                        }
                        finally {
                            release();
                        }
                    });
                }
                finally {
                    reserved.delete(instance);
                }
            },
        }));
    }
    catch (error) {
        disposeList();
        throw error;
    }
    return () => { disposeSpawn(); disposeList(); };
}
/**
 * Apply one Team preset to one live Session.
 *
 * A later call for the same Session replaces the previous application.
 * @param ctx - the plugin context providing the Team and Session services.
 * @param agent - the live Session agent taking the Team.
 * @param team - the Team preset to apply.
 * @param providers - continuable-subagent providers the member tool spawns through.
 * @param stored - reads the latest stored definition of this Team, so a member
 *   spawned later runs on its current route; defaults to the applied definition.
 * @param members - the durable member runtime that freezes each summoned
 *   member's configuration before creation; without one the member tool refuses
 *   rather than creating a member nothing could re-scope.
 * @returns the applied Team, whose `dispose` releases every registration.
 */
export function applyTeamToAgent(ctx, agent, team, providers, stored = () => undefined, members, options = {}) {
    const disposers = [];
    const register = (disposer) => {
        if (disposer !== undefined)
            disposers.push(disposer);
    };
    try {
        const { captain } = team;
        if (captain.systemPrompt.trim() !== '') {
            register(agent.ctx.systemPrompt.section({
                name: PERSONA_PREFIX_SECTION,
                order: agent.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
                text: captain.systemPrompt,
            }));
        }
        else if (options.personaFallback !== undefined && options.personaFallback.trim() !== '') {
            // The deployment's own complete persona (the official `minimal` preset)
            // would otherwise reduce the assembled prompt to itself and hide this
            // Team's briefing from its own captain. Re-declaring that exact text under
            // the same section name WITHOUT `complete` keeps the deployment's wording
            // while letting this Team's sections participate. The preset's tool set
            // and its runtime-context suppression stay exactly as composed.
            register(agent.ctx.systemPrompt.section({
                name: PERSONA_PREFIX_SECTION,
                order: agent.ctx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
                text: options.personaFallback,
            }));
        }
        const briefing = captainBriefing(team);
        if (briefing !== '') {
            register(agent.ctx.systemPrompt.section({
                name: 'agent-team-presets:briefing',
                order: agent.ctx.systemPrompt.getSectionOrder('TEAM_POLICY'),
                text: briefing,
            }));
        }
        register(guardPolicy(agent, policyOf(team.id, captain), options.presentation === undefined
            ? {}
            : { presentation: 'caller' }));
        if (options.presentation !== undefined)
            register(options.presentation.install());
        register(restrictCaptainTools(agent, captain));
        register(registerMemberTool(ctx, agent, team, providers, stored, members));
    }
    catch (error) {
        for (const dispose of disposers.reverse())
            void dispose();
        throw error;
    }
    return {
        teamId: team.id,
        fingerprint: definitionFingerprint(team),
        ...options.presentation?.disclosure === undefined ? {} : { presentationNote: options.presentation.disclosure },
        dispose() {
            for (const dispose of disposers.splice(0).reverse())
                void dispose();
        },
    };
}
