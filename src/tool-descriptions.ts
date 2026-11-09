/**
 * Canonical descriptions for the tools this plugin registers.
 *
 * One source per tool: the model-facing definition and the settings hover tip
 * show the same text, so the two can never drift into two different accounts of
 * one capability.
 *
 * Only tools this plugin implements appear here. An upstream tool keeps the
 * description its own author wrote and is never re-described here — inventing
 * hover text for someone else's tool would put unverified claims in the tip, and
 * the description is model-facing text first. These strings are deliberately
 * English only: the upstream `ToolDefinition` carries a single description with
 * no localization field, and the UI shows that same string verbatim.
 * @module dsh-agent-team-presets/tool-descriptions
 */

/** The captain's preset-managed member creation tool. */
export const SPAWN_TEAM_MEMBER_DESCRIPTION = "Create one teammate from the active Team preset, applying that member's own system prompt, model, reasoning effort, and tool scope."

/** The captain's read access to the Session's Team preset. */
export const GET_TEAM_PRESET_DESCRIPTION = 'Read the Agent Team preset for this Session with the exact settings revision and every editable field. Call it before update_team_preset. When this Session selected no Team, the result says so and lists the configured Teams.'

/** The captain's revision-fenced write to the shared Team preset. */
export const UPDATE_TEAM_PRESET_DESCRIPTION = "Persist changes to a shared Team preset: its purpose, the captain's standing prompt, and its roster members. Requires a human-started turn. Roster changes need this Team's personnelControl switch on (Settings) and a permission level above Read Only; they add, rename, re-prompt, re-route, and remove members, and take effect for the next member the captain summons. Purpose and captain-prompt changes still need an approval prompt. Refuses while teammates execute. Read get_team_preset first; a member route is provider plus model as a pair, and a route edit may name only the half it changes."
