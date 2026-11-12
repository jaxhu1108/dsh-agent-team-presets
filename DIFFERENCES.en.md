# How this branch differs from upstream

Upstream: [bloodarea/dsh-agent-team-presets](https://github.com/bloodarea/dsh-agent-team-presets)
This branch: [jaxhu1108/dsh-agent-team-presets](https://github.com/jaxhu1108/dsh-agent-team-presets)
Package name: `dsh-team-presets` (GitHub and npm)

---

## 1. What this is not

This branch is **not an upgraded version of upstream**. It is an **independently maintained variant**.

It does several things upstream does not, and it omits several things upstream has. Which one you want depends on what you need — both sides are laid out below so you can decide.

Upstream is carefully maintained. This branch's `setExecutor` lifetime approach was adopted by upstream `v0.2.0` as an independent implementation (no code merged), see [upstream issue #5](https://github.com/bloodarea/dsh-agent-team-presets/issues/5).

---

## 2. What this branch adds

### 2.1 A tool-policy subsystem (the main difference)

Upstream offers two `toolMode` values: all tools, or a custom allow-list. This branch splits that into three modules totalling **476 lines**:

| Module | Lines | Role |
|---|---|---|
| `src/tool-catalog.ts` | 191 | Tool catalog: presents host tools as a browsable, grouped list |
| `src/tool-policy.ts` | 261 | Policy: roles, circuit breaking, recovery tool sets, guard decisions |
| `src/tool-descriptions.ts` | 24 | Tool description injection |

**The practical difference**: configuring a read-only scout, or a reviewer that may run tests but not edit code —

- Upstream: type tool names by hand, with no list of what is available.
- This branch: the settings page lists every tool, grouped, ready to check.

### 2.2 A per-Team personnel switch (`personnelControl`)

Each Team carries an independent switch, default `false`. When enabled, only the captain may add or remove members; when disabled, member edits are refused with a reason.

The use case: freezing a Team into a distributable template so a recipient cannot accidentally restructure it.

Upstream has no equivalent.

### 2.3 An npm release channel

| Channel | Upstream | This branch |
|---|---|---|
| GitHub Releases | ✅ | ✅ |
| npm | ❌ | ✅ `dsh-team-presets` |

**This matters more than it looks.** Update detection admits registry sources only:

```ts
// packages/boot/plugin-manager/src/index.ts — updateRefusal()
if (parsed.kind !== 'registry' || ...) return `${name} is not installed from a registry under its own name`
```

A `github:` spec parses as `kind: 'git'` and is refused before any version lookup.

- Installed from upstream GitHub → **never offered an update**; reinstall by hand.
- Installed from this branch's npm package → the manager compares `latest` and offers the upgrade.

### 2.4 Unified corner radii

Upstream's stylesheets mix twelve hard-coded radii (5–17px), bypassing the theme's six-rung ladder. This branch:

- Routes all 35 radii through `--dsw-radius-xs/sm/md/lg/xl/panel`
- Pairs the four full-round elements with `corner-shape: round` (the host applies `* { corner-shape: superellipse(1.5) }` globally; an unpaired circle becomes a squircle and a capsule gets squared ends)
- Adds `tests/corner-radius.client.spec.ts` with two static guards

### 2.5 Typert remote-face isolation test

`tests/typert-isolation.spec.ts` (17 cases) loads both wire faces in a process that **cannot resolve zod**, proving the client face carries no zod dependency. Upstream has no such guard.

---

## 3. What upstream has and this branch did not

### Now included: the built-in troubleshooting skill

Upstream's `src/builtin-skill.ts` (252 lines) registers a global runtime skill so a user hitting "the Team does not apply / members cannot be summoned / tools are refused / model routing looks wrong" can self-diagnose. It has twelve sections, an evidence-priority table, diagnostic commands, and a report template.

**This branch now includes it** (from `v0.2.4`), with two adaptations:

- Package names and paths point at `dsh-team-presets`
- Content calibrated against this branch's actual implementation

### Still absent: per-member model selection in the client

Upstream's client lets you pick provider/model per member. This branch does not.

Why it is not chased: this branch's `personnelControl` governs *members per Team*; upstream's `selectMember` picks *a model per member*. Two different axes, and forcing both into one UI produces two mechanisms fighting each other. **This branch configures member routing in the Team preset rather than per Session.**

---

## 4. Where both agree

The Agent-lifetime binding for `setExecutor`. Both sides **implemented it independently and reached the same conclusion**:

```ts
agent.ctx.tools.setExecutor(new NativeToolExecutor(agent.ctx))
```

- The registration lands on the Agent's own scope and its disposer is never called.
- The Agent's context owns it, so it is released when the Agent is destroyed.
- The rc.1 one-way release (tombstone) is therefore never triggered.

`src/presentation.ts` here behaves the same as upstream `v0.2.0` on this point. Upstream states explicitly that no downstream code was merged.

---

## 5. Choosing between them

| Your situation | Recommendation |
|---|---|
| You need precise per-member tool allow-lists | **This branch** |
| You need Teams frozen into distributable templates | **This branch** |
| You want update prompts in the plugin manager | **This branch** (npm channel) |
| You need per-member model switching inside a Session | **Upstream** |
| You want to track the most active development | **Upstream** |
| You only use the nine built-in presets and never touch tool policy | Either; upstream is lighter |

**Migration cost**: settings and Team Skills live under `$DSH_HOME/agent-team-presets/`, keyed by the **plugin's internal name** rather than by package name. Both sides use the same internal name, so no data is lost. The two packages cannot be installed side by side, however — the internal name would collide — so uninstall before switching.

---

## 6. Maintenance commitment, and its limits

This branch is **independently maintained**. It does not promise to follow every upstream release. Concretely:

- An upstream fix for a security or correctness problem affecting this branch → followed.
- A new upstream feature with no conflict → evaluated and adopted.
- A new upstream feature that conflicts with this branch's mechanisms → not adopted, with the reason recorded here.

**Upstream is the mainline; this branch is a side branch.** If you only need upstream's full feature set, using upstream is the right call.

---

## 7. Version comparison

| | Upstream | This branch |
|---|---|---|
| Latest | `v0.2.0` | `v0.2.4` |
| `engines.dsh` | `>=0.2.2-rc.1 <0.3.0` | `>=0.2.2-rc.1 <0.3.0` |
| Install name | `dsh-agent-team-presets` | `dsh-team-presets` |
| npm | none | [available](https://www.npmjs.com/package/dsh-team-presets) |
| Tests | — | 772 (771 pass / 1 skipped) |

The version numbers are deliberately not aligned: two independent packages evolving separately need no version-number relationship to signal compatibility.

---

*Last updated 2026-11-12 · corresponds to this branch's `v0.2.4`*
