export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string[] | undefined;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">{label}</label>
      {children}
      {error?.[0] ? (
        <p className="mt-1 text-xs text-red-600">{error[0]}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>
      )}
    </div>
  );
}

export function FormAlert({ error, success }: { error?: string | null; success?: string | null }) {
  if (error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (success) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>;
  return null;
}
