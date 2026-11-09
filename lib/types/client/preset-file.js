/**
 * Browser file plumbing for the fixed Team preset format: read one chosen
 * document, and offer one Team as a download.
 * @module dsh-agent-team-presets/preset-file
 */
import { MAX_TRANSFER_CHARS, exportTeamPreset, parseTeamPresetValue, teamFromTransfer } from "../preset-transfer.js";
/** Characters a generated file name may keep. */
const UNSAFE_NAME = /[^\p{L}\p{N}._-]+/gu;
/** File name stem length, so one long Team name cannot produce a huge name. */
const MAX_STEM = 64;
/** File revision that adds the Team-level personnel-control field. */
const PERSONNEL_CONTROL_FILE_VERSION = 3;
/** Narrow a parsed JSON object without accepting arrays as records. */
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
/**
 * Serialize one Team document, including the Team-level personnel setting.
 * The shared transfer core has its own fixed schema; this client file wrapper
 * owns the additive field and keeps older documents readable.
 * @param team - the Team being exported.
 * @param options - official-template declarations, if any.
 * @returns a newline-terminated Team JSON document.
 */
export function serializeTeamPresetFile(team, options = {}) {
    const transfer = exportTeamPreset(team, options);
    const document = {
        ...transfer,
        version: PERSONNEL_CONTROL_FILE_VERSION,
        team: { ...transfer.team, personnelControl: team.personnelControl === true },
    };
    return JSON.stringify(document, null, 2) + '\n';
}
/**
 * Parse one Team file while stripping the client-owned setting before the
 * shared reader validates its fixed set of fields. Version 1 cannot carry the
 * setting; missing values always default to false for safe legacy imports.
 * @param text - the chosen file contents.
 * @returns the validated transfer and its normalized opt-in value.
 */
export function parseTeamPresetFile(text) {
    if (text.length > MAX_TRANSFER_CHARS)
        return { ok: false, reason: 'too-large' };
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return { ok: false, reason: 'invalid-json' };
    }
    const root = record(value);
    const team = root === undefined ? undefined : record(root['team']);
    const hasPersonnelControl = team !== undefined && Object.prototype.hasOwnProperty.call(team, 'personnelControl');
    const personnelControl = team?.['personnelControl'];
    const fileVersion = root?.['version'];
    if (typeof fileVersion === 'number' && fileVersion > PERSONNEL_CONTROL_FILE_VERSION) {
        return { ok: false, reason: 'unsupported-version' };
    }
    if (hasPersonnelControl && fileVersion !== PERSONNEL_CONTROL_FILE_VERSION) {
        return { ok: false, reason: 'unsupported-fields' };
    }
    if (fileVersion === PERSONNEL_CONTROL_FILE_VERSION && !hasPersonnelControl) {
        return { ok: false, reason: 'invalid-format' };
    }
    if (hasPersonnelControl && typeof personnelControl !== 'boolean') {
        return { ok: false, reason: 'invalid-format' };
    }
    let transferValue = value;
    if (root !== undefined && team !== undefined && (hasPersonnelControl || fileVersion === 3)) {
        const cleanTeam = { ...team };
        delete cleanTeam['personnelControl'];
        transferValue = { ...root, version: fileVersion === PERSONNEL_CONTROL_FILE_VERSION ? 2 : fileVersion, team: cleanTeam };
    }
    const parsed = parseTeamPresetValue(transferValue);
    if (!parsed.ok)
        return parsed;
    return {
        ok: true,
        transfer: {
            ...parsed.transfer,
            version: fileVersion === PERSONNEL_CONTROL_FILE_VERSION ? PERSONNEL_CONTROL_FILE_VERSION : parsed.transfer.version,
            team: { ...parsed.transfer.team, personnelControl: personnelControl === true },
        },
    };
}
/**
 * Build a local Team from a file transfer, restoring its opt-in value.
 * @param transfer - the validated file transfer.
 * @param id - the local Team identity.
 * @returns a local Team whose legacy flag is explicitly disabled.
 */
export function teamFromPresetFile(transfer, id) {
    return { ...teamFromTransfer(transfer, id), personnelControl: transfer.team.personnelControl };
}
/**
 * Derive the file name one Team downloads under.
 * @param team - the Team being exported.
 * @returns a `.json` file name built from the Team's name, or from its identity.
 */
export function presetFileName(team) {
    const label = (team.name.trim() === '' ? team.id : team.name.trim())
        .replace(UNSAFE_NAME, '-')
        .replace(/^-+|-+$/gu, '')
        .slice(0, MAX_STEM);
    return `${label === '' ? 'team' : label}.json`;
}
/**
 * Read one chosen document as text.
 * @param file - the file the user picked.
 * @returns the file's text.
 */
export async function readPresetFile(file) {
    return await file.text();
}
/**
 * Offer one Team document as a download.
 * @param fileName - the name the browser saves it under.
 * @param text - the document body.
 */
export function downloadPresetText(fileName, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
    }
    finally {
        URL.revokeObjectURL(url);
    }
}
