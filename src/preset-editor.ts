/**
 * Pure Team preset edits behind the model-facing preset tools.
 *
 * An edit replaces the stored preset only: the caller persists the returned
 * Team through the settings document, and the plugin's existing volatile
 * reconcile applies it. Nothing here reads or writes a live Session, so one
 * edit is testable without one.
 * @module dsh-agent-team-presets/preset-editor
 */

import { memberTargets } from './presets.ts'
import type { TeamAgentPreset, TeamCaptainPreset, TeamPreset } from './types.ts'

/** Longest member description the teammate roster accepts when it spawns that member. */
export const MEMBER_DESCRIPTION_LIMIT = 200

/** One member edit, addressed the way the captain summons that member. */
export interface TeamMemberEdit {
  /** Member display name, or the teammate target the roster summons it under. */
  readonly member: string
  /** Replacement display name; omitted keeps the stored one. */
  readonly name?: string
  /** Replacement role description; omitted keeps the stored one. */
  readonly description?: string
  /** Replacement standing system prompt; omitted keeps the stored one. */
  readonly systemPrompt?: string
  /** Replacement provider route; empty inherits the captain route. */
  readonly provider?: string
  /** Replacement provider-owned model id. */
  readonly model?: string
  /** Replacement reasoning effort. */
  readonly reasoningEffort?: string
  /**
   * Replacement tool policy mode. Omitted keeps the stored one; a new member
   * defaults to `all`.
   *
   * `custom` requires `tools` in the same edit, because a mode without a list
   * would deny every tool: the allow-list is the whole meaning of custom.
   */
  readonly toolMode?: 'all' | 'custom'
  /** Replacement tool allow-list; only meaningful together with `toolMode: 'custom'`. */
  readonly tools?: readonly string[]
  /** Remove this member template from future summons. */
  readonly remove?: boolean
}

/** The preset fields one edit may replace. */
export interface TeamPresetEdit {
  /** Replacement Team purpose; omitted keeps the stored one. */
  readonly description?: string
  /** Replacement captain description; omitted keeps the stored one. */
  readonly captainDescription?: string
  /** Replacement captain standing system prompt; omitted keeps the stored one. */
  readonly captainSystemPrompt?: string
  /** Member edits, each addressed by display name or teammate target. */
  readonly members?: readonly TeamMemberEdit[]
  /** Whether roster personnel changes are authorized for this edit. */
  readonly personnelControl?: boolean
}

/** The policy a member ends up with, or the refusal reason. */
type ToolPolicyResolution =
  | { readonly toolMode: 'all' | 'custom'; readonly tools: readonly string[] }
  | { readonly message: string }

/** Deduplicate, trim, and drop empty names so the stored list is canonical. */
function normaliseToolNames(tools: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tools) {
    const name = raw.trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    out.push(name)
  }
  return out
}

/**
 * Resolve the tool policy one member edit asks for.
 *
 * The mode and the list are one decision, not two: `custom` with an empty list
 * denies every tool, which is almost never what a captain meant and is
 * indistinguishable from a typo. So a custom mode with no names is refused
 * rather than stored, and a list supplied without a mode is read as `custom`
 * only when it is non-empty — a list of nothing means "leave this alone".
 * @param entry - the member edit carrying the requested policy.
 * @param current - the policy the member holds now, used for omitted fields.
 * @param label - the member name or target, for the refusal text.
 * @returns the resolved policy, or the refusal reason.
 */
function resolveToolPolicy(
  entry: TeamMemberEdit,
  current: { toolMode: 'all' | 'custom'; tools: readonly string[] },
  label: string,
): ToolPolicyResolution {
  const namedMode = entry.toolMode !== undefined
  const namedTools = entry.tools !== undefined
  if (!namedMode && !namedTools) return { toolMode: current.toolMode, tools: current.tools }

  const tools = namedTools ? normaliseToolNames(entry.tools ?? []) : normaliseToolNames(current.tools)
  const mode = namedMode
    ? entry.toolMode as 'all' | 'custom'
    : (namedTools && tools.length > 0 ? 'custom' : current.toolMode)

  if (mode === 'custom' && tools.length === 0) {
    return {
      message: `member "${label}" would have no tools: custom mode requires at least one tool name, and an empty allow-list denies every tool. Pass tools for that member, or use toolMode "all".`,
    }
  }
  // An "all" member keeps no allow-list, so a stale list cannot resurface if the
  // mode is switched back to custom later.
  return { toolMode: mode, tools: mode === 'all' ? [] : tools }
}

/** One refused edit: the model-facing reason, already naming what the caller may pass. */
export interface TeamPresetEditRefusal {
  readonly ok: false
  /** Why the edit was refused, written for the model that requested it. */
  readonly message: string
}

/** One applied edit: the next preset and the field paths it actually replaced. */
export interface TeamPresetEditApplied {
  readonly ok: true
  /** The next preset. The input preset is never mutated. */
  readonly team: TeamPreset
  /** Field paths the edit replaced; empty when every supplied value already matched. */
  readonly changed: readonly string[]
}

/** Outcome of applying one edit to one stored Team preset. */
export type TeamPresetEditResult = TeamPresetEditApplied | TeamPresetEditRefusal

/** Refusal text for a call that names no editable field at all. */
const NO_FIELDS = 'no editable field was supplied; pass team_description, captain_description, captain_system_prompt, or members'
const PERSONNEL_DISABLED = 'personnelControl is disabled for this Team; enable it in Settings before changing members'

/**
 * Whether one edit supplies any editable field.
 * @param edit - the requested edit.
 * @returns whether the caller named at least one field or member entry.
 */
function suppliesField(edit: TeamPresetEdit): boolean {
  return edit.description !== undefined
    || edit.captainDescription !== undefined
    || edit.captainSystemPrompt !== undefined
    || (edit.members?.length ?? 0) > 0
}

/**
 * Apply one field edit to one Team preset.
 *
 * A member entry resolves exactly the way `spawn_team_member` resolves its
 * `member` argument, so the name that summons a member is the name that edits
 * it. Supplying a value the preset already holds is not a change: the path is
 * left out of `changed`, and a call whose every value already matched returns
 * an unchanged preset so the caller can skip the write.
 * @param team - the stored preset to edit.
 * @param edit - the fields to replace.
 * @returns the next preset with the field paths it changed, or the refusal reason.
 */
export function editTeamPreset(team: TeamPreset, edit: TeamPresetEdit): TeamPresetEditResult {
  if (!suppliesField(edit)) return { ok: false, message: NO_FIELDS }
  const rosterEdit = (edit.members?.length ?? 0) > 0
  if (rosterEdit && edit.personnelControl === false) return { ok: false, message: PERSONNEL_DISABLED }

  const changed: string[] = []
  let description = team.description
  if (edit.description !== undefined && edit.description !== description) {
    description = edit.description
    changed.push('team.description')
  }

  const captain: TeamCaptainPreset = { ...team.captain }
  if (edit.captainDescription !== undefined && edit.captainDescription !== captain.description) {
    captain.description = edit.captainDescription
    changed.push('captain.description')
  }
  if (edit.captainSystemPrompt !== undefined && edit.captainSystemPrompt !== captain.systemPrompt) {
    captain.systemPrompt = edit.captainSystemPrompt
    changed.push('captain.systemPrompt')
  }

  const members = team.members.map(member => ({ ...member }))
  const roster = memberTargets({ ...team, members })
  for (const entry of edit.members ?? []) {
    const wanted = entry.member.trim()
    const at = roster.findIndex(row => row.target === wanted.toLowerCase() || row.member.name.trim() === wanted)
    const row = roster[at]
    if (row === undefined) {
      if (entry.remove === true) return { ok: false, message: `unknown Team member "${entry.member}"; nothing was removed` }
      if (entry.name === undefined || entry.name.trim() === '') {
        const targets = roster.map(candidate => candidate.target).join(', ')
        return { ok: false, message: `unknown Team member "${entry.member}"; available members: ${targets === '' ? '(none)' : targets}` }
      }
      if (members.some(member => member.name.trim().toLowerCase() === entry.name!.trim().toLowerCase())) {
        return { ok: false, message: `Team member name "${entry.name}" is already in use` }
      }
      const createdPolicy = resolveToolPolicy(entry, { toolMode: 'all', tools: [] }, entry.name.trim())
      if ('message' in createdPolicy) return { ok: false, message: createdPolicy.message }
      const created: TeamAgentPreset = {
        name: entry.name.trim(), color: '', description: entry.description ?? '', systemPrompt: entry.systemPrompt ?? '',
        toolMode: createdPolicy.toolMode, tools: createdPolicy.tools,
        id: crypto.randomUUID(), provider: entry.provider ?? '', model: entry.model ?? '', reasoningEffort: entry.reasoningEffort ?? '',
      }
      if (created.description.length > MEMBER_DESCRIPTION_LIMIT) return { ok: false, message: `new member description exceeds ${String(MEMBER_DESCRIPTION_LIMIT)} characters` }
      if ((created.provider === '') !== (created.model === '')) return { ok: false, message: 'new member provider and model must be supplied together' }
      members.push(created)
      changed.push(`member:${created.name}.created`)
      continue
    }
    if (entry.remove === true) {
      members.splice(at, 1)
      changed.push(`member:${row.target}.removed`)
      continue
    }
    const current = members[at] ?? row.member
    const updated: TeamAgentPreset = { ...current }
    if (entry.name !== undefined && entry.name.trim() !== updated.name) {
      if (members.some((member, index) => index !== at && member.name.trim().toLowerCase() === entry.name!.trim().toLowerCase())) {
        return { ok: false, message: `Team member name "${entry.name}" is already in use` }
      }
      updated.name = entry.name.trim()
      changed.push(`member:${row.target}.name`)
    }
    if (entry.description !== undefined) {
      if (entry.description.length > MEMBER_DESCRIPTION_LIMIT) {
        return {
          ok: false,
          message: `member "${row.target}" description is ${String(entry.description.length)} characters; the teammate roster accepts at most ${String(MEMBER_DESCRIPTION_LIMIT)}`,
        }
      }
      if (entry.description !== updated.description) {
        updated.description = entry.description
        changed.push(`member:${row.target}.description`)
      }
    }
    if (entry.systemPrompt !== undefined && entry.systemPrompt !== updated.systemPrompt) {
      updated.systemPrompt = entry.systemPrompt
      changed.push(`member:${row.target}.systemPrompt`)
    }
    // A route is an ordered triple: the provider owns the model ids, and the
    // effort only means something to the adapter behind that model. So the
    // pair is resolved FIRST into the value the member would end up with, and
    // validated as a whole. Editing a route supplies whichever half it means to
    // change: naming neither inherits, naming only one keeps the stored other.
    // The stored pair is only ever replaced as a pair, so a member can never
    // hold a provider with a model that provider does not serve.
    const namedProvider = entry.provider !== undefined
    const namedModel = entry.model !== undefined
    if (namedProvider || namedModel) {
      const nextProvider = namedProvider ? (entry.provider ?? '').trim() : current.provider
      const nextModel = namedModel ? (entry.model ?? '').trim() : current.model
      // Empty both is the documented "inherit the Session route" pair; empty
      // one is a half-written route that would run on a route nobody chose.
      if ((nextProvider === '') !== (nextModel === '')) {
        return { ok: false, message: 'member provider and model must be supplied together' }
      }
      if (nextProvider !== current.provider) {
        updated.provider = nextProvider
        changed.push(`member:${row.target}.provider`)
      }
      if (nextModel !== current.model) {
        updated.model = nextModel
        changed.push(`member:${row.target}.model`)
      }
    }
    if (entry.reasoningEffort !== undefined) {
      const nextEffort = entry.reasoningEffort.trim()
      if (nextEffort !== current.reasoningEffort) {
        updated.reasoningEffort = nextEffort
        changed.push(`member:${row.target}.reasoningEffort`)
      }
    }
    // Tools are the other half of delegation: a captain that can choose a member
    // but not what it may do has not really staffed the role. The mode and the
    // list resolve TOGETHER for the same reason the route does — a custom mode
    // with no names silently means "no tools at all".
    const storedMode = current.toolMode ?? (current.tools.length === 0 ? 'all' : 'custom')
    if (entry.toolMode !== undefined || entry.tools !== undefined) {
      const nextPolicy = resolveToolPolicy(entry, { toolMode: storedMode, tools: current.tools }, row.target)
      if ('message' in nextPolicy) return { ok: false, message: nextPolicy.message }
      if (nextPolicy.toolMode !== storedMode) {
        updated.toolMode = nextPolicy.toolMode
        changed.push(`member:${row.target}.toolMode`)
      }
      if (nextPolicy.tools.join('\u0000') !== current.tools.join('\u0000')) {
        updated.tools = nextPolicy.tools
        changed.push(`member:${row.target}.tools`)
      }
    }
    // Every replacement above is recorded in `changed`, so "something changed"
    // is exactly "this entry produced a path". Comparing the fields one by one
    // is what silently dropped an edited route: the old condition named two
    // fields, so a route-only edit updated the copy and then never stored it.
    if (
      updated.name !== current.name
      || updated.description !== current.description
      || updated.systemPrompt !== current.systemPrompt
      || updated.provider !== current.provider
      || updated.model !== current.model
      || updated.reasoningEffort !== current.reasoningEffort
      || (updated.toolMode ?? storedMode) !== storedMode
      || updated.tools.join('\u0000') !== current.tools.join('\u0000')
    ) {
      members[at] = updated
    }
  }

  return { ok: true, team: { ...team, description, captain, members }, changed }
}

/**
 * The exact `{{name}}` group grammar `@deepseek-ai/dsh-system-prompt` interpolates.
 * A `{{` without this shape is literal prose unless a later `}}` makes it malformed.
 */
const VARIABLE_GROUP = /^\{\{([^{}]*)\}\}/

/** The exact variable-name grammar the prompt registry accepts. */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/

/**
 * Report the first interpolation failure one candidate prompt text would cause.
 *
 * A Team prompt is registered as an interpolated prompt section (the captain's
 * as the Session persona prefix, a member's as that teammate's persona), so a
 * group that cannot resolve does not degrade the prompt — it fails the next
 * request outright. A stored prompt is never revalidated before that request,
 * which is why a preset write refuses one instead of persisting it while a
 * Session is running. The scan mirrors the registry's own so the two agree.
 * @param text - the candidate captain or member standing prompt.
 * @param variables - the variables one assembly resolved for the calling Agent.
 * @returns the failure text, or undefined when the text interpolates cleanly.
 */
export function promptTemplateFailure(
  text: string,
  variables: Readonly<Record<string, string | undefined>>,
): string | undefined {
  let last = 0
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const group = VARIABLE_GROUP.exec(text.slice(open))
    if (group === null) {
      if (text.indexOf('}}', open + 2) >= 0) {
        return `malformed prompt variable reference at "${text.slice(open, open + 16)}…": references are complete simple {{name}} groups`
      }
      last = open + 2
      continue
    }
    const name = group[1] ?? ''
    if (!VARIABLE_NAME.test(name)) {
      return `malformed prompt variable reference "{{${name}}}": variable names match ${String(VARIABLE_NAME)}`
    }
    if (!Object.hasOwn(variables, name)) {
      const known = Object.keys(variables)
      return `unknown prompt variable "{{${name}}}"; registered variables: ${known.length > 0 ? known.join(', ') : '(none)'}`
    }
    if (variables[name] === undefined) {
      return `prompt variable "{{${name}}}" has no value for this Session`
    }
    last = open + group[0].length
  }
  return undefined
}
