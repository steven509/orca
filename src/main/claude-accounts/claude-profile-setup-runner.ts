import { getClaudeAgentViewService } from '../claude/agent-view-service'
import { isAgentStatusHooksEnabledForAgent } from '../../shared/agent-status-hooks-setting'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { probeRecentClaudeCliVersion } from '../claude/claude-hook-event-versions'
import { resolveClaudeCommand } from '../codex-cli/command'
import type { ClaudeProfileDescriptor } from './claude-profile-paths'
import type { ClaudeProfileSetupReport } from './claude-profile-setup'
import { runClaudeProfileSetupInWorker } from './claude-profile-setup-worker'

/** Sets up account folders, reusing in-flight setup per account. */
export class ClaudeProfileSetupRunner {
  private readonly running = new Map<string, Promise<ClaudeProfileSetupReport>>()

  constructor(
    private readonly args: {
      dataRoot: string
      userHome: () => string
      userConfigDir: () => string | undefined
      getSettings: () => Pick<GlobalSettings, 'agentStatusHooksEnabled' | 'disabledTuiAgents'>
      envReady: Promise<unknown>
      runSetup?: typeof runClaudeProfileSetupInWorker
    }
  ) {}

  setUp(profile: ClaudeProfileDescriptor): Promise<ClaudeProfileSetupReport> {
    const running = this.running.get(profile.accountId)
    if (running) {
      return running
    }
    const run = this.run(profile).finally(() => this.running.delete(profile.accountId))
    this.running.set(profile.accountId, run)
    return run
  }

  setUpInBackground(profile: ClaudeProfileDescriptor): void {
    this.setUp(profile).catch((error: unknown) => {
      console.warn('[claude-profile] Account setup failed:', error)
    })
  }

  async settled(accountId: string): Promise<void> {
    await this.running.get(accountId)?.catch(() => {})
  }

  private async run(profile: ClaudeProfileDescriptor): Promise<ClaudeProfileSetupReport> {
    await this.args.envReady
    const hooks = isAgentStatusHooksEnabledForAgent(this.args.getSettings(), 'claude')
    const claudeVersion = hooks ? await probeRecentClaudeCliVersion(resolveClaudeCommand()) : null
    const report = await (this.args.runSetup ?? runClaudeProfileSetupInWorker)({
      dataRoot: this.args.dataRoot,
      profile,
      userHome: this.args.userHome(),
      userConfigDir: this.args.userConfigDir(),
      hooks,
      claudeVersion: claudeVersion ?? undefined
    })
    if (report.outcome === 'prepared') {
      await getClaudeAgentViewService(this.args.dataRoot).prepareProfile(profile.home)
    }
    if (report.outcome === 'refused' || report.warnings.length > 0) {
      console.warn('[claude-profile] Account setup was incomplete:', report)
    }
    return report
  }
}
