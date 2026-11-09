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
import { METADATA_LIMITS, metadataChars } from "../preset-transfer.js";
/** The only separator the list fields split on. */
export const METADATA_SEPARATOR = ',';
/** The full-width comma an IME produces; it is text, never a separator. */
export const FULL_WIDTH_COMMA = '，';
/**
 * Split one comma-separated field into its entries.
 * @param text - the raw field text.
 * @returns trimmed, non-empty entries in input order.
 */
export function parseMetadataList(text) {
    return text
        .split(METADATA_SEPARATOR)
        .map(entry => entry.trim())
        .filter(entry => entry !== '');
}
/**
 * Render one list field back into its editable text.
 * @param values - the stored entries, or undefined while the field is unset.
 * @returns the entries joined by the half-width comma.
 */
export function formatMetadataList(values) {
    return (values ?? []).join(`${METADATA_SEPARATOR} `);
}
/**
 * Whether one field text carries a full-width comma.
 * @param text - the raw field text.
 * @returns whether the text would lose a separator the reader expected.
 */
export function hasFullWidthComma(text) {
    return text.includes(FULL_WIDTH_COMMA);
}
/**
 * Whether a metadata object carries nothing a reader could see.
 *
 * The Host schema resolves an absent object into empty defaults, so an unset
 * field comes back as `''` or `[]` rather than undefined; both spellings of
 * "empty" must read the same or the editor would offer to edit a blank block.
 * @param metadata - the metadata to inspect, or undefined.
 * @returns whether every field is empty.
 */
export function isEmptyMetadata(metadata) {
    if (metadata === undefined)
        return true;
    return (metadata.summary ?? '').trim() === ''
        && (metadata.tags ?? []).length === 0
        && (metadata.useCases ?? []).length === 0
        && (metadata.quickPrompts ?? []).length === 0
        && (metadata.notes ?? '').trim() === '';
}
/**
 * Build the metadata object one edit writes.
 *
 * Empty fields are dropped rather than stored as empty strings and arrays: the
 * Host schema fills them back in, and a document that only carries what the
 * reader typed is what the exporter wants to publish.
 * @param fields - the current editor content.
 * @returns the metadata to store.
 */
export function metadataFromFields(fields) {
    const summary = fields.summary.trim();
    const notes = fields.notes.trim();
    const tags = fields.tags.filter(entry => entry !== '');
    const useCases = fields.useCases.filter(entry => entry !== '');
    const quickPrompts = fields.quickPrompts.filter(entry => entry !== '');
    return {
        ...summary === '' ? {} : { summary },
        ...tags.length === 0 ? {} : { tags },
        ...useCases.length === 0 ? {} : { useCases },
        ...quickPrompts.length === 0 ? {} : { quickPrompts },
        ...notes === '' ? {} : { notes },
    };
}
/**
 * The first way one list field breaks its limits.
 * @param values - the entries the field holds.
 * @param count - how many entries the format allows.
 * @param length - how many characters one entry may hold.
 * @returns the count and the offending length, or undefined when it fits.
 */
function listIssue(values, count, length) {
    if (values.length > count)
        return { limit: count, actual: values.length };
    const longest = values.reduce((max, entry) => Math.max(max, entry.length), 0);
    return longest > length ? { limit: length, actual: longest } : undefined;
}
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
export function metadataIssuesOf(teams) {
    const issues = [];
    for (const team of teams) {
        const metadata = team.metadata;
        if (metadata === undefined)
            continue;
        const name = team.name === '' ? team.id : team.name;
        const report = (field, limit, actual) => {
            issues.push({ teamId: team.id, teamName: name, field, limit, actual });
        };
        const summary = metadata.summary ?? '';
        if (summary.length > METADATA_LIMITS.summary)
            report('summary', METADATA_LIMITS.summary, summary.length);
        const tags = listIssue(metadata.tags ?? [], METADATA_LIMITS.tags, METADATA_LIMITS.tag);
        if (tags !== undefined)
            report('tags', tags.limit, tags.actual);
        const useCases = listIssue(metadata.useCases ?? [], METADATA_LIMITS.useCases, METADATA_LIMITS.useCase);
        if (useCases !== undefined)
            report('useCases', useCases.limit, useCases.actual);
        const quickPrompts = listIssue(metadata.quickPrompts ?? [], METADATA_LIMITS.quickPrompts, METADATA_LIMITS.quickPrompt);
        if (quickPrompts !== undefined)
            report('quickPrompts', quickPrompts.limit, quickPrompts.actual);
        const notes = metadata.notes ?? '';
        if (notes.length > METADATA_LIMITS.notes)
            report('notes', METADATA_LIMITS.notes, notes.length);
        const total = metadataChars(metadata);
        if (total > METADATA_LIMITS.total)
            report('total', METADATA_LIMITS.total, total);
    }
    return issues;
}
