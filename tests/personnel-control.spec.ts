/**
 * Contracts for the captain's roster authority.
 *
 * The Team flag `personnelControl` authorises the captain to add, re-route,
 * re-prompt, rename, and remove roster members, and the edit lands on the shared
 * preset the whole Team runs. These tests pin the two properties that were
 * actually wrong in the field: a route field edit must be *stored* (not merely
 * computed and dropped), and a route must be validated as the pair the member
 * will end up with rather than as the arguments one call happens to spell.
 */
import { describe, expect, it } from 'vitest'
import { memberRecordSchema } from '../src/member-store.ts'
import { routeRefusal } from '../src/delegation.ts'
import { editTeamPreset } from '../src/preset-editor.ts'
import { slot, team } from './fixtures/team-presets.ts'
import type { MemberRecord } from '../src/member-store.ts'

const validRecord: MemberRecord = {
  schemaVersion: 1,
  intentId: 'intent-1',
  rootSessionId: 'lead-session',
  memberName: 'reviewer',
  teamId: 'team-1',
  roleId: 'reviewer-role',
  displayName: 'Reviewer',
  roleDescription: 'Reviews changes',
  persona: 'You review changes.',
  teamSection: 'Team context',
  roster: [{ target: 'reviewer', display: 'Reviewer', description: 'Reviews changes' }],
  route: { provider: 'fixture', model: 'model-a', reasoningEffort: 'high' },
  policy: { mode: 'custom', allow: ['read'] },
  spawnContext: 'fresh',
  lifecycle: 'intent',
  updatedAt: 1,
}

/** A Team with one fully routed member, control on, at the given revision. */
function controlledTeam(): ReturnType<typeof team> {
  const preset = team([slot({ name: 'reviewer', provider: 'fixture', model: 'model-a', reasoningEffort: 'high' })])
  return { ...preset, personnelControl: true }
}

describe('personnel control authorisation', () => {
  it('defaults personnel control off and keeps it outside the captain route', () => {
    const preset = team([slot({ name: 'reviewer' })])
    expect(preset.personnelControl).toBeUndefined()
    expect(preset.captain).not.toHaveProperty('provider')
    expect(preset.captain).not.toHaveProperty('model')
    expect(preset.captain).not.toHaveProperty('reasoningEffort')
  })

  it('refuses every roster edit while the flag is off, including a pure route change', () => {
    const preset = team([slot({ name: 'reviewer', provider: 'fixture', model: 'model-a' })])
    const refused = editTeamPreset(preset, { personnelControl: false, members: [{ member: 'reviewer', model: 'model-b' }] })
    expect(refused.ok).toBe(false)
    expect(refused).toMatchObject({ message: expect.stringMatching(/personnelControl is disabled/) })
  })

  it('leaves the Team purpose editable while the flag is off', () => {
    const preset = team([slot({ name: 'reviewer' })])
    const applied = editTeamPreset(preset, { personnelControl: false, description: 'New purpose' })
    expect(applied.ok).toBe(true)
    expect(applied.ok && applied.team.description).toBe('New purpose')
  })
})

describe('roster route edits are stored, not just computed', () => {
  it('stores a reasoning-effort change and reports the path', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'reviewer', reasoningEffort: 'low' }],
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.team.members[0]?.reasoningEffort).toBe('low')
    expect(applied.changed).toContain('member:reviewer.reasoningEffort')
  })

  it('stores a model change that names only the model, keeping the stored provider', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'reviewer', model: 'model-b' }],
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.team.members[0]?.model).toBe('model-b')
    expect(applied.team.members[0]?.provider).toBe('fixture')
    expect(applied.changed).toContain('member:reviewer.model')
  })

  it('stores a provider change that names only the provider, keeping the stored model', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'reviewer', provider: 'other' }],
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.team.members[0]?.provider).toBe('other')
    expect(applied.team.members[0]?.model).toBe('model-a')
    expect(applied.changed).toContain('member:reviewer.provider')
  })

  it('reports no change when an edit restates the stored route', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'reviewer', provider: 'fixture', model: 'model-a', reasoningEffort: 'high' }],
    })
    expect(applied.ok).toBe(true)
    expect(applied.ok && applied.changed).toEqual([])
  })

  it('drops both route halves together when an edit clears the pair to inherit', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'reviewer', provider: '', model: '' }],
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.team.members[0]?.provider).toBe('')
    expect(applied.team.members[0]?.model).toBe('')
    expect(applied.changed).toEqual(expect.arrayContaining(['member:reviewer.provider', 'member:reviewer.model']))
  })

  it('refuses a half-written route that would run on a route nobody chose', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'reviewer', provider: '' }],
    })
    expect(applied.ok).toBe(false)
    expect(applied).toMatchObject({ message: expect.stringMatching(/supplied together/) })
  })
})

describe('roster membership lifecycle', () => {
  it('creates a member with the supplied route and effort', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'probe', name: 'probe', description: 'Probe', provider: 'fixture', model: 'model-a', reasoningEffort: 'high' }],
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.team.members.map(member => member.name)).toContain('probe')
    expect(applied.changed).toContain('member:probe.created')
    const created = applied.team.members.find(member => member.name === 'probe')
    expect(created).toMatchObject({ provider: 'fixture', model: 'model-a', reasoningEffort: 'high' })
  })

  it('removes a member without touching the others', () => {
    const preset = team([slot({ name: 'reviewer' }), slot({ name: 'probe' })])
    const applied = editTeamPreset({ ...preset, personnelControl: true }, {
      personnelControl: true,
      members: [{ member: 'probe', remove: true }],
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.team.members.map(member => member.name)).toEqual(['reviewer'])
    expect(applied.changed).toEqual(['member:probe.removed'])
  })

  it('refuses to remove a name the roster does not hold', () => {
    const applied = editTeamPreset(controlledTeam(), {
      personnelControl: true,
      members: [{ member: 'ghost', remove: true }],
    })
    expect(applied.ok).toBe(false)
    expect(applied).toMatchObject({ message: expect.stringMatching(/unknown Team member/) })
  })

  it('refuses a duplicate name', () => {
    const preset = team([slot({ name: 'reviewer' }), slot({ name: 'probe' })])
    const applied = editTeamPreset({ ...preset, personnelControl: true }, {
      personnelControl: true,
      members: [{ member: 'probe', name: 'reviewer' }],
    })
    expect(applied.ok).toBe(false)
    expect(applied).toMatchObject({ message: expect.stringMatching(/already in use/) })
  })
})

describe('route preflight and durable snapshots', () => {
  it('keeps a durable member snapshot capable of carrying route, effort, roster, and policy', () => {
    const parsed = memberRecordSchema.parse(validRecord)
    expect(parsed.route).toEqual({ provider: 'fixture', model: 'model-a', reasoningEffort: 'high' })
    expect(parsed.roster).toEqual(validRecord.roster)
    expect(parsed.policy).toEqual({ mode: 'custom', allow: ['read'] })
    expect(parsed.lifecycle).toBe('intent')
  })

  it('rejects a configured route before creation when no provider is registered', async () => {
    const ctx = { get: () => ({ listProviders: () => [] }) } as never
    await expect(routeRefusal(ctx, { provider: 'missing', model: 'model-a', reasoningEffort: 'high' }))
      .resolves.toMatch(/provider.*not register/i)
  })

  it('does not claim the roster model as execution evidence', () => {
    const configured = { provider: 'fixture', model: 'model-a', reasoningEffort: 'high' }
    const roster = { name: 'reviewer', model: 'lead-model', status: 'active' }
    expect(configured.model).not.toBe(roster.model)
  })
})
