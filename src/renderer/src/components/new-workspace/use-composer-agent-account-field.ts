import { useState } from 'react'
import { useAppStore } from '@/store'
import { agentAccountChoices, agentAccountProviderLabel } from '@/lib/agent-account-choices'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import {
  agentAccountProviderForAgent,
  effectiveProjectAgentAccountId,
  hostAgentAccountOptions,
  projectAgentAccountIds,
  type AgentAccountProvider,
  type WorkspaceAgentAccounts
} from '../../../../shared/project-agent-accounts'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { ComposerAgentAccountField } from './NewWorkspaceComposerAgentAccountField'

type AccountPick = { repoId: string; provider: AgentAccountProvider; accountId: string }

/** Only an explicit pick is sent, so untouched workspaces keep following the project default. */
export function useComposerAgentAccountField(input: {
  agent: TuiAgent | null
  repoId: string | undefined
  executionHostId: string | undefined
  enabled: boolean
}): { field: ComposerAgentAccountField | null; agentAccounts: WorkspaceAgentAccounts | undefined } {
  const settings = useAppStore((state) => state.settings)
  const repo = useAppStore((state) =>
    input.repoId
      ? state.repos.find(
          (entry) =>
            entry.id === input.repoId && getRepoExecutionHostId(entry) === LOCAL_EXECUTION_HOST_ID
        )
      : undefined
  )
  const [pick, setPick] = useState<AccountPick | null>(null)
  const provider = agentAccountProviderForAgent(input.agent)
  if (
    !input.enabled ||
    !provider ||
    !repo ||
    (input.executionHostId !== undefined && input.executionHostId !== LOCAL_EXECUTION_HOST_ID) ||
    hostAgentAccountOptions(settings, provider).length === 0
  ) {
    return { field: null, agentAccounts: undefined }
  }
  const policy = repo.agentAccounts?.[provider]
  const choices = agentAccountChoices(
    settings,
    provider,
    projectAgentAccountIds(settings, provider, policy)
  )
  const picked =
    pick?.repoId === repo.id &&
    pick.provider === provider &&
    choices.some((choice) => choice.id === pick.accountId)
      ? pick.accountId
      : undefined
  return {
    field: {
      providerLabel: agentAccountProviderLabel(provider),
      choices,
      value: picked ?? effectiveProjectAgentAccountId(settings, provider, policy),
      onValueChange: (accountId) => setPick({ repoId: repo.id, provider, accountId })
    },
    agentAccounts: picked !== undefined ? { [provider]: picked } : undefined
  }
}
