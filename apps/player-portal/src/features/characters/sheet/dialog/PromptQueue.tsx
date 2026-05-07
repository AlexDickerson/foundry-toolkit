// Subscribes to the bridge prompt stream and renders the first pending
// prompt as a modal overlay on top of whatever surface is currently shown.
//
// Shows one dialog at a time (the oldest pending prompt). After the player
// resolves it the server broadcasts a `removed` event and the hook pops the
// next item automatically — no consumer state management needed.

import { usePromptStream } from '@/_quarantine/lib/usePromptStream';
import { PromptDialog } from './PromptDialog';

export function PromptQueue(): React.ReactElement | null {
  const prompts = usePromptStream();

  // Show only the oldest pending prompt; subsequent ones queue behind it.
  const current = prompts[0];
  if (!current) return null;

  // `key` forces a fresh component mount when the bridgeId changes so form
  // state from the previous dialog doesn't bleed into the next one.
  return (
    <PromptDialog
      key={current.bridgeId}
      prompt={current}
      // Resolution is confirmed by the server's `removed` SSE event which
      // drops the item from the prompts list; onResolved is a no-op here.
      onResolved={(): void => undefined}
    />
  );
}
