import type { GlobalSettings } from './global-settings-types'
import type { TuiAgent } from './tui-agent'

export const AGENT_ACCOUNT_PROVIDERS = ['claude', 'codex'] as const
export type AgentAccountProvider = (typeof AGENT_ACCOUNT_PROVIDERS)[number]

/** Stands for the provider's own login, which has no managed account id. */
export const SYSTEM_DEFAULT_AGENT_ACCOUNT_ID = 'system-default'

export type ProjectAgentAccountPolicy = {
  /** Accounts this project may launch with; absent or empty allows every account. */
  allowedAccountIds?: string[]
  /** Absent follows the global account selection. */
  defaultAccountId?: string
}

export type ProjectAgentAccounts = Partial<Record<AgentAccountProvider, ProjectAgentAccountPolicy>>

/** Chosen when the workspace was created; outranks the project default. */
export type WorkspaceAgentAccounts = Partial<Record<AgentAccountProvider, string>>

export type AgentAccountSettings = Partial<
  Pick<
    GlobalSettings,
    | 'claudeManagedAccounts'
    | 'activeClaudeManagedAccountId'
    | 'activeClaudeManagedAccountIdsByRuntime'
    | 'codexManagedAccounts'
    | 'activeCodexManagedAccountId'
    | 'activeCodexManagedAccountIdsByRuntime'
  >
>

export type AgentAccountOption = {
  id: string
  email: string
  /** Organization or workspace that tells same-email logins apart. */
  detail: string | null
}

const MAX_ACCOUNT_ID_LENGTH = 200
const MAX_ALLOWED_ACCOUNT_IDS = 64

export function agentAccountProviderForAgent(
  agent: TuiAgent | null | undefined
): AgentAccountProvider | null {
  return agent === 'claude' || agent === 'codex' ? agent : null
}

/** Host accounts only: WSL accounts belong to a distro lane that project routing does not cover. */
export function hostAgentAccountOptions(
  settings: AgentAccountSettings | null | undefined,
  provider: AgentAccountProvider
): AgentAccountOption[] {
  if (provider === 'claude') {
    return (settings?.claudeManagedAccounts ?? [])
      .filter((account) => account.managedAuthRuntime !== 'wsl')
      .map((account) => ({
        id: account.id,
        email: account.email,
        detail: account.organizationName ?? null
      }))
  }
  return (settings?.codexManagedAccounts ?? [])
    .filter((account) => account.managedHomeRuntime !== 'wsl')
    .map((account) => ({
      id: account.id,
      email: account.email,
      detail: account.workspaceLabel ?? null
    }))
}

export function globalHostAgentAccountId(
  settings: AgentAccountSettings | null | undefined,
  provider: AgentAccountProvider
): string {
  const selected =
    provider === 'claude'
      ? (settings?.activeClaudeManagedAccountIdsByRuntime?.host ??
        settings?.activeClaudeManagedAccountId)
      : (settings?.activeCodexManagedAccountIdsByRuntime?.host ??
        settings?.activeCodexManagedAccountId)
  return selected &&
    hostAgentAccountOptions(settings, provider).some((account) => account.id === selected)
    ? selected
    : SYSTEM_DEFAULT_AGENT_ACCOUNT_ID
}

/** System default first, then managed accounts, limited to what the project allows. */
export function projectAgentAccountIds(
  settings: AgentAccountSettings | null | undefined,
  provider: AgentAccountProvider,
  policy?: ProjectAgentAccountPolicy
): string[] {
  const available = [
    SYSTEM_DEFAULT_AGENT_ACCOUNT_ID,
    ...hostAgentAccountOptions(settings, provider).map((account) => account.id)
  ]
  // Stale ids from removed accounts must not narrow the list to nothing.
  const allowed = new Set(policy?.allowedAccountIds?.filter((id) => available.includes(id)))
  return allowed.size > 0 ? available.filter((id) => allowed.has(id)) : available
}

/** The account a project launch must pin; undefined follows the global selection. */
export function resolvePinnedAgentAccountId(
  settings: AgentAccountSettings | null | undefined,
  provider: AgentAccountProvider,
  policy?: ProjectAgentAccountPolicy,
  workspaceChoice?: string
): string | undefined {
  if (hostAgentAccountOptions(settings, provider).length === 0) {
    return undefined
  }
  const allowed = projectAgentAccountIds(settings, provider, policy)
  const explicit = [workspaceChoice, policy?.defaultAccountId].find(
    (id) => id !== undefined && allowed.includes(id)
  )
  if (explicit !== undefined) {
    return explicit
  }
  return allowed.includes(globalHostAgentAccountId(settings, provider)) ? undefined : allowed[0]
}

export function effectiveProjectAgentAccountId(
  settings: AgentAccountSettings | null | undefined,
  provider: AgentAccountProvider,
  policy?: ProjectAgentAccountPolicy,
  workspaceChoice?: string
): string {
  return (
    resolvePinnedAgentAccountId(settings, provider, policy, workspaceChoice) ??
    globalHostAgentAccountId(settings, provider)
  )
}

function providerFields(value: object): Record<AgentAccountProvider, unknown> {
  return {
    claude: 'claude' in value ? value.claude : undefined,
    codex: 'codex' in value ? value.codex : undefined
  }
}

function normalizeAccountId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const id = value.trim()
  return id && id.length <= MAX_ACCOUNT_ID_LENGTH && !/[\\/\0]/.test(id) ? id : undefined
}

function normalizePolicy(value: unknown): ProjectAgentAccountPolicy | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const allowedRaw = 'allowedAccountIds' in value ? value.allowedAccountIds : undefined
  const allowedAccountIds = Array.isArray(allowedRaw)
    ? [...new Set(allowedRaw.map(normalizeAccountId).filter((id) => id !== undefined))].slice(
        0,
        MAX_ALLOWED_ACCOUNT_IDS
      )
    : []
  const defaultAccountId = normalizeAccountId(
    'defaultAccountId' in value ? value.defaultAccountId : undefined
  )
  if (allowedAccountIds.length === 0 && defaultAccountId === undefined) {
    return undefined
  }
  return {
    ...(allowedAccountIds.length > 0 ? { allowedAccountIds } : {}),
    ...(defaultAccountId !== undefined ? { defaultAccountId } : {})
  }
}

/** Undefined for malformed input; an empty object clears every provider. */
export function normalizeProjectAgentAccounts(value: unknown): ProjectAgentAccounts | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const fields = providerFields(value)
  const normalized: ProjectAgentAccounts = {}
  for (const provider of AGENT_ACCOUNT_PROVIDERS) {
    const policy = normalizePolicy(fields[provider])
    if (policy) {
      normalized[provider] = policy
    }
  }
  return normalized
}

export function normalizeWorkspaceAgentAccounts(
  value: unknown
): WorkspaceAgentAccounts | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const fields = providerFields(value)
  const normalized: WorkspaceAgentAccounts = {}
  for (const provider of AGENT_ACCOUNT_PROVIDERS) {
    const id = normalizeAccountId(fields[provider])
    if (id !== undefined) {
      normalized[provider] = id
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}
