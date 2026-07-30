const PER_PAGE_OPTIONS = [10, 25, 50, 100, 250, 500];

function getPageRange(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range: (number | "...")[] = [1];
  if (current > 3) range.push("...");
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) range.push(i);
  if (current < total - 2) range.push("...");
  range.push(total);
  return range;
}

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  itemLabel?: string;
}

export function Pagination({ page, total, limit, onPageChange, onLimitChange, itemLabel = "items" }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageOptions = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-border">
      <p className="text-sm text-muted-foreground whitespace-nowrap">
        Page <span className="font-semibold text-foreground">{page}</span> of{" "}
        <span className="font-semibold text-foreground">{totalPages}</span>{" "}
        <span>({total.toLocaleString()} {itemLabel})</span>
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Per page:</span>
          <select
            value={limit}
            onChange={e => { onLimitChange(Number(e.target.value)); onPageChange(1); }}
            className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
          >
            {PER_PAGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Go to:</span>
          <select
            value={page}
            onChange={e => onPageChange(Number(e.target.value))}
            className="border border-border rounded-lg px-2 py-1.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer min-w-[60px]"
          >
            {pageOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>

          <div className="hidden sm:flex items-center gap-1">
            {getPageRange(page, totalPages).map((p, i) => p === "..." ? (
              <span key={`dots-${i}`} className="px-2 text-muted-foreground text-sm">...</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${p === page ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"}`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm font-medium text-muted-foreground border border-border rounded-lg hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
