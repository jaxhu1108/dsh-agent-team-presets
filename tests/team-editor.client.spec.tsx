/** React-element coverage for the Team editor's personnel-control switch. */
import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { TeamEditorView } from '../src/client/TeamEditorView.tsx'
import type { TeamPreset } from '../src/types.ts'

const TEAM: TeamPreset = {
  id: 'team-1', name: 'Review team', description: '', personnelControl: false,
  captain: { name: 'captain', color: '', description: '', toolMode: 'all', tools: [], systemPrompt: '' },
  members: [],
}

type ElementLike = { type: unknown; props: Record<string, unknown> }

function descendants(value: unknown): ElementLike[] {
  if (Array.isArray(value)) return value.flatMap(descendants)
  if (typeof value !== 'object' || value === null || !('props' in value)) return []
  const element = value as ElementLike
  return [element, ...descendants(element.props['children'])]
}

function tree(team: TeamPreset, t: (key: keyof typeof en) => string, onPatch: (patch: Partial<TeamPreset>) => void = () => {}) {
  return TeamEditorView({
    team, providers: [], t, disabled: false, onBack: () => {}, onPatch,
    onOpenAgent: () => {}, onAddMember: () => {}, onRemoveMember: () => {},
  })
}

function inputOf(root: unknown): ElementLike {
  const input = descendants(root).find(element => element.type === 'input')
  if (input === undefined) throw new Error('personnel-control input was not rendered')
  return input
}

function textOf(root: unknown): string {
  if (typeof root === 'string') return root
  if (Array.isArray(root)) return root.map(textOf).join('')
  if (typeof root !== 'object' || root === null || !('props' in root)) return ''
  return textOf((root as ElementLike).props['children'])
}

describe('Team editor personnel control switch', () => {
  it('renders disabled by default with localized copy and stages the checkbox change', () => {
    const html = tree(TEAM, key => en[key])
    const input = inputOf(html)
    expect(input.props['aria-label']).toBe(en.personnelControlTitle)
    expect(input.props['checked']).toBe(false)
    expect(textOf(html)).toContain(en.personnelControlHint)

    const patches: Partial<TeamPreset>[] = []
    const interactive = inputOf(tree(TEAM, key => en[key], patch => { patches.push(patch) }))
    ;(interactive.props['onChange'] as (event: { target: { checked: boolean } }) => void)({ target: { checked: true } })
    expect(patches).toEqual([{ personnelControl: true }])
  })

  it('renders enabled state and Chinese copy when selected', () => {
    const html = tree({ ...TEAM, personnelControl: true }, key => zh[key])
    const input = inputOf(html)
    expect(input.props['checked']).toBe(true)
    expect(textOf(html)).toContain(zh.personnelControlTitle)
    expect(textOf(html)).toContain(zh.personnelControlHint)
  })
})
