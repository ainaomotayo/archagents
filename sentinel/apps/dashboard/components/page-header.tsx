interface PageHeaderProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 pb-1">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-text-primary">
          {title}
        </h1>
        <p className="mt-1 text-[13px] text-text-secondary">{description}</p>
      </div>
      {action}
    </div>
  );
}
