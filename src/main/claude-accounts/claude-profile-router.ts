import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  CLAUDE_INJECTED_CONFIG_DIR_ENV,
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_PROFILE_SETUP_FAILED_MESSAGE,
  CLAUDE_USER_CONFIG_DIR_ENV
} from '../../shared/claude-profile-routing'
import { claudeProfileMissing, claudeProfileSetupFailed } from './claude-profile-launch-errors'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import {
  claudeProfileMarkerPath,
  describeClaudeProfile,
  type ClaudeProfileDescriptor,
  readUserClaudeConfigDir,
  readUserClaudeConfigDirAsSet,
  resolveClaudeDefaultHome
} from './claude-profile-paths'
import type { runClaudeProfileSetupInWorker } from './claude-profile-setup-worker'
import { ClaudeProfileSetupRunner } from './claude-profile-setup-runner'
import type { ClaudeEnvPatch } from './environment'
import type { ClaudeRuntimeAuthPreparation } from './runtime-auth/runtime-auth-types'
import {
  findClaudeAccount,
  getSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'
import { wslClaudeProfilePointer } from './claude-profile-wsl-paths'
import { isDirectory, listClaudeProfileHomes } from './claude-profile-homes'
import {
  claudeStateFile,
  readClaudeFolderLogin,
  removeClaudeAccountFolder,
  isSameClaudeLogin,
  type ClaudeFolderLogin
} from './claude-account-folder'
import { resolveLoginShellEnvironment } from '../startup/login-shell-environment'
import { SYSTEM_DEFAULT_AGENT_ACCOUNT_ID } from '../../shared/project-agent-accounts'

const REFRESH_WAIT_MS = 5_000

export type ClaudeProfileRouterSettings = Pick<
  GlobalSettings,
  | 'claudeManagedAccounts'
  | 'activeClaudeManagedAccountId'
  | 'activeClaudeManagedAccountIdsByRuntime'
  | 'agentStatusHooksEnabled'
  | 'disabledTuiAgents'
>

/** Mirror the settings selection to a pointer file for Claude in existing terminals. */
export class ClaudeProfileRouter {
  readonly pointerPath: string
  private readonly setups: ClaudeProfileSetupRunner
  private env: NodeJS.ProcessEnv
  private readonly envReady: Promise<unknown>
  private envResolved: boolean
  constructor(
    private readonly args: {
      getSettings: () => ClaudeProfileRouterSettings
      dataRoot: string
      userHome?: string
      env?: NodeJS.ProcessEnv
      runSetup?: typeof runClaudeProfileSetupInWorker
      refreshWaitMs?: number
    }
  ) {
    this.pointerPath = join(args.dataRoot, 'claude-profiles', 'selected-host')
    this.env = args.env ?? process.env
    // Dock launches lack CLAUDE_CONFIG_DIR exported by shell startup files.
    this.envResolved = Boolean(args.env)
    this.envReady = args.env
      ? Promise.resolve()
      : resolveLoginShellEnvironment().then((env) => {
          this.env = env
          this.envResolved = true
          // Recompute routing using the resolved System default.
          try {
            this.writePointer()
          } catch (error) {
            console.warn('[claude-profile] Could not update the Claude account pointer:', error)
          }
        })
    this.setups = new ClaudeProfileSetupRunner({
      dataRoot: args.dataRoot,
      userHome: () => this.userHome,
      userConfigDir: () => this.userConfigDir(),
      getSettings: args.getSettings,
      envReady: this.envReady,
      runSetup: args.runSetup
    })
  }

  private get userHome(): string {
    return this.args.userHome ?? homedir()
  }

  private selectedProfile(): ClaudeProfileDescriptor | null {
    const id = getSelectedClaudeAccountIdForTarget(this.args.getSettings(), { runtime: 'host' })
    return id ? this.describe(id) : null
  }

  /** A pinned account routes one project's panes; absent follows the selection. */
  private requestedProfile(pinnedAccountId?: string): ClaudeProfileDescriptor | null {
    if (pinnedAccountId === undefined) {
      return this.selectedProfile()
    }
    return pinnedAccountId === SYSTEM_DEFAULT_AGENT_ACCOUNT_ID
      ? null
      : this.describe(pinnedAccountId)
  }

  private routedProfile(pinnedAccountId?: string): ClaudeProfileDescriptor | null {
    const profile = this.requestedProfile(pinnedAccountId)
    return profile && !this.coveredBySystemDefault(profile.accountId) ? profile : null
  }

  private pointerFor(pinnedAccountId?: string): string {
    return pinnedAccountId === undefined
      ? this.pointerPath
      : join(this.args.dataRoot, 'claude-profiles', 'pinned', pinnedAccountId)
  }

  accountLogin(accountId: string): ClaudeFolderLogin | null {
    return readClaudeFolderLogin(claudeStateFile(this.accountHome(accountId), this.userHome))
  }

  systemDefaultLogin(maxAgeMs = 0): ClaudeFolderLogin | null {
    return readClaudeFolderLogin(claudeStateFile(this.userConfigDir(), this.userHome), maxAgeMs)
  }

  /** Reuse a matching System default login until a legacy account signs in separately. */
  coveredBySystemDefault(accountId: string): boolean {
    if (this.accountLogin(accountId)) {
      return false
    }
    const saved = findClaudeAccount(this.args.getSettings(), accountId)
    const systemDefault = this.systemDefaultLogin()
    return Boolean(saved && systemDefault && isSameClaudeLogin(saved, systemDefault))
  }

  systemDefaultHome(): string {
    return resolveClaudeDefaultHome(this.userHome, this.userConfigDir())
  }

  /** Never fall back from a missing folder: that would run the wrong account. */
  routedHome(pinnedAccountId?: string): string | null {
    const home = this.routedProfile(pinnedAccountId)?.home ?? null
    if (home !== null && !isDirectory(home)) {
      throw claudeProfileMissing()
    }
    return home
  }

  /** Publish the pointer before starting background setup. */
  publish(): void {
    if (!this.writePointer()) {
      return
    }
    // Create missing or covered folders without a login so they can sign in separately.
    const profile = this.selectedProfile()
    if (profile) {
      this.setups.setUpInBackground(profile)
    }
  }

  private writePointer(pinnedAccountId?: string): boolean {
    const pointerPath = this.pointerFor(pinnedAccountId)
    if (this.args.getSettings().claudeManagedAccounts.length === 0) {
      rmSync(pointerPath, { force: true })
      return false
    }
    const home = this.routedProfile(pinnedAccountId)?.home ?? ''
    // Avoid rewriting the pointer on every launch.
    if (!existsSync(pointerPath) || readFileSync(pointerPath, 'utf8') !== home) {
      mkdirSync(dirname(pointerPath), { recursive: true, mode: 0o700 })
      writeFileAtomically(pointerPath, home, { mode: 0o600 })
    }
    return true
  }

  /** Initial setup must succeed; later refreshes may time out without blocking launch. */
  async prepareLaunch(pinnedAccountId?: string): Promise<ClaudeRuntimeAuthPreparation> {
    const selected = this.requestedProfile(pinnedAccountId)
    // Only fallback routing needs the shell env; account setup waits for it separately.
    if (!selected || !this.accountLogin(selected.accountId)) {
      await this.envReady
    }
    // Login changes since publication can change the route.
    this.writePointer(pinnedAccountId)
    const profile = this.routedProfile(pinnedAccountId)
    if (!profile) {
      return this.preparation(pinnedAccountId)
    }
    // A missing marker means initial setup has not completed.
    if (!existsSync(claudeProfileMarkerPath(profile))) {
      const report = await this.setups.setUp(profile).catch(() => null)
      if (report?.outcome !== 'prepared') {
        throw claudeProfileSetupFailed()
      }
      return this.preparation(pinnedAccountId)
    }
    // Run with the previous setup if refreshing fails or exceeds the deadline.
    const refresh = this.setups.setUp(profile).catch((error: unknown) => {
      console.warn('[claude-profile] Account refresh failed:', error)
    })
    const waitMs = this.args.refreshWaitMs ?? REFRESH_WAIT_MS
    await Promise.race([refresh, new Promise((resolve) => setTimeout(resolve, waitMs).unref())])
    return this.preparation(pinnedAccountId)
  }

  accountHome(accountId: string): string {
    return this.describe(accountId).home
  }

  async prepareAccount(accountId: string): Promise<string> {
    const profile = this.describe(accountId)
    const report = await this.setups.setUp(profile).catch(() => null)
    if (report?.outcome !== 'prepared') {
      throw new Error(CLAUDE_PROFILE_SETUP_FAILED_MESSAGE)
    }
    return profile.home
  }

  /** Wait for setup before deleting so it cannot recreate the folder. */
  async removeAccount(accountId: string): Promise<void> {
    await this.setups.settled(accountId)
    // Panes pinned to the account fall back to System default instead of recreating its folder.
    rmSync(this.pointerFor(accountId), { force: true })
    await removeClaudeAccountFolder(this.args.dataRoot, accountId)
  }

  /** A legacy snapshot records copy-based account switching. */
  copiedLoginIntoSystemDefault(): boolean {
    return existsSync(join(this.args.dataRoot, 'claude-runtime-auth', 'system-default-auth.json'))
  }

  userConfigDir(): string | undefined {
    return readUserClaudeConfigDir(this.env)
  }

  private describe(accountId: string): ClaudeProfileDescriptor {
    return describeClaudeProfile(this.args.dataRoot, accountId, {
      executionHostId: 'local',
      runtime: 'host'
    })
  }

  launchEnv(pinnedAccountId?: string): ClaudeEnvPatch {
    const home = this.routedHome(pinnedAccountId)
    return {
      [CLAUDE_PROFILE_POINTER_ENV]: this.pointerFor(pinnedAccountId),
      // Preserve the user's inherited CLAUDE_CONFIG_DIR for System default.
      ...(home ? { CLAUDE_CONFIG_DIR: home, [CLAUDE_INJECTED_CONFIG_DIR_ENV]: home } : {})
    }
  }

  /** A broken account selection must not prevent opening a terminal. */
  terminalEnv(target?: ClaudeAccountSelectionTarget, pinnedAccountId?: string): ClaudeEnvPatch {
    // Pass the pointer without waiting on the guest.
    if (target?.runtime === 'wsl') {
      return { [CLAUDE_PROFILE_POINTER_ENV]: `~/${wslClaudeProfilePointer(this.args.dataRoot)}` }
    }
    // Save the user's value so the shell function can restore it on System default.
    const userConfigDir = readUserClaudeConfigDirAsSet(this.env)
    const pointerPath = this.pointerFor(pinnedAccountId)
    const base: ClaudeEnvPatch = {
      [CLAUDE_PROFILE_POINTER_ENV]: pointerPath,
      ...(userConfigDir ? { [CLAUDE_USER_CONFIG_DIR_ENV]: userConfigDir } : {})
    }
    // Defer routing until the shell env resolves; the shell function will read the updated pointer.
    if (!this.envResolved) {
      return base
    }
    try {
      this.writePointer(pinnedAccountId)
      // Refresh without delaying terminal creation.
      const profile = this.routedProfile(pinnedAccountId)
      if (profile) {
        this.setups.setUpInBackground(profile)
      }
      return { ...base, ...this.launchEnv(pinnedAccountId) }
    } catch {
      return base
    }
  }

  preparation(pinnedAccountId?: string): ClaudeRuntimeAuthPreparation {
    const profile = this.routedProfile(pinnedAccountId)
    const home = this.routedHome(pinnedAccountId)
    return {
      configDir: home ?? this.systemDefaultHome(),
      runtime: 'host',
      wslDistro: null,
      wslLinuxConfigDir: null,
      envPatch: this.launchEnv(pinnedAccountId),
      provenance: home ? `profile:${profile?.accountId}` : 'system'
    }
  }

  /** Compare pre-routing terminals against the selection; null means no account is selected. */
  systemDefaultRunsAnotherAccount(): boolean | null {
    const profile = this.selectedProfile()
    if (!profile) {
      return null
    }
    const selected =
      this.accountLogin(profile.accountId) ??
      findClaudeAccount(this.args.getSettings(), profile.accountId)
    const systemDefault = this.systemDefaultLogin(5_000)
    return !selected || !systemDefault || !isSameClaudeLogin(selected, systemDefault)
  }

  routesToAccount(): boolean {
    return this.routedProfile() !== null
  }

  /** Read usage from the same login the account would launch with. */
  accountUsagePreparation(accountId: string): ClaudeRuntimeAuthPreparation {
    if (this.coveredBySystemDefault(accountId)) {
      // Setting CLAUDE_CONFIG_DIR for System default changes its Keychain identity.
      return {
        configDir: this.systemDefaultHome(),
        envPatch: {},
        provenance: 'system'
      }
    }
    const home = this.accountHome(accountId)
    return {
      configDir: home,
      envPatch: { CLAUDE_CONFIG_DIR: home },
      provenance: `profile:${accountId}`
    }
  }

  accountHomes(): string[] {
    return listClaudeProfileHomes(this.args.dataRoot)
  }
}
