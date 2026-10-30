import type { Repo } from '../shared/repo-types'
import type { WorktreeMeta } from '../shared/worktree/meta-types'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../shared/execution-host'
import {
  AGENT_ACCOUNT_PROVIDERS,
  resolvePinnedAgentAccountId,
  type AgentAccountProvider,
  type AgentAccountSettings
} from '../shared/project-agent-accounts'
import { getRepoIdFromWorktreeId } from '../shared/worktree/id'

/** Absent providers follow the global account selection. */
export type AgentAccountPins = Partial<Record<AgentAccountProvider, string>>

type ProjectAgentAccountStore = {
  getRepo: (
    repoId: string
  ) => Pick<Repo, 'agentAccounts' | 'connectionId' | 'executionHostId'> | undefined
  getWorktreeMeta: (worktreeId: string) => Pick<WorktreeMeta, 'agentAccounts'> | undefined
  getSettings: () => AgentAccountSettings
}

let installed: ProjectAgentAccountStore | undefined

/** Installed only in the desktop process, which owns local projects and their accounts. */
export function installProjectAgentAccountStore(store: ProjectAgentAccountStore | undefined): void {
  installed = store
}

export function resolveProjectAgentAccountPins(
  store: ProjectAgentAccountStore | undefined,
  worktreeId: string | undefined,
  target: { runtime?: 'host' | 'wsl' }
): AgentAccountPins {
  if (!store || !worktreeId || target.runtime === 'wsl') {
    return {}
  }
  const repo = store.getRepo(getRepoIdFromWorktreeId(worktreeId))
  if (!repo || getRepoExecutionHostId(repo) !== LOCAL_EXECUTION_HOST_ID) {
    return {}
  }
  const workspaceChoices = store.getWorktreeMeta(worktreeId)?.agentAccounts
  const settings = store.getSettings()
  const pins: AgentAccountPins = {}
  for (const provider of AGENT_ACCOUNT_PROVIDERS) {
    const pinned = resolvePinnedAgentAccountId(
      settings,
      provider,
      repo.agentAccounts?.[provider],
      workspaceChoices?.[provider]
    )
    if (pinned !== undefined) {
      pins[provider] = pinned
    }
  }
  return pins
}

/** A lookup failure must not block opening a terminal; it falls back to the global selection. */
export function resolveSpawnAgentAccountPins(
  worktreeId: string | undefined,
  target: { runtime?: 'host' | 'wsl' }
): AgentAccountPins {
  try {
    return resolveProjectAgentAccountPins(installed, worktreeId, target)
  } catch (error) {
    console.warn('[agent-accounts] Could not resolve project accounts:', error)
    return {}
  }
}
