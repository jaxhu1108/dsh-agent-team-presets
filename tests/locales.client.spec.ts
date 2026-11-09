/** Locale bundles for the Team presets page and the composer control. */

import { describe, expect, it } from 'vitest'
import { en, NS, zh } from '../src/client/locales.ts'
import { DEFAULTS_NOTICE_KEYS, FORM_ISSUE_KEYS, SELECTION_FAILURE_KEYS, selectionFailureText } from '../src/client/locales.ts'
import type { DefaultsRestore, TeamPresetsFormIssue, TeamSelectionFailure } from '../src/client/team-presets-controller.ts'

describe('Team preset locale bundles', () => {
  it('owns one settings namespace', () => {
    expect(NS).toBe('settings.agentTeamPresets')
  })

  it('keeps the same key set in both languages', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
  })

  it('ships no empty copy, so no consumer can render a blank control', () => {
    for (const [key, copy] of Object.entries({ ...en, ...zh })) {
      expect(copy.trim(), key).not.toBe('')
    }
  })

  it('describes the two tool policies distinctly', () => {
    expect(en.toolsDefault).not.toBe(en.toolsCustom)
    expect(zh.toolsDefault).not.toBe(zh.toolsCustom)
  })

  it('provides localized copy for the optional personnel-control switch', () => {
    expect(en.personnelControlTitle).toMatch(/captain/i)
    // The switch edits the durable roster, so the hint must say so. It used to
    // promise "task-scoped" members that "do not change the preset roster",
    // which is the opposite of what the switch does.
    expect(en.personnelControlHint).toMatch(/roster/i)
    expect(en.personnelControlHint).not.toMatch(/task-scoped/i)
    expect(en.personnelControlHint).toMatch(/reasoning effort/i)
    expect(zh.personnelControlTitle).toContain('队长')
    expect(zh.personnelControlHint).toContain('成员')
    expect(zh.personnelControlHint).not.toContain('临时队员')
    expect(zh.personnelControlHint).toContain('思考强度')
  })

  it('names every way the stored section can be unusable, in both languages', () => {
    const issues: TeamPresetsFormIssue[] = ['settings-unavailable', 'namespace-missing', 'schema-rejected']
    for (const issue of issues) {
      const key = FORM_ISSUE_KEYS[issue]
      expect(en[key].trim(), key).not.toBe('')
      expect(zh[key].trim(), key).not.toBe('')
    }
    // Three different conditions with three different owners must not collapse
    // into one message: the reader has to know which one to act on.
    expect(new Set(Object.values(FORM_ISSUE_KEYS)).size).toBe(issues.length)
  })

  it('reports every selection failure kind, and keeps the Host\'s own refusal text', () => {
    const kinds: TeamSelectionFailure['kind'][] = ['unavailable', 'refused', 'failed']
    for (const kind of kinds) {
      const key = SELECTION_FAILURE_KEYS[kind]
      expect(en[key].trim(), key).not.toBe('')
      expect(zh[key].trim(), key).not.toBe('')
    }
    const refusal: TeamSelectionFailure = {
      kind: 'refused', sessionId: 's1', teamId: 'team-1', detail: 'Config field "selections" is not volatile',
    }
    expect(selectionFailureText(refusal, key => en[key])).toContain('Config field "selections" is not volatile')
    // A failure with no Host text still renders a complete sentence.
    expect(selectionFailureText({ ...refusal, detail: undefined }, key => zh[key])).toBe(zh.selectionRefused)
    expect(selectionFailureText({ ...refusal, detail: '' }, key => zh[key])).toBe(zh.selectionRefused)
  })

  it('names both outcomes of a default-preset restore, in both languages', () => {
    const outcomes: DefaultsRestore[] = ['restored', 'unchanged']
    for (const outcome of outcomes) {
      const key = DEFAULTS_NOTICE_KEYS[outcome]
      expect(en[key].trim(), key).not.toBe('')
      expect(zh[key].trim(), key).not.toBe('')
    }
    // "restored" and "nothing to restore" are different answers: one leaves a
    // save to be pressed, the other does not, so they must not read alike.
    expect(new Set(Object.values(DEFAULTS_NOTICE_KEYS)).size).toBe(outcomes.length)
    expect(en.restoreDefaults.trim()).not.toBe('')
    expect(zh.restoreDefaults.trim()).not.toBe('')
  })
})
