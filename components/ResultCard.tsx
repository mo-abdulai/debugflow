import { ReactNode } from "react";
export function ResultCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h3>
      <div className="mt-3 text-sm leading-7 text-slate-700 sm:text-base">
        {children}
      </div>
    </article>
  );
}