/**
 * Browser file plumbing for the fixed Team preset format: read one chosen
 * document, and offer one Team as a download.
 * @module dsh-agent-team-presets/preset-file
 */
import type { TeamPresetExportOptions, TeamPresetImportFailure, TeamPresetTransfer } from '../preset-transfer.ts';
import type { TeamPreset } from '../types.ts';
/** A portable Team document plus its opt-in personnel-management setting. */
export type TeamPresetFileTransfer = Omit<TeamPresetTransfer, 'team'> & {
    readonly team: TeamPresetTransfer['team'] & {
        readonly personnelControl: boolean;
    };
};
/** Result of reading one Team file, with missing legacy values normalized off. */
export type TeamPresetFileImportResult = {
    readonly ok: true;
    readonly transfer: TeamPresetFileTransfer;
} | {
    readonly ok: false;
    readonly reason: TeamPresetImportFailure;
};
/**
 * Serialize one Team document, including the Team-level personnel setting.
 * The shared transfer core has its own fixed schema; this client file wrapper
 * owns the additive field and keeps older documents readable.
 * @param team - the Team being exported.
 * @param options - official-template declarations, if any.
 * @returns a newline-terminated Team JSON document.
 */
export declare function serializeTeamPresetFile(team: TeamPreset, options?: TeamPresetExportOptions): string;
/**
 * Parse one Team file while stripping the client-owned setting before the
 * shared reader validates its fixed set of fields. Version 1 cannot carry the
 * setting; missing values always default to false for safe legacy imports.
 * @param text - the chosen file contents.
 * @returns the validated transfer and its normalized opt-in value.
 */
export declare function parseTeamPresetFile(text: string): TeamPresetFileImportResult;
/**
 * Build a local Team from a file transfer, restoring its opt-in value.
 * @param transfer - the validated file transfer.
 * @param id - the local Team identity.
 * @returns a local Team whose legacy flag is explicitly disabled.
 */
export declare function teamFromPresetFile(transfer: TeamPresetFileTransfer, id: string): TeamPreset;
/**
 * Derive the file name one Team downloads under.
 * @param team - the Team being exported.
 * @returns a `.json` file name built from the Team's name, or from its identity.
 */
export declare function presetFileName(team: TeamPreset): string;
/**
 * Read one chosen document as text.
 * @param file - the file the user picked.
 * @returns the file's text.
 */
export declare function readPresetFile(file: File): Promise<string>;
/**
 * Offer one Team document as a download.
 * @param fileName - the name the browser saves it under.
 * @param text - the document body.
 */
export declare function downloadPresetText(fileName: string, text: string): void;
