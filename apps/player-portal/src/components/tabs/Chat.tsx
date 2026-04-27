import { useLiveChat } from '../../lib/useLiveChat';
import { MessageBubble } from '../chat/MessageBubble';

interface Props {
  actorId: string;
}

export function Chat({ actorId }: Props): React.ReactElement {
  const { messages, status, truncated } = useLiveChat(actorId);

  return (
    <div className="space-y-2">
      {truncated && (
        <p className="text-center text-xs text-pf-alt-dark">Showing recent messages only.</p>
      )}

      {messages.length === 0 && status !== 'loading' && (
        <p className="py-8 text-center text-sm text-pf-alt-dark">No messages yet.</p>
      )}

      {messages.length === 0 && status === 'loading' && (
        <p className="py-8 text-center text-sm text-pf-alt-dark">Connecting…</p>
      )}

      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}

      {status === 'disconnected' && (
        <p className="text-center text-xs text-amber-600">Reconnecting to chat stream…</p>
      )}
    </div>
  );
}
