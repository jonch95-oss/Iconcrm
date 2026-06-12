export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-display text-[1.75rem] leading-tight">{title}</h1>
        <div className="rule-bronze mt-1.5 w-10" />
        {description && (
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
