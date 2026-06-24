import type { ExcelTable } from "@/domain/types"

export function TablePreview(props: { table: ExcelTable; limit?: number }) {
  const rows = props.table.rows.slice(0, props.limit ?? 12)
  return (
    <div className="overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="min-w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-zinc-50 dark:bg-zinc-900">
          <tr>
            <th className="w-10 border-b border-zinc-200 px-2 py-2 text-left font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              #
            </th>
            {props.table.columns.map((c) => (
              <th
                key={c}
                className="border-b border-zinc-200 px-2 py-2 text-left font-medium text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="odd:bg-white even:bg-zinc-50 dark:odd:bg-zinc-950 dark:even:bg-zinc-900">
              <td className="border-b border-zinc-200 px-2 py-2 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">{idx + 1}</td>
              {props.table.columns.map((c) => (
                <td key={c} className="border-b border-zinc-200 px-2 py-2 text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
                  {String(r[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

