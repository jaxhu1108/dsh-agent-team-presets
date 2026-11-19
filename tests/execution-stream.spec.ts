/**
 * The Team execution stream: the state the settings page promises against.
 *
 * The monitor is driven here through its own invalidate edges, so the frames
 * under test are the state transitions themselves rather than the plugin's
 * event wiring (which the freeze suite covers).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { reserveMember } from '../src/team-runtime.ts'
import { TeamId } from '@deepseek-ai/dsh-agent-team'
import type { TeamMemberView } from '@deepseek-ai/dsh-agent-team'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { TeamExecutionMonitor } from '../src/execution.ts'
import { definitionFingerprint } from '../src/presets.ts'
import TeamPresetsToolCatalog from '../src/tool-catalog.ts'
import type { Config } from '../src/config.ts'
import type { TeamExecutionSnapshot, TeamPreset, TeamSelectionRecord } from '../src/types.ts'
import { BUILTIN_TEAM_IDS } from '../src/builtin-teams.ts'
import { slot, team } from './fixtures/team-presets.ts'

const contexts: Context[] = []

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})

/** One Team definition the stream reports on. */
const TEAM_A: TeamPreset = { ...team([slot({ name: 'alpha' })]), name: 'Alpha' }

/** The definition that replaced it while the page was open. */
const TEAM_B: TeamPreset = { ...TEAM_A, captain: { ...TEAM_A.captain, systemPrompt: 'Captain prompt B' } }

/** One Team selected by one Session. */
const SELECTED: readonly TeamSelectionRecord[] = [{ sessionId: 's1', teamId: 'team-1' }]

/** A model route that blocks until the test releases it, so an Agent stays running. */
class GatedAdapter extends LlmAdapter {
  private gates: (() => void)[] = []
  private opened = false

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return Promise.resolve({ provider, id: model, name: model })
  }

  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (!this.opened) await new Promise<void>((resolve) => { this.gates.push(resolve) })
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'done' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'done' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }

  /** Let every blocked model call finish, and every later one proceed. */
  open(): void {
    this.opened = true
    const gates = this.gates
    this.gates = []
    for (const gate of gates) gate()
  }
}

/** Writable stand-in for one volatile Config reference. */
function volatileRef<T>(initial: T): { ref: { get: () => T }; set: (next: T) => void } {
  let current = initial
  return { ref: { get: () => current }, set: (next) => { current = next } }
}

/** One scripted roster row for a teammate of a Session. */
function teammate(status: TeamMemberView['status']): TeamMemberView {
  return { id: SessionId('member-1'), name: 'member-1', role: 'teammate', status, diagnostics: [] }
}

interface Harness {
  readonly ctx: Context
  readonly config: Config
  readonly monitor: TeamExecutionMonitor
  readonly adapter: GatedAdapter
  /** Record the Team one Session has applied, as the plugin runtime does. */
  readonly apply: (agent: Agent, definition: TeamPreset) => void
  /** Replace the roster rows one Session's fake Team service reports. */
  readonly teammates: (sessionId: string, rows: readonly TeamMemberView[]) => void
  /** Make one Session's roster unreadable, as a malformed durable stream does. */
  readonly unreadable: (sessionId: string, unreadable: boolean) => void
  /** Create one live Session-root Agent. */
  readonly create: (id: string) => Promise<Agent>
  /** Wake one Agent into a turn that stays running until {@link release}. */
  readonly wake: (agent: Agent) => void
  /** Let every blocked turn finish and wait for the Agents to settle idle. */
  readonly release: () => Promise<void>
}

/** Mount the loop, a scripted Team service, and one monitor over them. */
async function setup(options: {
  teams: readonly TeamPreset[]
  selections: readonly TeamSelectionRecord[]
}): Promise<Harness> {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const adapter = new GatedAdapter()
  ctx.llm.registerAdapter(['fixture'], adapter)

  const roots = new Set<Agent>()
  const unreadable = new Set<string>()
  const rows = new Map<string, readonly TeamMemberView[]>()
  const reservations = new Map<string, (() => void)[]>()
  // rc.3 has no Team roster. Member rows are served through the two seams the
  // plugin actually reads: the `subagentCatalog` projection for durable rows and
  // the live Agent registry for execution state. `unreadable` makes the
  // projection throw, which is what a malformed durable stream does.
  const snapshot = ctx.sessionProjections.snapshot.bind(ctx.sessionProjections)
  vi.spyOn(ctx.sessionProjections, 'snapshot').mockImplementation((session, keys) => {
    if (unreadable.has(session.id)) throw new Error('fixture roster is unreadable')
    const result = snapshot(session, keys)
    const extra = rows.get(session.id)
    if (extra === undefined) return result
    return {
      ...result,
      values: {
        ...result.values,
        subagentCatalog: extra.map((row, index) => ({ id: SessionId(`member-${String(index)}`), name: row.name, mode: 'continuable', provider: 'spawn', createdAt: 0 })),
      },
    } as typeof result
  })

  const teamsRef = volatileRef(options.teams)
  const selectionsRef = volatileRef(options.selections)
  const config = {
    teams: teamsRef.ref,
    selections: selectionsRef.ref,
    freshProvider: 'spawn',
    seededDefaults: { get: () => [...BUILTIN_TEAM_IDS] },
    forkProvider: 'fork',
  } satisfies Config
  const applied = new Map<Agent, { teamId: string; fingerprint: string }>()
  const monitor = new TeamExecutionMonitor(ctx, { config, applied: agent => applied.get(agent) })

  const agents: Agent[] = []
  return {
    ctx,
    config,
    monitor,
    adapter,
    apply: (agent, definition) => {
      // The freezer records the definition fingerprint, exactly as the plugin does.
      applied.set(agent, { teamId: definition.id, fingerprint: definitionFingerprint(definition) })
    },
    teammates: (sessionId, next) => {
      rows.set(sessionId, next)
      // `provisioning` is exactly the admitted-but-unpublished window the plugin
      // reserves itself, so the scripted rows are projected through it.
      const root = agents.find(agent => agent.session.id === sessionId)
      for (const row of reservations.get(sessionId) ?? []) row()
      reservations.delete(sessionId)
      if (root === undefined) return
      // `provisioning` is the admitted-but-unpublished window the plugin reserves
      // itself. A `running` row with no live child is only a durable catalog row,
      // so it is projected as such and stays inactive until a child exists.
      reservations.set(sessionId, (next ?? [])
        .filter(row => row.status === 'provisioning')
        .map((row, index) => reserveMember(root, SessionId(`reserved-${String(index)}`), row.name)))
    },
    unreadable: (sessionId, next) => {
      if (next) unreadable.add(sessionId)
      else unreadable.delete(sessionId)
    },
    create: async (id) => {
      const handle = await ctx.agents.create({
        sessionId: SessionId(id),
        agentOptions: { provider: 'fixture', model: 'fixture' },
      })
      roots.add(handle.agent)
      agents.push(handle.agent)
      return handle.agent
    },
    wake: (agent) => {
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'work' }], source: { kind: 'user' } }))
    },
    release: async () => {
      adapter.open()
      for (const agent of agents) await agent.whenIdle()
    },
  }
}

/** Await one frame, failing the case rather than hanging when none arrives. */
async function nextFrame(iterator: AsyncIterator<TeamExecutionSnapshot>): Promise<TeamExecutionSnapshot> {
  const outcome = await Promise.race([
    iterator.next(),
    new Promise<'timeout'>((resolve) => { setTimeout(() => { resolve('timeout') }, 1000) }),
  ])
  if (outcome === 'timeout') throw new Error('the execution stream produced no frame')
  if (outcome.done === true) throw new Error('the execution stream ended unexpectedly')
  return outcome.value
}

/** Let queued microtasks (the monitor's coalesced frame) run. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
}

describe('Team execution stream', () => {
  it('opens with the current state and reports a captain-run Team as busy', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()

    expect((await nextFrame(iterator)).teams).toEqual([
      { teamId: 'team-1', state: 'idle', busySessions: 0, executingMembers: 0, pendingSessions: 0, notes: [] },
    ])

    h.wake(captain)
    h.monitor.invalidate()
    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'busy', busySessions: 1 })

    await h.release()
    h.monitor.invalidate()
    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'idle', busySessions: 0 })
    controller.abort()
  })

  it('reports a provisioning teammate until the durable settlement lands', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    // A teammate with no live child has no status of its own: only the roster
    // knows it is still provisioning.
    h.teammates('s1', [teammate('provisioning')])
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()

    expect((await nextFrame(iterator)).teams[0]).toMatchObject({
      state: 'busy', busySessions: 1, executingMembers: 1,
    })

    h.teammates('s1', [teammate('failed')])
    h.monitor.invalidate()
    expect((await nextFrame(iterator)).teams[0]).toMatchObject({
      state: 'idle', busySessions: 0, executingMembers: 0,
    })
    controller.abort()
  })

  it('reports unknown when a Session roster cannot be read, and never as idle', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()
    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'idle' })

    h.unreadable('s1', true)
    h.monitor.invalidate()
    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'unknown' })

    // A Session known to be busy still reports busy, even while its roster is
    // the very thing that cannot be read.
    h.wake(captain)
    h.monitor.invalidate()
    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'busy', busySessions: 1 })
    await h.release()
    controller.abort()
  })

  it('does not report a Session as pending for a route or a color it reads live', async () => {
    // A member route is read at spawn time and an accent color when the roster
    // draws, so a page save that only moves them leaves the next task nothing
    // to adopt — the page must not promise otherwise.
    const [alpha] = TEAM_A.members
    if (alpha === undefined) throw new Error('the fixture Team declares no member')
    const restyled: TeamPreset = {
      ...TEAM_A,
      captain: { ...TEAM_A.captain, color: '#123456' },
      members: [{ ...alpha, color: '#654321', provider: 'deepseek', model: 'deepseek-chat' }],
    }
    const h = await setup({ teams: [restyled], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()

    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'idle', pendingSessions: 0 })
    controller.abort()
  })

  it('reports the Sessions still running an older definition as pending', async () => {
    const h = await setup({ teams: [TEAM_B], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()

    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'idle', pendingSessions: 1 })
    controller.abort()
  })

  it('reports a Session running an applied definition its selection no longer names', async () => {
    // The selection can move on while a Session keeps running the definition it
    // had applied: the applied Team is what executes, so an empty selection
    // must still report that Team, and report it busy while the run continues.
    const h = await setup({ teams: [TEAM_A], selections: [] })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()

    const opening = await nextFrame(iterator)
    expect(opening.teams).toHaveLength(1)
    expect(opening.teams[0]).toMatchObject({ teamId: 'team-1', state: 'idle', pendingSessions: 1 })

    h.wake(captain)
    h.monitor.invalidate()
    const running = await nextFrame(iterator)
    expect(running.teams).toHaveLength(1)
    expect(running.teams[0]).toMatchObject({ teamId: 'team-1', state: 'busy', busySessions: 1 })

    await h.release()
    controller.abort()
  })

  it('does not repeat an unchanged frame', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()
    await nextFrame(iterator)

    // An unchanged state queues nothing: the next frame the stream delivers is
    // the transition itself, not a duplicate of the opening one.
    h.monitor.invalidate()
    await flush()
    h.wake(captain)
    h.monitor.invalidate()
    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ state: 'busy' })
    await h.release()
    controller.abort()
  })

  it('coalesces thousands of unread states to only the latest snapshot', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()
    await nextFrame(iterator)
    for (let count = 1; count <= 2000; count++) {
      // Provisioning rows keep each invalidate observably busy, which is what
      // makes this a coalescing test rather than an idle-state no-op.
      h.teammates('s1', Array.from({ length: count % 5 + 1 }, () => teammate('provisioning')))
      h.monitor.invalidate()
      await Promise.resolve()
    }
    expect((await nextFrame(iterator)).teams[0]?.executingMembers).toBeGreaterThan(0)
    controller.abort()
    expect((await iterator.next()).done).toBe(true)
  })

  it('ends the stream on abort and releases its subscriber on dispose', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const controller = new AbortController()
    const iterator = h.monitor.stream(controller.signal)[Symbol.asyncIterator]()
    await nextFrame(iterator)

    controller.abort()
    expect((await iterator.next()).done).toBe(true)

    const disposed = new AbortController()
    const second = h.monitor.stream(disposed.signal)[Symbol.asyncIterator]()
    await nextFrame(second)
    h.monitor.dispose()
    expect((await second.next()).done).toBe(true)
    // A disposed monitor publishes nothing, even for a later invalidation.
    h.monitor.invalidate()
    await flush()
  })
})

describe('Team execution Remote method', () => {
  it('delegates the stream to the monitor the preset runtime owns', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const captain = await h.create('s1')
    h.apply(captain, TEAM_A)
    const catalog = new TeamPresetsToolCatalog(h.ctx, { monitor: h.monitor })
    const controller = new AbortController()
    const iterator = catalog.execution(controller.signal)[Symbol.asyncIterator]()

    expect((await nextFrame(iterator)).teams[0]).toMatchObject({ teamId: 'team-1', state: 'idle' })
    controller.abort()
  })

  it('reports an empty board when no monitor is mounted', async () => {
    const h = await setup({ teams: [TEAM_A], selections: SELECTED })
    const catalog = new TeamPresetsToolCatalog(h.ctx)
    const frames = []
    for await (const frame of catalog.execution(new AbortController().signal)) frames.push(frame)
    expect(frames).toEqual([{ teams: [] }])
  })
})
