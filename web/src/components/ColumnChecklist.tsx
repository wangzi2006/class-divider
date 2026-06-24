import { cn } from "@/lib/utils"

export function ColumnChecklist(props: {
  columns: string[]
  value: string[]
  onChange: (next: string[]) => void
  className?: string
}) {
  const selected = new Set(props.value)
  return (
    <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-3", props.className)}>
      {props.columns.map((c) => {
        const checked = selected.has(c)
        return (
          <label
            key={c}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-zinc-700",
              checked && "border-zinc-900 dark:border-zinc-200",
            )}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-zinc-900 dark:accent-zinc-100"
              checked={checked}
              onChange={(e) => {
                const next = new Set(selected)
                if (e.target.checked) next.add(c)
                else next.delete(c)
                props.onChange(Array.from(next))
              }}
            />
            <span className="truncate">{c}</span>
          </label>
        )
      })}
    </div>
  )
}

