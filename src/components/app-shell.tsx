"use client";

import dynamic from "next/dynamic";

/**
 * The workspace reads chat history and CRM state from localStorage on first
 * render, so it is rendered on the client only (no hydration mismatch).
 */
const Workspace = dynamic(() => import("./workspace"), {
  ssr: false,
  loading: () => <WorkspaceSkeleton />,
});

export function AppShell() {
  return <Workspace />;
}

function WorkspaceSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <div className="h-16 border-b border-zinc-200 bg-white dark:border-zinc-800/80 dark:bg-zinc-950" />
      <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:p-6">
        <div className="h-[70dvh] animate-pulse rounded-2xl bg-zinc-200/70 lg:h-auto dark:bg-zinc-800/50" />
        <div className="hidden flex-col gap-4 lg:flex">
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/50" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/50" />
          <div className="flex-1 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/50" />
        </div>
      </div>
    </div>
  );
}
