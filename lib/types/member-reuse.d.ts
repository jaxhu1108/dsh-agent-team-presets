/** Stable member identity and frozen-configuration comparisons for delegation. */
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { Context } from '@deepseek-ai/cordis';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { MemberRuntime } from './member-runtime.ts';
import type { TeamAgentPreset, TeamPreset } from './types.ts';
/** Use stable role identity for route updates, retaining unique-name legacy support. */
export declare function routedMember(frozen: TeamAgentPreset, stored: TeamPreset | undefined): TeamAgentPreset;
/** The route a new instance will capture. */
export declare function routeOptions(member: TeamAgentPreset): {
    reasoningEffort?: ReasoningEffortId;
    provider: string;
    model: string;
} | undefined;
export interface ManagedMemberView {
    readonly management: 'preset' | 'unclassified';
    readonly routeMode: 'fixed-at-creation' | 'inherited-at-creation' | 'unknown';
    readonly target: string;
    readonly sessionId?: string;
    readonly activity: 'running' | 'inactive' | 'provisioning' | 'unavailable';
    readonly teamId?: string;
    readonly roleId?: string;
    readonly roleTarget?: string;
    readonly displayName?: string;
    readonly snapshot: 'available' | 'missing' | 'mismatch' | 'failed' | 'unpublished' | 'pending';
    readonly compatibility: 'matching' | 'changed' | 'other-team' | 'role-unavailable' | 'unknown';
    readonly differences: string[];
    readonly continuation: 'unchecked' | 'unavailable' | 'provisioning';
    readonly configuredRoute?: {
        provider: string;
        model: string;
        reasoningEffort?: string;
    };
    readonly toolMode?: 'all' | 'custom';
    readonly allowedTools?: string[];
}
export declare const MANAGED_MEMBER_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly management: {
            readonly type: "string";
            readonly required: true;
            readonly enum: readonly ["preset", "unclassified"];
        };
        readonly routeMode: {
            readonly type: "string";
            readonly required: true;
            readonly enum: readonly ["fixed-at-creation", "inherited-at-creation", "unknown"];
        };
        readonly target: {
            readonly type: "string";
            readonly required: true;
        };
        readonly sessionId: {
            readonly type: "string";
        };
        readonly activity: {
            readonly type: "string";
            readonly required: true;
            readonly enum: readonly ["running", "inactive", "provisioning", "unavailable"];
        };
        readonly teamId: {
            readonly type: "string";
        };
        readonly roleId: {
            readonly type: "string";
        };
        readonly roleTarget: {
            readonly type: "string";
        };
        readonly displayName: {
            readonly type: "string";
        };
        readonly snapshot: {
            readonly type: "string";
            readonly required: true;
            readonly enum: readonly ["available", "missing", "mismatch", "failed", "unpublished", "pending"];
        };
        readonly compatibility: {
            readonly type: "string";
            readonly required: true;
            readonly enum: readonly ["matching", "changed", "other-team", "role-unavailable", "unknown"];
        };
        readonly differences: {
            readonly type: "array";
            readonly required: true;
            readonly items: {
                readonly type: "string";
            };
        };
        readonly continuation: {
            readonly type: "string";
            readonly required: true;
            readonly enum: readonly ["unchecked", "unavailable", "provisioning"];
        };
        readonly configuredRoute: {
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly provider: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly model: {
                    readonly type: "string";
                    readonly required: true;
                };
                readonly reasoningEffort: {
                    readonly type: "string";
                };
            };
        };
        readonly toolMode: {
            readonly type: "string";
            readonly enum: readonly ["all", "custom"];
        };
        readonly allowedTools: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
            };
        };
    };
};
/** Read snapshots without waking members or claiming their continuation is healthy. */
export declare function inspectTeamMembers(ctx: Context, root: Agent, team: TeamPreset, stored: TeamPreset | undefined, runtime: MemberRuntime): Promise<{
    issue?: string;
    members: ManagedMemberView[];
}>;
