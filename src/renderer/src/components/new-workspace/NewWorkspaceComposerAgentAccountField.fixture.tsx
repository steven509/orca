import { defineFixture } from '../../component-fixtures/component-fixture'
import { NewWorkspaceComposerAgentAccountField } from './NewWorkspaceComposerAgentAccountField'

const field = {
  providerLabel: 'Claude',
  choices: [
    { id: 'system-default', label: 'System default', detail: null },
    { id: 'work', label: 'dev@company.test', detail: 'Company' }
  ],
  value: 'work',
  onValueChange: () => {}
}

export const closed = defineFixture({
  width: 420,
  render: () => <NewWorkspaceComposerAgentAccountField field={field} />
})
