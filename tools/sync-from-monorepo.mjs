#!/usr/bin/env node
/** Compare upstream, or stage a candidate import. Never overwrite this repository.
 * Local security fixes and build adapters are authoritative until upstream adopts
 * them. Review staged changes explicitly; regenerate lib from local source.
 */
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const value = flag => { const at = argv.indexOf(flag); if (at === -1) return undefined; const next = argv[at + 1]; if (!next || next.startsWith('--')) throw new Error(`${flag} requires a path`); return next }
const source = resolve(value('--source') ?? process.env.DSH_AGENT_TEAM_PRESETS_SOURCE ?? join(process.env.HOME ?? '', 'deepseek-harness-master/packages/experimental/agent-team-presets'))
if (!existsSync(join(source, 'package.json'))) throw new Error('Select the upstream plugin package with --source.')
const outputArg = value('--output')
if (!argv.includes('--check') && outputArg === undefined) throw new Error('Destructive sync is retired. Use --check or --output <new-staging-directory>, then review and port selected changes.')
const output = outputArg === undefined ? undefined : resolve(outputArg)
if (output !== undefined) {
  const parent = realpathSync(dirname(output))
  const resolved = join(parent, relative(dirname(output), output))
  if (resolved === root || resolved.startsWith(root + sep) || resolved === source || resolved.startsWith(realpathSync(source) + sep)) throw new Error('Staging must be outside this repository and upstream sources.')
  if (existsSync(output)) throw new Error('Use a new staging directory; existing directories are never replaced.')
  mkdirSync(output)
}
const paths = ['src', 'tests', 'locale', 'cordis.patch.yml', 'README.md', 'README.zh.md']
const rename = text => text.replaceAll('@deepseek-ai/dsh-experimental-agent-team-presets', 'dsh-team-presets')
const files = []
function visit(path) {
  const abs = join(source, path)
  if (!existsSync(abs)) return
  if (readdirSafe(abs) !== undefined) { for (const row of readdirSafe(abs)) visit(join(path, row)); return }
  files.push(path)
}
function readdirSafe(path) { try { return readdirSync(path) } catch (error) { if (error.code === 'ENOTDIR') return undefined; throw error } }
for (const path of paths) visit(path)
const different = []
for (const path of files.sort()) {
  const bytes = readFileSync(join(source, path))
  const candidate = /\.(?:ts|tsx|js|json|yml|yaml|md)$/.test(path) ? Buffer.from(rename(bytes.toString('utf8'))) : bytes
  if (!existsSync(join(root, path)) || !candidate.equals(readFileSync(join(root, path)))) different.push(path)
  if (output !== undefined) { mkdirSync(dirname(join(output, path)), { recursive: true }); writeFileSync(join(output, path), candidate) }
}
console.log(`${different.length} upstream candidate files differ; no repository files were changed.`)
for (const path of different) console.log(`  ${path}`)
if (output !== undefined) console.log(`Review candidates in ${output}; package/build/lib/local-only files were deliberately not imported.`)
if (argv.includes('--check') && different.length) process.exitCode = 1
