import { translate } from '@/i18n/i18n'
import {
  hostAgentAccountOptions,
  SYSTEM_DEFAULT_AGENT_ACCOUNT_ID,
  type AgentAccountProvider,
  type AgentAccountSettings
} from '../../../shared/project-agent-accounts'

export type AgentAccountChoice = {
  id: string
  label: string
  detail: string | null
}

export function agentAccountProviderLabel(provider: AgentAccountProvider): string {
  return provider === 'claude' ? 'Claude' : 'Codex'
}

/** Labels for account ids in display order; unknown ids are dropped. */
export function agentAccountChoices(
  settings: AgentAccountSettings | null | undefined,
  provider: AgentAccountProvider,
  ids: readonly string[]
): AgentAccountChoice[] {
  const accounts = new Map(
    hostAgentAccountOptions(settings, provider).map((account) => [account.id, account])
  )
  return ids.flatMap((id): AgentAccountChoice[] => {
    if (id === SYSTEM_DEFAULT_AGENT_ACCOUNT_ID) {
      return [
        {
          id,
          label: translate('components.agentAccounts.systemDefault', 'System default'),
          detail: null
        }
      ]
    }
    const account = accounts.get(id)
    return account ? [{ id, label: account.email, detail: account.detail }] : []
  })
}
