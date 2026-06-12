import { Inbox } from "lucide-react";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] py-16 text-center">
      <Icon className="mb-3 h-10 w-10 text-[var(--muted-foreground)]" />
      <h3 className="text-sm font-medium">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--muted-foreground)]">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
