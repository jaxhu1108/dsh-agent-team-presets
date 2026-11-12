/**
 * The built-in troubleshooting skill: content contract and registration.
 *
 * Why this exists as a guard rather than only as a feature: the guide is the
 * plugin's only self-service path when a Team fails to apply. A Session with no
 * Team selected — the exact Session a broken Team leaves behind — can still load
 * it, because registration is owned by the installation rather than by an Agent.
 * Two things can silently break that:
 *
 *  1. **Content shape.** The body is a Markdown template literal. A stray
 *     backtick inside it (a Markdown inline code span is the obvious way to
 *     introduce one) closes the literal early and the module fails to parse at
 *     all — a build error, not a runtime one, but one that hides behind bundler
 *     output rather than naming the file.
 *  2. **Registration wiring.** `apply()` must mount the skill on the plugin
 *     context, and it must survive a deployment whose `skills` service never
 *     composes (the injector simply never fires). A throw here would take the
 *     whole plugin down over a documentation aid.
 *
 * The registration test drives a minimal fake context instead of the full Agent
 * loop testkit: the contract under test is `ctx.inject(['skills'], …)` plus
 * `skills.register({ … })`, not any Team behaviour.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SKILL_CONTENT,
  BUILTIN_SKILL_DESCRIPTION,
  BUILTIN_SKILL_NAME,
  BUILTIN_SKILL_WHEN_TO_USE,
  registerBuiltinSkill,
} from '../src/builtin-skill.ts'

const sourcePath = fileURLToPath(new URL('../src/builtin-skill.ts', import.meta.url))

describe('built-in troubleshooting skill content', () => {
  it('keeps a kebab-case name the host can address', () => {
    // The host addresses a skill by name through the `skill` tool, so the name
    // has to be a stable kebab-case identifier rather than a display title.
    expect(BUILTIN_SKILL_NAME).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(BUILTIN_SKILL_NAME).toBe('team-presets-troubleshooting')
  })

  it('routes on the failure modes this plugin can produce', () => {
    // Discovery is a routing decision: the description and whenToUse are what the
    // model reads to decide whether to load the body. They must name the plugin's
    // own surface, not a generic "something went wrong".
    expect(BUILTIN_SKILL_DESCRIPTION).toContain('dsh-team-presets')
    expect(BUILTIN_SKILL_WHEN_TO_USE.length).toBeGreaterThan(0)
    for (const term of ['Team', '成员', '工具']) expect(BUILTIN_SKILL_DESCRIPTION).toContain(term)
  })

  it('names this package rather than the upstream one', () => {
    // A guide that tells the user to inspect the wrong package is worse than no
    // guide: the paths it names would not exist in this installation.
    for (const text of [BUILTIN_SKILL_CONTENT, BUILTIN_SKILL_DESCRIPTION, BUILTIN_SKILL_WHEN_TO_USE]) {
      expect(text).not.toContain('dsh-agent-team-presets')
    }
    expect(BUILTIN_SKILL_CONTENT).toContain('dsh-team-presets')
  })

  it('states the runtime range this release actually supports', () => {
    // The install section is the most likely paragraph to go stale: it is copied
    // from the release the guide shipped with. Pin it to the declared range so a
    // version bump that forgets the guide fails here instead of misinforming a
    // user who is debugging an install.
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      engines: { dsh: string }
    }
    expect(BUILTIN_SKILL_CONTENT).toContain(manifest.engines.dsh)
  })

  it('carries no unescaped backtick that would end the template literal', () => {
    // The body is a template literal, so every backtick in the source is either
    // its own delimiter or a syntax error. Reading the file back and counting
    // catches the failure at the source rather than through a bundler message
    // that names a column in a 9 KB line.
    const source = readFileSync(sourcePath, 'utf8')
    const start = source.indexOf('BUILTIN_SKILL_CONTENT: string = `')
    expect(start).toBeGreaterThan(-1)
    const bodyStart = source.indexOf('`', start) + 1
    const bodyEnd = source.indexOf('\n`\n', bodyStart)
    expect(bodyEnd).toBeGreaterThan(bodyStart)
    const body = source.slice(bodyStart, bodyEnd)
    expect(body).not.toContain('`')
  })

  it('keeps the troubleshooting sections a user is routed to', () => {
    // Section headings are the guide's table of contents; losing one silently
    // makes a routing entry land on nothing.
    for (const heading of [
      '## 证据优先级',
      '## 快速分诊',
      '## 2. 自定义工具策略被拒',
      '## 3. 成员无法召唤',
      '## 9. 安装 / 升级 / 版本',
      '## 12. 报告模板',
    ]) expect(BUILTIN_SKILL_CONTENT).toContain(heading)
  })
})

describe('built-in troubleshooting skill registration', () => {
  /**
   * Minimal context stand-in: only `inject` and `effect` are exercised by the
   * registration path, so the fixture implements exactly those.
   */
  function fakeContext(services: string[]) {
    const registered: any[] = []
    const effects: string[] = []
    const ctx = {
      inject(names: string[], install: (injected: any) => void) {
        if (!names.every(name => services.includes(name))) return
        install({
          effect: (factory: () => unknown, label?: string) => {
            effects.push(label ?? '')
            registered.push(factory())
          },
          skills: {
            register: (skill: unknown) => {
              registered.push(skill)
              return () => {}
            },
          },
        })
      },
    }
    return { ctx, registered, effects }
  }

  it('registers one runtime skill on the plugin context', () => {
    const { ctx, registered, effects } = fakeContext(['skills'])
    registerBuiltinSkill(ctx as never)
    expect(effects).toContain('team-presets: built-in troubleshooting skill')
    const skill = registered.find(row => typeof row === 'object' && row !== null && 'name' in row) as
      | { name: string; description: string; whenToUse?: string; source: string; content: string }
      | undefined
    expect(skill).toBeDefined()
    expect(skill!.name).toBe(BUILTIN_SKILL_NAME)
    expect(skill!.description).toBe(BUILTIN_SKILL_DESCRIPTION)
    expect(skill!.whenToUse).toBe(BUILTIN_SKILL_WHEN_TO_USE)
    // `runtime` is the provider surface for plugin-registered skill bodies; the
    // registry reserves that provider name for exactly this call.
    expect(skill!.source).toBe('runtime')
    expect(skill!.content).toBe(BUILTIN_SKILL_CONTENT)
  })

  it('stays inert on a deployment that composes no skill service', () => {
    // `inject` never fires when the service is absent, so the registration is a
    // no-op rather than a throw: a documentation aid must not take the plugin
    // down on a headless composition without skills.
    const { ctx, registered } = fakeContext([])
    expect(() => registerBuiltinSkill(ctx as never)).not.toThrow()
    expect(registered).toEqual([])
  })
})
