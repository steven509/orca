import { useState } from 'react'
import type React from 'react'
import type { Repo } from '../../../../../shared/repo-types'
import {
  AGENT_ACCOUNT_PROVIDERS,
  effectiveProjectAgentAccountId,
  hostAgentAccountOptions,
  projectAgentAccountIds,
  SYSTEM_DEFAULT_AGENT_ACCOUNT_ID,
  type AgentAccountProvider,
  type AgentAccountSettings,
  type ProjectAgentAccountPolicy,
  type ProjectAgentAccounts
} from '../../../../../shared/project-agent-accounts'
import { useAppStore } from '../../../store'
import { Checkbox } from '../../ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { agentAccountChoices, agentAccountProviderLabel } from '@/lib/agent-account-choices'
import { getRepositoryAgentAccountsSectionId } from './repository-settings-targets'
import { translate } from '@/i18n/i18n'

// Radix Select forbids empty item values.
const FOLLOW_GLOBAL_VALUE = '__follow_global_account__'

type RepositoryAgentAccountsSectionProps = {
  repo: Repo
  updateRepo: (
    repoId: string,
    updates: { agentAccounts: ProjectAgentAccounts }
  ) => void | Promise<boolean>
}

export function RepositoryAgentAccountsSection({
  repo,
  updateRepo
}: RepositoryAgentAccountsSectionProps): React.JSX.Element | null {
  const settings = useAppStore((state) => state.settings)
  const [saveError, setSaveError] = useState(false)
  const providers = AGENT_ACCOUNT_PROVIDERS.filter(
    (provider) => hostAgentAccountOptions(settings, provider).length > 0
  )
  if (providers.length === 0) {
    return null
  }

  const savePolicy = async (
    provider: AgentAccountProvider,
    policy: ProjectAgentAccountPolicy | undefined
  ): Promise<void> => {
    const { [provider]: _previous, ...others } = repo.agentAccounts ?? {}
    const agentAccounts: ProjectAgentAccounts = policy ? { ...others, [provider]: policy } : others
    setSaveError((await updateRepo(repo.id, { agentAccounts })) === false)
  }

  return (
    <section
      id={getRepositoryAgentAccountsSectionId(repo.id)}
      data-settings-section={getRepositoryAgentAccountsSectionId(repo.id)}
      className="space-y-6"
    >
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold">
          {translate('components.RepositoryAgentAccountsSection.title', 'Agent Accounts')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'components.RepositoryAgentAccountsSection.description',
            "Choose which accounts this project's agent terminals may use and which one they start with. You can pick another allowed account when creating a worktree."
          )}
        </p>
        {saveError ? (
          <p className="text-xs text-destructive">
            {translate(
              'components.RepositoryAgentAccountsSection.saveFailed',
              'Could not save the agent accounts for this project.'
            )}
          </p>
        ) : null}
      </div>
      {providers.map((provider) => (
        <ProviderAccountPolicy
          key={provider}
          repoId={repo.id}
          provider={provider}
          settings={settings}
          policy={repo.agentAccounts?.[provider]}
          onChange={(policy) => void savePolicy(provider, policy)}
        />
      ))}
    </section>
  )
}

function ProviderAccountPolicy({
  repoId,
  provider,
  settings,
  policy,
  onChange
}: {
  repoId: string
  provider: AgentAccountProvider
  settings: AgentAccountSettings | null
  policy: ProjectAgentAccountPolicy | undefined
  onChange: (policy: ProjectAgentAccountPolicy | undefined) => void
}): React.JSX.Element {
  const allIds = projectAgentAccountIds(settings, provider)
  const allowedIds = projectAgentAccountIds(settings, provider, policy)
  const allowedChoices = agentAccountChoices(settings, provider, allowedIds)
  const defaultId =
    policy?.defaultAccountId !== undefined && allowedIds.includes(policy.defaultAccountId)
      ? policy.defaultAccountId
      : undefined
  const effectiveChoice = agentAccountChoices(settings, provider, [
    effectiveProjectAgentAccountId(settings, provider, policy)
  ])[0]
  const providerLabel = agentAccountProviderLabel(provider)
  const defaultLabelId = `repo-${repoId}-${provider}-default-account`

  const toggleAllowed = (id: string, checked: boolean): void => {
    const nextAllowed = checked
      ? allIds.filter((entry) => entry === id || allowedIds.includes(entry))
      : allowedIds.filter((entry) => entry !== id)
    const restricted = nextAllowed.length < allIds.length
    const nextDefault =
      defaultId !== undefined && nextAllowed.includes(defaultId) ? defaultId : undefined
    onChange(
      restricted || nextDefault !== undefined
        ? {
            ...(restricted ? { allowedAccountIds: nextAllowed } : {}),
            ...(nextDefault !== undefined ? { defaultAccountId: nextDefault } : {})
          }
        : undefined
    )
  }

  const selectDefault = (value: string): void => {
    const nextDefault = value === FOLLOW_GLOBAL_VALUE ? undefined : value
    const restricted = allowedIds.length < allIds.length
    onChange(
      restricted || nextDefault !== undefined
        ? {
            ...(restricted ? { allowedAccountIds: allowedIds } : {}),
            ...(nextDefault !== undefined ? { defaultAccountId: nextDefault } : {})
          }
        : undefined
    )
  }

  return (
    <div className="max-w-3xl space-y-3">
      <div className="text-sm font-semibold">{providerLabel}</div>
      <div className="space-y-1.5">
        <span id={defaultLabelId} className="text-xs text-muted-foreground">
          {translate('components.RepositoryAgentAccountsSection.defaultLabel', 'Default account')}
        </span>
        <Select value={defaultId ?? FOLLOW_GLOBAL_VALUE} onValueChange={selectDefault}>
          <SelectTrigger size="sm" className="w-full" aria-labelledby={defaultLabelId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FOLLOW_GLOBAL_VALUE}>
              {translate(
                'components.RepositoryAgentAccountsSection.followGlobal',
                'Follow the account selected in the status bar'
              )}
            </SelectItem>
            {allowedChoices.map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.detail ? `${choice.label} (${choice.detail})` : choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {effectiveChoice ? (
          <p className="text-xs text-muted-foreground">
            {translate(
              'components.RepositoryAgentAccountsSection.effective',
              'New {{provider}} terminals in this project use {{account}}.',
              { provider: providerLabel, account: effectiveChoice.label }
            )}
          </p>
        ) : null}
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-xs text-muted-foreground">
          {translate('components.RepositoryAgentAccountsSection.allowedLabel', 'Allowed accounts')}
        </legend>
        {agentAccountChoices(settings, provider, allIds).map((choice) => {
          const checked = allowedIds.includes(choice.id)
          const checkboxId = `repo-${repoId}-${provider}-allowed-${choice.id}`
          return (
            <div key={choice.id} className="flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={checked}
                // An empty list would allow every account, so keep at least one checked.
                disabled={checked && allowedIds.length === 1}
                onCheckedChange={(next) => toggleAllowed(choice.id, next === true)}
              />
              <label htmlFor={checkboxId} className="min-w-0 truncate text-sm">
                {choice.label}
                {choice.detail ? (
                  <span className="text-muted-foreground"> · {choice.detail}</span>
                ) : null}
                {choice.id === SYSTEM_DEFAULT_AGENT_ACCOUNT_ID ? (
                  <span className="text-muted-foreground">
                    {' '}
                    ·{' '}
                    {translate(
                      'components.RepositoryAgentAccountsSection.systemDefaultDetail',
                      'your own {{provider}} login',
                      { provider: providerLabel }
                    )}
                  </span>
                ) : null}
              </label>
            </div>
          )
        })}
      </fieldset>
    </div>
  )
}
