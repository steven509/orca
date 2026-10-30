import { defineFixture } from '../../../component-fixtures/component-fixture'
import { useAppStore } from '../../../store'
import type { Repo } from '../../../../../shared/repo-types'
import { RepositoryAgentAccountsSection } from './RepositoryAgentAccountsSection'

const account = { createdAt: 0, updatedAt: 0, lastAuthenticatedAt: 0 }

function seedAccounts(): void {
  useAppStore.setState((state) =>
    state.settings
      ? {
          settings: {
            ...state.settings,
            claudeManagedAccounts: [
              {
                ...account,
                id: 'work',
                email: 'dev@company.test',
                organizationName: 'Company',
                managedAuthPath: '/unused',
                authMethod: 'subscription-oauth'
              },
              {
                ...account,
                id: 'personal',
                email: 'me@personal.test',
                managedAuthPath: '/unused',
                authMethod: 'subscription-oauth'
              }
            ],
            activeClaudeManagedAccountId: 'personal',
            codexManagedAccounts: [
              {
                ...account,
                id: 'codex-work',
                email: 'dev@company.test',
                managedHomePath: '/unused'
              }
            ]
          }
        }
      : {}
  )
}

const repo: Repo = {
  id: 'repo',
  path: '/work/app',
  displayName: 'app',
  badgeColor: '#737373',
  addedAt: 0,
  agentAccounts: {
    claude: { allowedAccountIds: ['work', 'system-default'], defaultAccountId: 'work' }
  }
}

export const restricted = defineFixture({
  width: 640,
  setup: seedAccounts,
  render: () => <RepositoryAgentAccountsSection repo={repo} updateRepo={async () => true} />
})
