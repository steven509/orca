import React, { useId } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { AgentAccountChoice } from '@/lib/agent-account-choices'

export type ComposerAgentAccountField = {
  providerLabel: string
  choices: AgentAccountChoice[]
  value: string
  onValueChange: (accountId: string) => void
}

export function NewWorkspaceComposerAgentAccountField({
  field
}: {
  field: ComposerAgentAccountField
}): React.JSX.Element {
  const labelId = useId()
  return (
    <div className="min-w-0 space-y-1">
      <label id={labelId} className="text-xs font-medium text-muted-foreground">
        {translate('components.newWorkspace.agentAccount', '{{provider}} account', {
          provider: field.providerLabel
        })}
      </label>
      <Select
        value={field.value}
        onValueChange={field.onValueChange}
        // A single allowed account is informational: the project pins it.
        disabled={field.choices.length < 2}
      >
        <SelectTrigger className="w-full min-w-0" aria-labelledby={labelId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.choices.map((choice) => (
            <SelectItem key={choice.id} value={choice.id}>
              {choice.detail ? `${choice.label} (${choice.detail})` : choice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
