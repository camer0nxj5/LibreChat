import { Button } from '@librechat/client';

type ActionCardProps<T extends string> = {
  title: string;
  message: string;
  actions: ReadonlyArray<{ id: T; label: string }>;
  onAction: (id: T) => void;
  disabled?: boolean;
};

/** Plain text and typed actions; never evaluates provider HTML, scripts, or URLs. */
export default function ActionCard<T extends string>({
  title,
  message,
  actions,
  onAction,
  disabled = false,
}: ActionCardProps<T>) {
  return (
    <section
      aria-label={title}
      aria-live="polite"
      className="mb-3 rounded-xl border border-border-light bg-surface-secondary p-4"
    >
      <p className="mb-3 whitespace-pre-wrap text-text-primary">{message}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
