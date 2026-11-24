/** Delegation decisions use durable identity and normal tool dispatch. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { subagentCatalogProjectionDefinition } from '@deepseek-ai/dsh-subagent/src/catalog.ts'
import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { applyTeamToAgent } from '../src/application.ts'
import { MemberRuntime } from '../src/member-runtime.ts'
import { memberRecordKey } from '../src/member-store.ts'
import type { MemberRecord } from '../src/member-store.ts'
import { memberBriefing, memberTeamDivision } from '../src/presets.ts'
import { slot, team } from './fixtures/team-presets.ts'
import { subagentServiceDouble } from './fixtures/plugin-harness.ts'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function setup(options: { existing?: boolean; name?: string; otherRole?: boolean } = {}) {
  const ctx = new Context()
  await mountAgentLoopTestDependencies(ctx)
  await ctx.sessionProjections.register(subagentCatalogProjectionDefinition)
  const harness = await mountAgentLoopTestHarness(ctx)
  const root = await harness.create(SessionId('reuse-root'), {})
  const role = slot({ id: 'role-executor', name: options.name ?? 'executor', provider: '', model: '', reasoningEffort: '', toolMode: 'all', tools: [] })
  let current = team([role, ...options.otherRole ? [slot({ id: 'other-role', name: 'executor-2', provider: '', model: '' })] : []])
  const table = new Map<string, MemberRecord>()
  ctx.provide('storageDomain', {
    open: async () => ({ table: () => ({
      get: (key: string) => table.get(key), entries: () => table.entries(),
      put: async (key: string, record: MemberRecord) => { table.set(key, record) },
    }), close: async () => {} }),
  } as unknown as DomainFacility)
  const runtime = new MemberRuntime(ctx)
  await runtime.whenReady()
  const startActivation = vi.fn(async (spec: { childId: string; name: string }) => {
    root.session.append('subagent/catalog', { version: 3, childId: spec.childId, childCreatedAt: 0, mode: 'continuable', label: 'task', name: spec.name })
    return { childId: spec.childId, name: spec.name, result: Promise.resolve({ output: [], stopReason: 'completed' }), dispose: async () => {} }
  })
  const subagents = { ...subagentServiceDouble(), startActivation }
  ctx.provide('subagents', subagents)
  const record = (overrides: Partial<MemberRecord> = {}): MemberRecord => ({
    schemaVersion: 1, intentId: 'existing-intent', rootSessionId: root.id,
    memberName: role.name, childSessionId: 'existing-child', teamId: current.id, roleId: role.id,
    displayName: role.name, roleDescription: role.description,
    persona: memberBriefing(current, role, role.name), teamSection: memberTeamDivision(current, role.name),
    roster: [], policy: { mode: 'all', allow: [] }, spawnContext: 'fresh', lifecycle: 'bound', updatedAt: 0,
    ...overrides,
  })
  function seed(value = record(), publish = true) {
    table.set(memberRecordKey(root.id, value.memberName), value)
    if (publish) root.session.append('subagent/catalog', {
      version: 3, childId: value.childSessionId!, childCreatedAt: 0, mode: 'continuable', label: 'existing work', name: value.memberName,
    })
  }
  if (options.existing) seed()
  let application = applyTeamToAgent(ctx, root, current, { fresh: 'fixture-fresh', fork: 'fixture-fork' }, () => current, runtime)
  function replace(next = current) {
    application.dispose()
    current = next
    application = applyTeamToAgent(ctx, root, current, { fresh: 'fixture-fresh', fork: 'fixture-fork' }, () => current, runtime)
  }
  cleanups.push(async () => { application.dispose(); await runtime.disposeActivations(); await runtime.close(); await ctx.fiber.dispose() })
  async function call(name: string, args: object = {}) {
    const batch = await ctx.tools.execute({
      calls: [{ type: 'tool-call', id: ToolCallId('reuse-call'), name, arguments: JSON.stringify(args) }],
      agent: root, signal: new AbortController().signal,
    })
    const result = batch.results[0]!.result
    const text = result.content.filter(block => block.type === 'text').map(block => block.text).join('')
    expect(result.isError, text).toBe(false)
    return JSON.parse(text)
  }
  const spawn = (args: object = {}) => call('spawn_team_member', { member: role.name, task: 'continue work', ...args })
  return { ctx, root, role, table, runtime, record, seed, replace, call, spawn, startActivation, subagents, get current() { return current } }
}

describe('model-visible reuse decisions', () => {
  it('creates the first instance with the established success shape', async () => {
    const h = await setup()
    expect(await h.spawn()).toEqual({ status: 'active', target: 'executor' })
    expect(h.startActivation).toHaveBeenCalledOnce()
  })

  it('returns related-work candidates and instructions without creating an instance', async () => {
    const h = await setup({ existing: true })
    const result = await h.spawn()
    expect(result.status).toBe('reuse-required')
    expect(result.message).toContain('send_message')
    expect(result.message).toContain('creation_reason')
    expect(result.candidates).toEqual([expect.objectContaining({ target: 'executor', roleId: 'role-executor', compatibility: 'matching', continuation: 'unchecked' })])
    expect(h.startActivation).not.toHaveBeenCalled()
  })

  it('requires an explicit reason for independent work and echoes it in the result', async () => {
    const h = await setup({ existing: true })
    expect(await h.spawn({ creation_reason: 'Independent review with an isolated context' })).toMatchObject({
      status: 'active', target: 'executor-2', creationReason: 'Independent review with an isolated context',
    })
    expect((await h.spawn({ creation_reason: '   ' })).status).toBe('reuse-required')
    expect(h.startActivation).toHaveBeenCalledOnce()
  })

  it('exposes the reuse decision even when new creation is disabled by depth', async () => {
    const h = await setup({ existing: true })
    h.subagents.resolveMaxDepth = () => 0
    expect((await h.spawn()).status).toBe('reuse-required')
    expect(h.startActivation).not.toHaveBeenCalled()
  })

  it('serializes concurrent no-reason decisions before either snapshot is published', async () => {
    const h = await setup()
    const results = await Promise.all([h.spawn(), h.spawn()])
    expect(results.map(result => result.status).sort()).toEqual(['active', 'reuse-required'])
    expect(h.startActivation).toHaveBeenCalledOnce()
  })

  it('allows explicitly justified parallel creation with distinct names', async () => {
    const h = await setup()
    const results = await Promise.all([h.spawn({ creation_reason: 'Parallel slice A' }), h.spawn({ creation_reason: 'Parallel slice B' })])
    expect(results.map(result => result.target).sort()).toEqual(['executor', 'executor-2'])
  })

  it('protects other role-template names from instance suffix allocation', async () => {
    const h = await setup({ existing: true, otherRole: true })
    expect(await h.spawn({ creation_reason: 'Parallel implementation slice' })).toMatchObject({ target: 'executor-3' })
    expect(await h.spawn({ member: 'executor-2' })).toMatchObject({ target: 'executor-2' })
  })

  it('keeps identity and model-visible differences when the role changes', async () => {
    const h = await setup({ existing: true })
    h.replace({ ...h.current, members: [{ ...h.role, name: 'developer', systemPrompt: 'new instructions', toolMode: 'custom', tools: ['list_team_members'] }] })
    const result = await h.call('list_team_members')
    expect(result.members[0]).toMatchObject({ target: 'executor', roleId: 'role-executor', roleTarget: 'developer', compatibility: 'changed', toolMode: 'all' })
    expect(result.members[0].differences).toEqual(expect.arrayContaining(['persona', 'tools']))
    expect((await h.spawn({ member: 'developer' })).status).toBe('reuse-required')
  })

  it('reports prior-Team members without attributing them to a same-named new role', async () => {
    const h = await setup({ existing: true })
    h.replace({ ...h.current, id: 'different-team' })
    expect((await h.call('list_team_members')).members[0]).toMatchObject({ compatibility: 'other-team', differences: ['team'] })
    expect(await h.spawn()).toMatchObject({ status: 'active', target: 'executor-2' })
  })

  it('does not mistake a suffix for another role identity', async () => {
    const h = await setup({ otherRole: true })
    h.seed(h.record({ memberName: 'executor-2', persona: memberBriefing(h.current, h.role, 'executor-2'), teamSection: memberTeamDivision(h.current, 'executor-2') }))
    expect((await h.call('list_team_members')).members[0]).toMatchObject({ target: 'executor-2', roleTarget: 'executor', compatibility: 'matching' })
  })

  it('shows failed unpublished attempts as unavailable and permits justified replacement', async () => {
    const h = await setup()
    h.seed(h.record({ lifecycle: 'failed' }), false)
    const result = await h.spawn()
    expect(result.candidates[0]).toMatchObject({ activity: 'unavailable', continuation: 'unavailable', snapshot: 'failed' })
    expect(await h.spawn({ creation_reason: 'Confirmed missing continuation, replace failed member' })).toMatchObject({ status: 'active', target: 'executor-2' })
  })

  it('reports mismatched child identity without declaring it resumable', async () => {
    const h = await setup({ existing: true })
    h.table.set(memberRecordKey(h.root.id, 'executor'), h.record({ childSessionId: 'different-child' }))
    expect((await h.call('list_team_members')).members[0]).toMatchObject({ snapshot: 'mismatch', continuation: 'unavailable' })
  })

  it('retains unique-name legacy identity while rejecting ambiguity', async () => {
    const h = await setup()
    const { roleId: _roleId, ...legacy } = h.record()
    h.seed(legacy)
    expect((await h.call('list_team_members')).members[0]).toMatchObject({ roleTarget: 'executor', compatibility: 'matching' })
    h.replace({ ...h.current, members: [h.role, { ...h.role, id: 'other-id' }] })
    expect((await h.call('list_team_members')).members[0]).toMatchObject({ compatibility: 'role-unavailable' })
  })

  it.each(['', '   '])('treats an empty optional reason as absent for the first instance (%j)', async creation_reason => {
    const h = await setup()
    expect(await h.spawn({ creation_reason })).toEqual({ status: 'active', target: 'executor' })
  })

  it('keeps a legacy unbound intent eligible for descriptor-based recovery', async () => {
    const h = await setup({ existing: true })
    const { childSessionId: _child, ...unbound } = h.record({ lifecycle: 'intent' })
    h.table.set(memberRecordKey(h.root.id, 'executor'), unbound)
    expect((await h.call('list_team_members')).members[0]).toMatchObject({ snapshot: 'available', continuation: 'unchecked' })
  })

  it('classifies missing snapshots without assigning a role from a child name', async () => {
    const h = await setup({ existing: true })
    h.table.clear()
    expect((await h.call('list_team_members')).members[0]).toMatchObject({
      management: 'unclassified', snapshot: 'missing', compatibility: 'unknown', continuation: 'unchecked', routeMode: 'unknown',
    })
  })

  it('labels an inherited creation route without claiming the actual model', async () => {
    const h = await setup({ existing: true })
    const result = (await h.call('list_team_members')).members[0]
    expect(result.routeMode).toBe('inherited-at-creation')
    expect(result.configuredRoute).toBeUndefined()
  })

  it('publishes the policy and reason parameter for any model to discover', async () => {
    const h = await setup()
    const schemas = h.ctx.tools.schemas(h.root)
    const spawn = schemas.find(schema => schema.name === 'spawn_team_member')!
    expect(spawn.description).toContain('list_team_members')
    expect(spawn.description).toContain('reuse-required')
    expect(JSON.stringify(spawn)).toContain('creation_reason')
    expect(schemas.some(schema => schema.name === 'list_team_members')).toBe(true)
  })
})
