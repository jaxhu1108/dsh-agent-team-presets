# On this plugin, and where it came from

*A note for users and for whoever comes next · 2026-11-11*

---

## I. The conclusion first

The development of `dsh-agent-team-presets` **was inspired by the original author, [bloodarea](https://github.com/bloodarea/dsh-agent-team-presets)**.

That is not a courtesy line. It is an accurate description. The substantial parts — how the plugin is assembled, what a team preset looks like, the nine built-in teams, how private skills are isolated per role — were not conceived in this repository. This repository did something else.

Stating that plainly matters more than stating it pleasantly.

---

## II. What upstream contributed

**The original author is where this work begins.** Precisely enough to point at:

| Upstream creation | Weight |
|---|---|
| Overall plugin architecture | One Host row serving both as the bundle and as the plugin it composes, assembled through `dsh.bundle.patch`. This is the foundation the whole plugin stands on |
| Team preset data model | A captain plus members, each member with its own provider, model, reasoning effort and tool allow-list. This abstraction decided what the plugin could do |
| Nine built-in presets | Complete team definitions from lightweight through full-stack to audit. An upstream product judgement |
| Private Team Skill subsystem | Skill directory storage, transactional journal, dependency resolution, registration isolated into one role's scope. Technically the hardest part |
| Browser front end | The original settings page, composer team picker and preset editor |
| Agent-facing tool surface | The definitions and semantics of the preset, skill-management and member-summoning tools |

Read that table and the conclusion follows: **without upstream there would have been nothing here to adapt.**

---

## III. What this branch did

Relative to upstream, the work here is concentrated on **keeping it usable on newer Runtime releases and lowering the barrier for others**:

| Addition | Nature | Detail |
|---|---|---|
| Runtime API migration | Adaptation | Upstream pinned a release; later Runtime interfaces changed. This branch follows them |
| Executor lifetime defect fix | Bug fix | Releasing `setExecutor` left a permanent tombstone at the Agent scope that never falls back to the root executor. The fix binds the declaration to the Agent lifetime rather than to plugin unload |
| Captain personnel control (`personnelControl`) | Feature | Lets the captain add, remove and edit members while running, without a trip to the settings page |
| Chinese documentation and `ADAPTATION.md` | Documentation | Seven API migration points written so another agent can follow them directly |
| Desensitized example team | Documentation | A real configuration with the personnel switch, stripped of private detail, importable as-is |
| Packaging and release hygiene | Engineering | `files` allow-list, credential scan, build verification, version alignment |

**The division of labour is clear.** Upstream supplied the skeleton and the ideas; this branch keeps it alive and explains how to use it. Conflating the two would be unfair to the original author and dishonest to users.

---

## IV. Third-party material

| Source | Content | License |
|---|---|---|
| **张灏焱** | The `grilling` and `research` method Team Skills | MIT |
| **Matt Pocock** — [skills](https://github.com/mattpocock/skills) | The two method skills adapt these, pinned at `5beb35b0` | MIT, full text in [NOTICE](<NOTICE>) |

---

## V. License and boundaries

[MIT](<LICENSE>). `LICENSE` retains two copyright lines side by side:

```
Copyright (c) 2026 bloodarea (original author)
Copyright (c) 2026 Jax (modifications and packaging in this fork)
```

MIT permits modification and redistribution, **but not the removal of original attribution.** This repository does not remove it.

One more thing worth writing down: **the upstream repository has never been touched.** This repository's `origin` remote still points at it, and not one commit has been pushed there. Adaptation happens on the fork. Keeping the fork clean is not a favour to anyone — it is just the correct way to work.

---

## VI. If you fork this again

Three things, please:

1. Keep the original author line in `LICENSE`.
2. State your scope of change in [CREDITS.md](<CREDITS.md>). Do not count upstream's work as your own.
3. If your change is a Runtime adaptation, read [ADAPTATION.md](<ADAPTATION.md>) first. It records the traps. It will save you a day.

That is how this chain stays traceable back to where it actually started.

---

## VII. Current state

| Item | Value |
|---|---|
| Plugin version | `0.2.1` |
| Runtime support | `>= 0.2.2-rc.1 < 0.3.0` |
| Tests | 762 cases / 761 passed / 1 skipped / 0 failed across 51 files |
| Typecheck | host 0 local diagnostics / client 0 local diagnostics |
| Distribution | GitHub Releases + npm (package name `dsh-team-presets`, distinct from the upstream `dsh-agent-team-presets`) |

---

<sub>This note complements the [README](<README.en.md>) and [CREDITS.md](<CREDITS.md>): the README explains usage, CREDITS explains attribution, this note explains the history and the reasoning. 中文版：[NOTES.md](<NOTES.md>)。</sub>
