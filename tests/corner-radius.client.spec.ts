/**
 * Static regression guard for the 2026-11-11 corner-radius unification.
 *
 * The bug this prevents: every stylesheet in the plugin rolled its own radii —
 * twelve distinct hard-coded values across three files (`5px`, `6px`, `7px`,
 * `8px`, `9px`, `10px`, `11px`, `12px`, `13px`, `15px`, `17px`) while the theme
 * defines a six-rung ladder (`xs 4 / sm 8 / md 12 / lg 16 / xl 20 / panel 28`).
 * Sibling cards rendering at 9px, 10px and 12px read as noisy rather than
 * smooth, and none of them followed a system change to the theme's radii.
 *
 * Two distinct defects, both guarded here:
 *
 *  1. **Hard-coded radius literals.** A `border-radius: <n>px` in the plugin's
 *     own sheets cannot follow the theme. The single exemption is `0`, which is
 *     a deliberate "this child inherits the parent's corners" choice, not a
 *     scale value.
 *  2. **Unpaired full-round radii.** The theme applies `corner-shape:
 *     superellipse(1.5)` to every element through a universal selector. A
 *     superellipse deforms a circle into a squircle and squares off capsule
 *     ends, so the Harness contract requires every effectively uncapped radius
 *     (`50%`, `999px`, …) to state `corner-shape: round` in the same rule. The
 *     plugin had four such radii with no pairing, so circles and pills were
 *     being silently deformed on engines that support `corner-shape`.
 *     Mirrors `packages/client/ui-theme/tests/corner-shape-styles.client.spec.ts`.
 *
 * Both are pure stylesheet reads — no DOM, no build, no network, deterministic.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const clientRoot = join(repoRoot, 'src', 'client')

/** Every CSS module under `src/client/`, as absolute paths. */
function stylesheets(): string[] {
  const found: string[] = []
  for (const entry of readdirSync(clientRoot, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.module.css')) found.push(join(clientRoot, entry.name))
  }
  return found.sort()
}

/** Normalise an absolute sheet path to a stable, readable label. */
function label(path: string): string {
  return `src/client/${path.slice(clientRoot.length + 1)}`
}

interface Rule {
  selector: string
  declarations: ReadonlyArray<readonly [string, string]>
}

/**
 * Innermost `selector { body }` blocks. An `@media` wrapper never matches because
 * its body contains braces; the rules inside it do.
 */
function rules(css: string): Rule[] {
  const found: Rule[] = []
  const pattern = /([^{}]*)\{([^{}]*)\}/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) {
    const selector = (match[1] ?? '').trim()
    if (selector.length === 0) continue
    const declarations: Array<readonly [string, string]> = []
    for (const part of (match[2] ?? '').split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      declarations.push([part.slice(0, colon).trim(), part.slice(colon + 1).trim()])
    }
    if (declarations.length > 0) found.push({ selector, declarations })
  }
  return found
}

/**
 * A radius that must be explicitly kept circular: any full-round value, which
 * the theme's superellipse would otherwise deform. `var()` rungs are capped by
 * their own definitions and stay out of this set.
 */
function isFullRound(value: string): boolean {
  const normalised = value.replace(/\s+/g, '')
  if (normalised === '50%' || normalised === '100%') return true
  // A pill radius far above any real box height, e.g. `999px`.
  const pixels = /^(\d+(?:\.\d+)?)px$/.exec(normalised)
  return pixels !== null && Number(pixels[1]) >= 99
}

describe('corner radii follow the theme ladder', () => {
  it('declares no hard-coded radius literal', () => {
    // Two literals are allowed and both are geometry, not scale values:
    // `0` is the "inherit the parent's corners" choice for a nested row, and a
    // full-round pill is covered by the pairing guard below instead.
    const offenders: string[] = []
    for (const path of stylesheets()) {
      for (const rule of rules(readFileSync(path, 'utf8'))) {
        for (const [property, value] of rule.declarations) {
          if (property !== 'border-radius') continue
          const literal = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
          if (literal === null || literal[1] === '0' || isFullRound(value)) continue
          offenders.push(`${label(path)}  ${rule.selector}  border-radius: ${value}`)
        }
      }
    }
    expect(offenders.join('\n')).toBe('')
  })

  it('pairs corner-shape: round with every full-round radius', () => {
    // A superellipse squares off capsule ends and deforms circles, so each one
    // states its own arc back. Missing pairings regress silently and only on
    // engines that support `corner-shape`, which no jsdom test renders.
    const offenders: string[] = []
    for (const path of stylesheets()) {
      for (const rule of rules(readFileSync(path, 'utf8'))) {
        const radii = rule.declarations.filter(([property]) => property === 'border-radius')
        if (!radii.some(([, value]) => isFullRound(value))) continue
        const paired = rule.declarations.some(([property, value]) => property === 'corner-shape' && value === 'round')
        if (!paired) offenders.push(`${label(path)}  ${rule.selector}`)
      }
    }
    expect(offenders.join('\n')).toBe('')
  })
})
