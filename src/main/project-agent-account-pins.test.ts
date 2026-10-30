import { describe, expect, it } from 'vitest'
import type { ClaudeManagedAccount, CodexManagedAccount } from '../shared/managed-account-types'
import type { Repo } from '../shared/repo-types'
import type { WorktreeMeta } from '../shared/worktree/meta-types'
import { resolveProjectAgentAccountPins } from './project-agent-account-pins'

const claude: ClaudeManagedAccount = {
  id: 'claude-work',
  email: 'work@example.test',
  managedAuthPath: '/unused',
  authMethod: 'subscription-oauth',
  createdAt: 0,
  updatedAt: 0,
  lastAuthenticatedAt: 0
}
const codex: CodexManagedAccount = {
  id: 'codex-work',
  email: 'work@example.test',
  managedHomePath: '/unused',
  createdAt: 0,
  updatedAt: 0,
  lastAuthenticatedAt: 0
}

function store(repo: Partial<Repo>, meta?: Partial<WorktreeMeta>) {
  const repos: Repo[] = [
    { id: 'repo', path: '/repo', displayName: 'repo', badgeColor: '#000', addedAt: 0, ...repo }
  ]
  return {
    getRepo: (id: string) => repos.find((entry) => entry.id === id),
    getWorktreeMeta: (id: string) => (id === 'repo::/repo/wt' && meta ? meta : undefined),
    getSettings: () => ({
      claudeManagedAccounts: [claude],
      activeClaudeManagedAccountId: null,
      codexManagedAccounts: [codex],
      activeCodexManagedAccountId: 'codex-work'
    })
  }
}

describe('resolveProjectAgentAccountPins', () => {
  it('pins the workspace pick over the project default for each provider', () => {
    const pins = resolveProjectAgentAccountPins(
      store(
        { agentAccounts: { claude: { defaultAccountId: 'claude-work' } } },
        { agentAccounts: { codex: 'system-default' } }
      ),
      'repo::/repo/wt',
      { runtime: 'host' }
    )
    expect(pins).toEqual({ claude: 'claude-work', codex: 'system-default' })
  })

  it('leaves remote projects and WSL terminals on their own account routing', () => {
    const policy = { agentAccounts: { claude: { defaultAccountId: 'claude-work' } } }
    expect(
      resolveProjectAgentAccountPins(
        store({ ...policy, executionHostId: 'runtime:env' }),
        'repo::/repo/wt',
        { runtime: 'host' }
      )
    ).toEqual({})
    expect(
      resolveProjectAgentAccountPins(store(policy), 'repo::/repo/wt', { runtime: 'wsl' })
    ).toEqual({})
  })
})
