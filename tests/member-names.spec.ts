/** Member and instance targets accepted by the Host's real naming validator. */

import { describe, expect, it } from 'vitest'
import { isAgentName } from '@deepseek-ai/dsh-subagent/src/names.ts'
import { availableMemberTarget, findMember, memberTarget, memberTargets } from '../src/presets.ts'
import type { TeamAgentPreset, TeamPreset } from '../src/types.ts'

function member(name: string): TeamAgentPreset {
  return {
    name, color: '', description: '', provider: '', model: '', reasoningEffort: '',
    tools: [], systemPrompt: '',
  }
}

function team(names: string[]): TeamPreset {
  return {
    id: 'naming-team', name: 'Naming', description: '',
    captain: { name: 'captain', color: '', description: '', tools: [], systemPrompt: '' },
    members: names.map(member),
  }
}

describe('member target Host compatibility', () => {
  it.each(['a', 'reviewer', 'executor-2', 'build--agent', 'builder-', 'x'.repeat(32)])(
    'keeps the valid Host target %s', name => {
      const target = memberTarget(member(name), 0, new Set())
      expect(target).toBe(name)
      expect(isAgentName(target)).toBe(true)
    },
  )

  it('normalizes surrounding whitespace and upper-case letters', () => {
    expect(memberTarget(member('  REVIEWER-2  '), 0, new Set())).toBe('reviewer-2')
  })

  it.each(['1executor', '123', 'lead', 'LEAD', 'x'.repeat(33), '审查者', 'builder_team', 'a/b', '', '😀'])(
    'assigns a valid fallback to the display name %s', name => {
      const target = memberTarget(member(name), 1, new Set())
      expect(target).toBe('member-2')
      expect(isAgentName(target)).toBe(true)
    },
  )

  it.each([31, 32])('keeps repeated %i-character template targets valid and unique', length => {
    const name = 'x'.repeat(length)
    const targets = memberTargets(team([name, name, name])).map(entry => entry.target)
    expect(targets).toEqual([name, `${'x'.repeat(30)}-2`, `${'x'.repeat(30)}-3`])
    expect(targets.every(isAgentName)).toBe(true)
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('records a fallback suffix in the supplied template reservation set', () => {
    const used = new Set(['member-1'])
    expect(memberTarget(member('lead'), 0, used)).toBe('member-1-2')
    expect([...used]).toEqual(['member-1', 'member-1-2'])
  })

  it.each(['1executor', 'lead', 'x'.repeat(33), '审查者'])(
    'still resolves the original display name %s and its fallback target', name => {
      const preset = team([name])
      expect(findMember(preset, name)).toEqual({ member: preset.members[0], target: 'member-1' })
      expect(findMember(preset, 'MEMBER-1')?.member).toBe(preset.members[0])
    },
  )
})

describe('availableMemberTarget', () => {
  it('returns an unused base without changing reservations', () => {
    const used = new Set(['executor-2'])
    expect(availableMemberTarget('executor', used)).toBe('executor')
    expect([...used]).toEqual(['executor-2'])
  })

  it('avoids other role targets as well as existing instances', () => {
    const preset = team(['executor', 'executor-2', 'executor-3'])
    const used = new Set(memberTargets(preset).map(entry => entry.target))
    expect(availableMemberTarget('executor', used)).toBe('executor-4')
    expect([...used]).toEqual(['executor', 'executor-2', 'executor-3'])
  })

  it.each([31, 32])('reserves suffix space for a %i-character role target', length => {
    const base = 'x'.repeat(length)
    const used = new Set([base])
    const second = availableMemberTarget(base, used)
    expect(second).toBe(`${'x'.repeat(30)}-2`)
    expect(isAgentName(second)).toBe(true)
    used.add(second)
    expect(availableMemberTarget(base, used)).toBe(`${'x'.repeat(30)}-3`)
  })

  it('reserves additional space when the suffix reaches two digits', () => {
    const base = 'x'.repeat(32)
    const used = new Set([base])
    for (let ordinal = 2; ordinal <= 12; ordinal += 1) {
      const target = availableMemberTarget(base, used)
      const suffix = `-${ordinal}`
      expect(target).toBe(`${base.slice(0, 32 - suffix.length)}${suffix}`)
      expect(isAgentName(target)).toBe(true)
      expect(used.has(target)).toBe(false)
      used.add(target)
    }
  })

  it('avoids a collision with a different base that truncates to the same suffix', () => {
    const base = `${'x'.repeat(30)}ab`
    const used = new Set([base, `${'x'.repeat(30)}-2`])
    expect(availableMemberTarget(base, used)).toBe(`${'x'.repeat(30)}-3`)
  })

  it('removes trailing stem hyphens before appending a numeric suffix', () => {
    const base = `a${'-'.repeat(31)}`
    expect(availableMemberTarget(base, new Set([base]))).toBe('a-2')
    expect(isAgentName(availableMemberTarget(base, new Set([base])))).toBe(true)
  })
})
