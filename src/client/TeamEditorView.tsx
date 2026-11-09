/**
 * Second Team preset page: one Team's own name, description, captain, and
 * member roster. Choosing the captain or a member opens that agent's page.
 */

import { useEffect, useState } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProviderChoice } from './team-presets-controller.ts'
import type { TeamAgentPreset, TeamPreset } from '../types.ts'
import type { TeamPresetsLocaleKey } from './locales.ts'
import { CategorySelect } from './CategorySelect.tsx'
import css from './TeamPresetsSection.module.css'

/** The agent page one row opens. */
export type AgentSlot = 'captain' | number

/** Model caption of one configured agent slot. */
function agentRoute(agent: TeamAgentPreset, providers: readonly ProviderChoice[]): string {
  if (agent.provider === '' || agent.model === '') return ''
  const provider = providers.find(entry => entry.id === agent.provider)
  const model = provider?.models.find(entry => entry.id === agent.model)
  return `${provider?.name ?? agent.provider} · ${model?.name ?? agent.model}`
}

/** Props of one Team's page. */
/** Local editor state of the display-metadata panel. */
interface MetadataFields {
  summary: string
  tags: string
  useCases: string
  quickPrompts: string
  notes: string
}

/**
 * The display-metadata card.
 *
 * Everything it edits is user-facing only: the panel says so, and the fields are
 * written as one `metadata` patch so a Team's fingerprint (and therefore a
 * running task's applied definition) never changes because a label was edited.
 * @param props - the Team and the patch writer.
 * @returns the folded card.
 */
function MetadataPanel(props: { team: TeamPreset; disabled: boolean; onPatch: (patch: Partial<TeamPreset>) => void; t: (key: TeamPresetsLocaleKey) => string }): React.ReactElement {
  const existing = props.team.metadata ?? {}
  const [fields, setFields] = useState<MetadataFields>({
    summary: existing.summary ?? '',
    tags: (existing.tags ?? []).join(', '),
    useCases: (existing.useCases ?? []).join('\n'),
    quickPrompts: (existing.quickPrompts ?? []).join('\n'),
    notes: existing.notes ?? '',
  })
  useEffect(() => {
    const meta = props.team.metadata ?? {}
    setFields({
      summary: meta.summary ?? '',
      tags: (meta.tags ?? []).join(', '),
      useCases: (meta.useCases ?? []).join('\n'),
      quickPrompts: (meta.quickPrompts ?? []).join('\n'),
      notes: meta.notes ?? '',
    })
  }, [props.team.id, props.team.metadata])
  const [open, setOpen] = useState(false)
  const commit = (next: MetadataFields): void => {
    setFields(next)
    props.onPatch({
      metadata: {
        ...next.summary.trim() === '' ? {} : { summary: next.summary.trim() },
        ...next.notes.trim() === '' ? {} : { notes: next.notes.trim() },
        ...next.tags.trim() === '' ? {} : { tags: next.tags.split(',').map(entry => entry.trim()).filter(entry => entry !== '') },
        ...next.useCases.trim() === '' ? {} : { useCases: next.useCases.split('\n').map(entry => entry.trim()).filter(entry => entry !== '') },
        ...next.quickPrompts.trim() === '' ? {} : { quickPrompts: next.quickPrompts.split('\n').map(entry => entry.trim()).filter(entry => entry !== '') },
      },
    })
  }
  return (
    <section className={css.card}>
      <span className={css.cardTitle}>
        {props.t('metadataTitle')} <span className={css.hint}>{props.t('metadataOnlyDisplay')}</span>
      </span>
      <p className={css.hint}>{props.t('metadataNote')}</p>
      <Button size="sm" variant="ghost" onClick={() => { setOpen(value => !value) }}>
        {open ? props.t('metadataFold') : props.t('metadataUnfold')}
      </Button>
      {open ? (
        <>
          <label className={css.fieldLabel}>{props.t('metadataSummary')}</label>
          <textarea className={css.prompt} rows={2} disabled={props.disabled} value={fields.summary}
            onChange={(event) => { commit({ ...fields, summary: event.target.value }) }} />
          <label className={css.fieldLabel}>{props.t('metadataTags')}</label>
          <input className={css.textInput} disabled={props.disabled} value={fields.tags}
            onChange={(event) => { commit({ ...fields, tags: event.target.value }) }} />
          <p className={css.hint}>{props.t('metadataTagsHint')}</p>
          <label className={css.fieldLabel}>{props.t('metadataUseCases')}</label>
          <textarea className={css.prompt} rows={3} disabled={props.disabled} value={fields.useCases}
            onChange={(event) => { commit({ ...fields, useCases: event.target.value }) }} />
          <label className={css.fieldLabel}>{props.t('metadataQuickPrompts')}</label>
          <textarea className={css.prompt} rows={3} disabled={props.disabled} value={fields.quickPrompts}
            onChange={(event) => { commit({ ...fields, quickPrompts: event.target.value }) }} />
          <label className={css.fieldLabel}>{props.t('metadataNotes')}</label>
          <textarea className={css.prompt} rows={2} disabled={props.disabled} value={fields.notes}
            onChange={(event) => { commit({ ...fields, notes: event.target.value }) }} />
        </>
      ) : null}
    </section>
  )
}

export interface TeamEditorViewProps {
  /** The Team being edited. */
  readonly team: TeamPreset
  /** Provider catalogue used for the model captions. */
  readonly providers: readonly ProviderChoice[]
  /** Page copy reader. */
  readonly t: (key: TeamPresetsLocaleKey) => string
  /** Whether the Host document accepts writes. */
  readonly disabled: boolean
  readonly onBack: () => void
  readonly onPatch: (patch: Partial<TeamPreset>) => void
  /** The reader's own categories, for the membership select. */
  readonly categories?: readonly { readonly id: string; readonly name: string }[]
  /** This Team's category, or an empty string when it has none. */
  readonly categoryId?: string
  /** Writes the membership; an empty id clears it. */
  readonly onSetCategory?: (categoryId: string) => void
  readonly onOpenAgent: (slot: AgentSlot) => void
  readonly onAddMember: () => void
  readonly onRemoveMember: (index: number) => void
}

/**
 * Render one Team's page.
 * @param props - the Team, catalogue, copy, and navigation callbacks.
 * @returns the back row, the Team identity fields, and the roster.
 */
export function TeamEditorView(props: TeamEditorViewProps) {
  const { team, t, disabled } = props
  return (
    <>
      <header className={css.pageHead}>
        <button type="button" className={css.crumb} onClick={props.onBack}>
          <span aria-hidden>‹</span> {t('backToList')}
        </button>
        <h2 className={css.title}>{team.name === '' ? team.id : team.name}</h2>
      </header>

      <section className={css.card}>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('teamName')}</span>
          <Input
            className={css.input ?? ''}
            value={team.name}
            placeholder={t('teamNamePlaceholder')}
            disabled={disabled}
            onChange={(event) => { props.onPatch({ name: event.target.value }) }}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel}>{t('teamDescription')}</span>
          <textarea
            className={css.prompt}
            rows={3}
            value={team.description}
            disabled={disabled}
            onChange={(event) => { props.onPatch({ description: event.target.value }) }}
          />
        </div>
      </section>

      <section className={css.card}>
        <label className={css.field}>
          <span className={css.fieldLabel}>{t('personnelControlTitle')}</span>
          <span className={css.hint}>{t('personnelControlHint')}</span>
          <input
            type="checkbox"
            aria-label={t('personnelControlTitle')}
            checked={team.personnelControl === true}
            disabled={disabled}
            onChange={(event) => { props.onPatch({ personnelControl: event.target.checked }) }}
          />
        </label>
      </section>

      <span className={css.sectionTitle}>{t('teamSections')}</span>

      <section className={css.card}>
        <button type="button" className={css.entryRow} onClick={() => { props.onOpenAgent('captain') }}>
          <span
            className={css.dot}
            style={team.captain.color === '' ? undefined : { background: team.captain.color }}
            aria-hidden
          />
          <span className={css.rowText}>
            <span className={css.rowName}>
              {t('roleCaptain')}{team.captain.name.trim() === '' ? '' : ` · ${team.captain.name.trim()}`}
            </span>
            <span className={css.rowMeta}>{t('captainFollowsSession')}</span>
          </span>
          <span className={css.chevron} aria-hidden>›</span>
        </button>
        <p className={css.hint}>{t('captainHint')}</p>
      </section>

      <section className={css.card}>
        <div className={css.cardHead}>
          <span className={css.cardTitle}>{t('members')}</span>
          <Button size="sm" variant="outline" disabled={disabled} onClick={props.onAddMember}>{t('addMember')}</Button>
        </div>
        {team.members.length === 0 ? <p className={css.hint}>{t('emptyMembers')}</p> : (
          <ul className={css.plainRows}>
            {team.members.map((member, index) => (
              <li key={member.id ?? `${team.id}-member-${String(index)}`} className={css.entry}>
                <button type="button" className={css.entryRow} onClick={() => { props.onOpenAgent(index) }}>
                  <span
                    className={css.dot}
                    style={member.color === '' ? undefined : { background: member.color }}
                    aria-hidden
                  />
                  <span className={css.rowText}>
                    <span className={css.rowName}>
                      {member.name.trim() === '' ? `${t('roleMember')} ${String(index + 1)}` : member.name.trim()}
                    </span>
                    <span className={css.rowMeta}>{agentRoute(member, props.providers) || t('inheritSession')}</span>
                  </span>
                  <span className={css.chevron} aria-hidden>›</span>
                </button>
                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => { props.onRemoveMember(index) }}>
                  {t('removeMember')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {props.onSetCategory === undefined ? null : (
        <section className={css.card}>
          <span className={css.cardTitle}>{props.t('categoryOf')}</span>
          <div className={css.field}>
            <CategorySelect
              value={props.categoryId ?? ''}
              categories={props.categories ?? []}
              noneLabel={props.t('categoryNone')}
              disabled={props.disabled}
              onChange={(id) => { props.onSetCategory?.(id) }}
            />
            <span className={css.hint}>{props.t('categoryNote')}</span>
          </div>
        </section>
      )}

      <MetadataPanel team={props.team} disabled={props.disabled} onPatch={props.onPatch} t={props.t} />
    </>
  )
}
