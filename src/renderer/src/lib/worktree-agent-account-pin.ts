import type { AppState } from '@/store'
import { selectWorkspaceByHostTarget } from '@/store/workspace-record-selectors'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import {
  resolvePinnedAgentAccountId,
  type AgentAccountProvider
} from '../../../shared/project-agent-accounts'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import { hostWorktreeTarget } from '../../../shared/worktree/host-qualified-identity'

/** Mirrors main's spawn routing: host-lane terminals in a pinned project keep its account across a global switch. */
export function isWorktreeAgentAccountPinned(
  state: Pick<AppState, 'repos' | 'settings' | 'worktreesByRepo' | 'folderWorkspaces'>,
  worktreeId: string,
  provider: AgentAccountProvider
): boolean {
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const repo = state.repos.find(
    (entry) => entry.id === repoId && getRepoExecutionHostId(entry) === LOCAL_EXECUTION_HOST_ID
  )
  if (!repo) {
    return false
  }
  const worktree = selectWorkspaceByHostTarget(
    state,
    hostWorktreeTarget({ id: worktreeId, hostId: LOCAL_EXECUTION_HOST_ID })
  )
  return (
    resolvePinnedAgentAccountId(
      state.settings,
      provider,
      repo.agentAccounts?.[provider],
      worktree?.agentAccounts?.[provider]
    ) !== undefined
  )
}
