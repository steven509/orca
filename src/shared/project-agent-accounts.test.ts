import { describe, expect, it } from 'vitest'
import type { ClaudeManagedAccount } from './managed-account-types'
import {
  effectiveProjectAgentAccountId,
  normalizeProjectAgentAccounts,
  projectAgentAccountIds,
  resolvePinnedAgentAccountId,
  SYSTEM_DEFAULT_AGENT_ACCOUNT_ID,
  type AgentAccountSettings
} from './project-agent-accounts'

function claudeAccount(id: string, runtime: 'host' | 'wsl' = 'host'): ClaudeManagedAccount {
  return {
    id,
    email: `${id}@example.test`,
    managedAuthPath: '/unused',
    managedAuthRuntime: runtime,
    authMethod: 'subscription-oauth',
    createdAt: 0,
    updatedAt: 0,
    lastAuthenticatedAt: 0
  }
}

const settings: AgentAccountSettings = {
  claudeManagedAccounts: [
    claudeAccount('work'),
    claudeAccount('personal'),
    claudeAccount('guest', 'wsl')
  ],
  activeClaudeManagedAccountId: 'work'
}

describe('resolvePinnedAgentAccountId', () => {
  it('follows the global selection until the project or workspace chooses an account', () => {
    expect(resolvePinnedAgentAccountId(settings, 'claude')).toBeUndefined()
    expect(resolvePinnedAgentAccountId(settings, 'claude', { defaultAccountId: 'personal' })).toBe(
      'personal'
    )
    expect(
      resolvePinnedAgentAccountId(settings, 'claude', { defaultAccountId: 'personal' }, 'work')
    ).toBe('work')
    expect(
      resolvePinnedAgentAccountId(settings, 'claude', {
        defaultAccountId: SYSTEM_DEFAULT_AGENT_ACCOUNT_ID
      })
    ).toBe(SYSTEM_DEFAULT_AGENT_ACCOUNT_ID)
  })

  it('pins the first allowed account when the global selection is not allowed', () => {
    const policy = { allowedAccountIds: ['personal', SYSTEM_DEFAULT_AGENT_ACCOUNT_ID] }
    expect(projectAgentAccountIds(settings, 'claude', policy)).toEqual([
      SYSTEM_DEFAULT_AGENT_ACCOUNT_ID,
      'personal'
    ])
    expect(resolvePinnedAgentAccountId(settings, 'claude', policy)).toBe(
      SYSTEM_DEFAULT_AGENT_ACCOUNT_ID
    )
    expect(resolvePinnedAgentAccountId(settings, 'claude', policy, 'work')).toBe(
      SYSTEM_DEFAULT_AGENT_ACCOUNT_ID
    )
    expect(
      resolvePinnedAgentAccountId(settings, 'claude', { allowedAccountIds: ['work', 'personal'] })
    ).toBeUndefined()
  })

  it('ignores removed, WSL, and provider-less accounts instead of narrowing to nothing', () => {
    expect(
      resolvePinnedAgentAccountId(settings, 'claude', {
        allowedAccountIds: ['removed'],
        defaultAccountId: 'guest'
      })
    ).toBeUndefined()
    expect(
      resolvePinnedAgentAccountId(settings, 'codex', { defaultAccountId: 'work' })
    ).toBeUndefined()
    expect(
      effectiveProjectAgentAccountId(
        { ...settings, activeClaudeManagedAccountId: 'guest' },
        'claude'
      )
    ).toBe(SYSTEM_DEFAULT_AGENT_ACCOUNT_ID)
  })
})

describe('normalizeProjectAgentAccounts', () => {
  it('drops malformed policies and path-like ids but keeps an empty object as a clear', () => {
    expect(normalizeProjectAgentAccounts('claude')).toBeUndefined()
    expect(normalizeProjectAgentAccounts({})).toEqual({})
    expect(
      normalizeProjectAgentAccounts({
        claude: { allowedAccountIds: ['a', 'a', '../b', 7], defaultAccountId: ' a ' },
        codex: { defaultAccountId: '' },
        gemini: { defaultAccountId: 'x' }
      })
    ).toEqual({ claude: { allowedAccountIds: ['a'], defaultAccountId: 'a' } })
  })
})
