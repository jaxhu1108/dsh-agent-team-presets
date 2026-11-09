/**
 * Display-metadata editing shared by the Team editor and the page footer.
 *
 * The editor writes the three list fields as comma-separated text, so one pair
 * of helpers parses and formats them for every field instead of three drifting
 * implementations. The separator is the half-width `,` only: a Chinese IME
 * produces `，`, which is ordinary text inside a sentence, and splitting on it
 * would silently cut a prompt in half. A field that keeps a full-width comma is
 * therefore flagged to the reader rather than quietly mangled.
 *
 * The limits are imported from the shareable-document format rather than
 * restated here, so the editor cannot accept something the format would refuse
 * on export. They are enforced as an advisory block on Save: the Host schema
 * stores any string, and silently dropping an over-long field on export would
 * be worse than telling the reader which field is too long.
 * @module dsh-agent-team-presets/client/team-metadata
 */
import type { TeamDisplayMetadata, TeamPreset } from '../types.ts';
/** One list-valued metadata field the editor writes as comma-separated text. */
export type MetadataListField = 'tags' | 'useCases' | 'quickPrompts';
/** The only separator the list fields split on. */
export declare const METADATA_SEPARATOR = ",";
/** The full-width comma an IME produces; it is text, never a separator. */
export declare const FULL_WIDTH_COMMA = "\uFF0C";
/** One measured metadata field, including the whole-object budget. */
export type MetadataField = 'summary' | MetadataListField | 'notes' | 'total';
/** One field value that exceeds the limit the shareable format enforces. */
export interface MetadataIssue {
    /** Team identity, so the footer can name which Team to fix. */
    readonly teamId: string;
    /** Display name of that Team, or its id while unnamed. */
    readonly teamName: string;
    /** Which field is over its limit. */
    readonly field: MetadataField;
    /** The limit the format enforces. */
    readonly limit: number;
    /** What the field currently holds. */
    readonly actual: number;
}
/**
 * Split one comma-separated field into its entries.
 * @param text - the raw field text.
 * @returns trimmed, non-empty entries in input order.
 */
export declare function parseMetadataList(text: string): string[];
/**
 * Render one list field back into its editable text.
 * @param values - the stored entries, or undefined while the field is unset.
 * @returns the entries joined by the half-width comma.
 */
export declare function formatMetadataList(values: readonly string[] | undefined): string;
/**
 * Whether one field text carries a full-width comma.
 * @param text - the raw field text.
 * @returns whether the text would lose a separator the reader expected.
 */
export declare function hasFullWidthComma(text: string): boolean;
/**
 * Whether a metadata object carries nothing a reader could see.
 *
 * The Host schema resolves an absent object into empty defaults, so an unset
 * field comes back as `''` or `[]` rather than undefined; both spellings of
 * "empty" must read the same or the editor would offer to edit a blank block.
 * @param metadata - the metadata to inspect, or undefined.
 * @returns whether every field is empty.
 */
export declare function isEmptyMetadata(metadata: TeamDisplayMetadata | undefined): boolean;
/**
 * Build the metadata object one edit writes.
 *
 * Empty fields are dropped rather than stored as empty strings and arrays: the
 * Host schema fills them back in, and a document that only carries what the
 * reader typed is what the exporter wants to publish.
 * @param fields - the current editor content.
 * @returns the metadata to store.
 */
export declare function metadataFromFields(fields: {
    readonly summary: string;
    readonly tags: readonly string[];
    readonly useCases: readonly string[];
    readonly quickPrompts: readonly string[];
    readonly notes: string;
}): TeamDisplayMetadata;
/**
 * Measure every Team's display metadata against the shareable format.
 *
 * The page withholds Save while any Team is over a limit, because the format
 * would refuse the document on export: a value that cannot travel is a value
 * the reader should be asked to shorten now, not discover later. At most one
 * issue per Team and field is reported — the first violation is the one to fix,
 * and a list that is both too long and too wordy would otherwise repeat itself.
 * @param teams - the Teams the page shows.
 * @returns every violation, in Team order and fixed field order.
 */
export declare function metadataIssuesOf(teams: readonly TeamPreset[]): MetadataIssue[];
