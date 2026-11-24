import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { isPresetMemberProvider } from "./member-identity.js";
import { memberBriefing, memberTargets, memberTeamDivision, toolMode } from "./presets.js";
import { teamMembers } from "./team-runtime.js";
/** Use stable role identity for route updates, retaining unique-name legacy support. */
export function routedMember(frozen, stored) {
    if (stored === undefined)
        return frozen;
    const matches = stored.members.filter(member => frozen.id === undefined
        ? member.name.trim() === frozen.name.trim()
        : member.id === frozen.id);
    return matches.length === 1 ? matches[0] : frozen;
}
/** The route a new instance will capture. */
export function routeOptions(member) {
    if (member.provider === '' || member.model === '')
        return undefined;
    return {
        provider: member.provider,
        model: member.model,
        ...member.reasoningEffort === '' ? {} : { reasoningEffort: ReasoningEffortId(member.reasoningEffort) },
    };
}
export const MANAGED_MEMBER_SCHEMA = {
    type: 'object', additionalProperties: false,
    properties: {
        management: { type: 'string', required: true, enum: ['preset', 'unclassified'] },
        routeMode: { type: 'string', required: true, enum: ['fixed-at-creation', 'inherited-at-creation', 'unknown'] },
        target: { type: 'string', required: true },
        sessionId: { type: 'string' },
        activity: { type: 'string', required: true, enum: ['running', 'inactive', 'provisioning', 'unavailable'] },
        teamId: { type: 'string' }, roleId: { type: 'string' }, roleTarget: { type: 'string' }, displayName: { type: 'string' },
        snapshot: { type: 'string', required: true, enum: ['available', 'missing', 'mismatch', 'failed', 'unpublished', 'pending'] },
        compatibility: { type: 'string', required: true, enum: ['matching', 'changed', 'other-team', 'role-unavailable', 'unknown'] },
        differences: { type: 'array', required: true, items: { type: 'string' } },
        continuation: { type: 'string', required: true, enum: ['unchecked', 'unavailable', 'provisioning'] },
        configuredRoute: {
            type: 'object', additionalProperties: false,
            properties: { provider: { type: 'string', required: true }, model: { type: 'string', required: true }, reasoningEffort: { type: 'string' } },
        },
        toolMode: { type: 'string', enum: ['all', 'custom'] },
        allowedTools: { type: 'array', items: { type: 'string' } },
    },
};
/** Compare against the definition used for the next spawn, with its latest route. */
function comparison(record, team, stored) {
    if (record.teamId !== team.id)
        return { compatibility: 'other-team', differences: ['team'] };
    const matches = memberTargets(team).filter(({ member }) => record.roleId === undefined
        ? member.name.trim() === record.displayName
        : member.id === record.roleId);
    if (matches.length !== 1)
        return { compatibility: 'role-unavailable', differences: ['role'] };
    const { member, target } = matches[0];
    const differences = [];
    if (record.persona !== memberBriefing(team, member, record.memberName))
        differences.push('persona');
    if (record.teamSection !== memberTeamDivision(team, record.memberName))
        differences.push('teamContext');
    const expectedTools = [...new Set(member.tools)].sort();
    const frozenTools = [...new Set(record.policy.allow)].sort();
    if (record.policy.mode !== toolMode(member)
        || (record.policy.mode === 'custom' && JSON.stringify(frozenTools) !== JSON.stringify(expectedTools)))
        differences.push('tools');
    if (JSON.stringify(record.route) !== JSON.stringify(routeOptions(routedMember(member, stored))))
        differences.push('route');
    return { roleTarget: target, compatibility: differences.length === 0 ? 'matching' : 'changed', differences };
}
/** Read snapshots without waking members or claiming their continuation is healthy. */
export async function inspectTeamMembers(ctx, root, team, stored, runtime) {
    const state = await runtime.whenReady();
    const records = state.kind === 'ready' ? state.store.values().filter(record => record.rootSessionId === root.id) : [];
    const rows = teamMembers(ctx, root);
    const views = [];
    const seen = new Set();
    for (const row of rows) {
        const record = records.find(candidate => candidate.memberName === row.name);
        if (record !== undefined)
            seen.add(record);
        const managed = record !== undefined || isPresetMemberProvider(row.provider);
        const snapshot = record === undefined ? 'missing'
            : record.childSessionId !== undefined && record.childSessionId !== row.id ? 'mismatch'
                : record.lifecycle === 'failed' ? 'failed' : 'available';
        views.push({
            management: managed ? 'preset' : 'unclassified',
            routeMode: record === undefined ? 'unknown' : record.route === undefined ? 'inherited-at-creation' : 'fixed-at-creation',
            target: row.name, sessionId: row.id, activity: row.status, snapshot,
            continuation: managed && snapshot !== 'available' ? 'unavailable' : row.status === 'provisioning' ? 'provisioning' : 'unchecked',
            ...record === undefined ? { compatibility: 'unknown', differences: [] } : {
                teamId: record.teamId, ...record.roleId === undefined ? {} : { roleId: record.roleId }, displayName: record.displayName,
                ...comparison(record, team, stored),
                ...record.route === undefined ? {} : { configuredRoute: {
                        provider: record.route.provider, model: record.route.model,
                        ...record.route.reasoningEffort === undefined ? {} : { reasoningEffort: record.route.reasoningEffort },
                    } },
                toolMode: record.policy.mode, allowedTools: [...record.policy.allow],
            },
        });
    }
    for (const record of records) {
        if (seen.has(record))
            continue;
        views.push({
            management: 'preset', routeMode: record.route === undefined ? 'inherited-at-creation' : 'fixed-at-creation',
            target: record.memberName, ...record.childSessionId === undefined ? {} : { sessionId: record.childSessionId },
            activity: 'unavailable', snapshot: record.lifecycle === 'failed' ? 'failed' : 'unpublished', continuation: 'unavailable',
            teamId: record.teamId, ...record.roleId === undefined ? {} : { roleId: record.roleId }, displayName: record.displayName,
            ...comparison(record, team, stored),
        });
    }
    return { members: views, ...state.kind === 'ready' ? {} : { issue: state.reason } };
}
