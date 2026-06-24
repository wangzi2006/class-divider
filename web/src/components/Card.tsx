import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

export function Card(props: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-zinc-200 bg-white/70 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/60", props.className)}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{props.title}</h2>
        {props.right}
      </div>
      <div className="p-4">{props.children}</div>
    </section>
  )
}

