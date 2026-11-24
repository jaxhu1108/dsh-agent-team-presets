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
export const SPAWN_TEAM_MEMBER_DESCRIPTION = "Create a new teammate from the active Team preset with its configured prompt, model and tools. "
    + "Use list_team_members to check stable role identity and frozen-configuration differences before delegating. "
    + "Continue related work with send_message to the matching instance. If an instance already exists, this tool returns reuse-required until creation_reason explains the need for another.";
/** Read-only discovery of the instances this plugin manages. */
export const LIST_TEAM_MEMBERS_DESCRIPTION = 'List stored Team instances and unclassified children in this conversation with stable team/role identities, activity and frozen-configuration differences. '
    + 'Compatibility compares preset declarations. Unclassified children have unverified preset membership. inherited-at-creation leaves the actual model route unverified. '
    + 'Check these before reuse. Matching configuration still requires judging task continuity. inactive only describes turn activity. '
    + 'send_message resumes an existing instance with its creation-time configuration. A snapshot does not verify cold-resume health. '
    + 'Wait or retry temporary capacity/closing failures. Confirmed NOT_RESUMABLE or missing snapshot permits a replacement with creation_reason.';
/** The captain's read access to the Session's Team preset. */
export const GET_TEAM_PRESET_DESCRIPTION = 'Read the Agent Team preset for this Session with the exact settings revision and every editable field. Call it before update_team_preset. When this Session selected no Team, the result says so and lists the configured Teams.';
/** The captain's revision-fenced write to the shared Team preset. */
export const UPDATE_TEAM_PRESET_DESCRIPTION = "Persist changes to a shared Team preset: its purpose, the captain's standing prompt, and its roster members. Requires a human-started turn. Roster changes need this Team's personnelControl switch on (Settings) and a permission level above Read Only; they add, rename, re-prompt, re-route, and remove members, and take effect for the next member the captain summons. Purpose and captain-prompt changes still need an approval prompt. Refuses while teammates execute. Read get_team_preset first; a member route is provider plus model as a pair, and a route edit may name only the half it changes.";
