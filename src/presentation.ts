/**
 * Tool-presentation preparation for one Team application.
 *
 * A tool executor is declared per scope through `tools.setExecutor()`: an
 * official Agent preset either mounts the native executor or the PTC one, and a
 * strict custom Team policy has to reach the tools it allows. The shipped Node
 * PTC transport can import `fs`/`child_process` outside the tool SDK, so a
 * custom Team is only ever applied with a native executor of its own.
 *
 * That decision is made here through public APIs only: the effective wire is
 * read with `systemPrompt.assemble()`, and a native executor is declared and
 * then released as a probe rather than assumed. The three outcomes are kept
 * apart, because they need different answers — an already-native surface needs
 * nothing, an ancestor PTC surface is shadowed by our own Agent-scoped
 * declaration, and a transport an exact-Agent scope already declared cannot be
 * replaced, so the application is refused instead of silently running a surface
 * the policy cannot govern.
 *
 * @module dsh-agent-team-presets/presentation
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
import { assembleContextFor } from '@deepseek-ai/dsh-agent'
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import { PERSONA_PREFIX_SECTION } from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'

/** One read of the model-visible prompt surface of an Agent. */
export interface WireSnapshot {
  /** Effective prompt sections, in assembly order. */
  readonly sections: readonly { readonly name: string; readonly text: string }[]
  /** Names of the tools this Agent's model would actually see. */
  readonly tools: readonly string[]
}

/**
 * Read the effective prompt and tool surface of one Agent.
 *
 * This is the final wire the model receives: restricted, shadowed, and with an
 * active complete section already reduced to the sole section. It is the only
 * authority used here — no private presentation state is inspected.
 * @param agent - the live Agent whose next request is being shaped.
 * @returns the snapshot, or undefined when assembly itself failed.
 */
export async function readWire(agent: Agent): Promise<WireSnapshot | undefined> {
  try {
    const assembly = await agent.ctx.systemPrompt.assemble(assembleContextFor(agent))
    return {
      sections: assembly.sections.map(section => ({ name: section.name, text: section.text })),
      tools: assembly.tools.map(tool => tool.name),
    }
  } catch {
    return undefined
  }
}

/** How a custom Team policy's native presentation can be established. */
export type NativePresentation =
  /**
   * The effective surface is already native: no declaration is needed, and the
   * policy's allow-list governs it as it stands.
   */
  | { readonly kind: 'already-native' }
  /**
   * A PTC or both presentation was in effect and this plugin can shadow it at
   * the Agent's own scope. The caller must install the native declaration and
   * discloses the override with {@link PTC_OVERRIDDEN_DISCLOSURE}.
   */
  | { readonly kind: 'installable'; readonly disclosure: string }
  /**
   * The effective surface exposes the PTC transport and an exact-Agent
   * declaration cannot be replaced, so a custom policy cannot govern it.
   */
  | { readonly kind: 'conflict'; readonly reason: string }
  /** The effective surface could not be read, so nothing can be promised about it. */
  | { readonly kind: 'unknown'; readonly reason: string }

/**
 * Disclosure the settings page renders when a custom Team policy replaced a PTC
 * presentation.
 *
 * A locale key, not prose: the Host never guesses the reader's language, and the
 * browser bundle carries the copy in both locales.
 */
export const PTC_OVERRIDDEN_DISCLOSURE = 'presentation.ptcOverridden'

/**
 * Decide how a custom policy's native presentation can be established.
 *
 * The read of the wire happens before any declaration is attempted, and the
 * probe declaration is released immediately, so the caller's real registration
 * is the only one in effect and is never blocked by this probe. Releasing is
 * sufficient because the executor slot rejects only a LIVE competing
 * declaration: once the probe's disposer runs, the scope accepts the caller's
 * own.
 * @param agent - the Agent the Team is being applied to.
 * @returns the typed preparation result.
 */
export async function prepareNativePresentation(agent: Agent): Promise<NativePresentation> {
  const before = await readWire(agent)
  if (before === undefined) {
    return {
      kind: 'unknown',
      reason: 'This Session\'s effective tool presentation could not be read, so a strict custom tool policy cannot be '
        + 'applied to it; the Team was not applied.',
    }
  }
  if (!before.tools.includes(RUN_CODE_NAME)) return { kind: 'already-native' }
  try {
    // Declaring is the only way to tell an ancestor PTC surface (which our own
    // Agent-scoped declaration shadows) from an exact-Agent one (which it
    // cannot). The declaration is kept for the Agent's lifetime rather than
    // probed and released: see {@link installNativePresentation}.
    installNativePresentation(agent)
    return { kind: 'installable', disclosure: PTC_OVERRIDDEN_DISCLOSURE }
  } catch (error: unknown) {
    return {
      kind: 'conflict',
      reason: 'This Session\'s exact Agent scope already declares a tool executor that includes the PTC transport, '
        + 'and one composition may declare only one executor per scope. A strict custom tool policy cannot govern '
        + 'that transport, so the Team was not applied here: choose a Team with the "all" tool mode, or select an Agent '
        + `preset that calls tools natively. (${String(error)})`,
    }
  }
}

/**
 * Declarations this module already holds, keyed by the Agent that owns them.
 *
 * One Agent scope accepts exactly one LIVE executor, so a second application of
 * a custom Team to the same Agent must reuse the declaration instead of
 * competing with it.
 */
const declarations = new WeakMap<Agent, () => void>()

/**
 * Declare the native presentation at the Agent's own scope, once per Agent.
 *
 * The declaration is bound to the **Agent's** lifetime, not to the Team
 * application that asked for it. That is not a refinement — it is required for
 * the Agent to keep working at all:
 *
 * `tools.setExecutor()` documents that unloading a contribution "leaves the
 * selection unavailable until it is replaced", and the Runtime keeps the
 * released slot as a tombstone so that a program cannot silently fall through
 * to a different executor. A released Agent-scope declaration therefore does
 * not restore the deployment default; it makes every later call from that Agent
 * reject with `ToolExecutorUnavailableError`. Releasing on Team change, on a
 * quarantine, or on an HMR remount would take the Session down with it — its
 * own recovery channel included.
 *
 * Re-declaring does recover such a scope, but only while this plugin is mounted
 * to do it. Keeping the declaration alive for as long as the Agent exists is
 * the only arrangement that survives every unload path, so the disposer is
 * registered on `agent.ctx` and returns a no-op to callers instead.
 *
 * @param agent - the Agent the Team is being applied to.
 * @returns a no-op; the declaration lives and dies with the Agent.
 * @throws when the scope already declares a different executor.
 */
export function installNativePresentation(agent: Agent): () => void {
  if (declarations.has(agent)) return () => {}
  const release = agent.ctx.tools.setExecutor(new NativeToolExecutor(agent.ctx))
  declarations.set(agent, release)
  agent.ctx.effect(() => () => {
    declarations.delete(agent)
    release()
  }, 'agent-team-presets: native presentation')
  return () => {}
}

/** What the deployment's own persona slot contributes before this plugin applies a Team. */
export type PersonaBaseline =
  /** No complete persona is active: the deployment's sections compose normally. */
  | { readonly kind: 'none' }
  /** The official complete persona slot is active; its text is captured verbatim. */
  | { readonly kind: 'persona'; readonly text: string }
  /** A complete section this plugin did not author and cannot safely re-declare. */
  | { readonly kind: 'foreign'; readonly name: string }

/**
 * Classify the persona baseline of one wire snapshot.
 *
 * The official prompt service restores an active complete section as the SOLE
 * section, so a single-section snapshot is exactly the signature of a complete
 * deployment persona (the official `minimal` preset). Anything else — several
 * sections, or one section under a name this plugin does not own — means there
 * is no complete persona to preserve.
 * @param sections - the effective sections of a pre-application snapshot.
 * @returns the classified baseline.
 */
export function personaBaseline(sections: WireSnapshot['sections']): PersonaBaseline {
  if (sections.length !== 1) return { kind: 'none' }
  const only = sections[0]!
  return only.name === PERSONA_PREFIX_SECTION
    ? { kind: 'persona', text: only.text }
    : { kind: 'foreign', name: only.name }
}
