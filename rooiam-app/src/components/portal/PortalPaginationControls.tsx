import React from 'react'

const DEFAULT_PAGE_SIZE_OPTIONS = [20, 50, 100, 500, 1000]

type Props = {
    page: number
    totalItems: number
    pageSize: number
    label: string
    onPageChange: (page: number) => void
    onPageSizeChange?: (pageSize: number) => void
    pageSizeOptions?: number[]
}

export default function PortalPaginationControls({
    page,
    totalItems,
    pageSize,
    label,
    onPageChange,
    onPageSizeChange,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: Props) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1
    const end = Math.min(totalItems, page * pageSize)

    return (
        <div className="flex flex-col gap-3 px-4 py-4 border-t bg-muted/5 sm:flex-row sm:items-center sm:justify-between flex-wrap">
            <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-muted-foreground">
                    {totalItems === 0 ? `No ${label}` : `${start}-${end} of ${totalItems} ${label}`}
                </p>
                {onPageSizeChange && (
                    <select
                        value={pageSize}
                        onChange={e => {
                            onPageSizeChange(Number(e.target.value))
                            onPageChange(1)
                        }}
                        className="px-2 py-1 rounded-xl text-xs font-black border border-border bg-white outline-none"
                    >
                        {pageSizeOptions.map(n => (
                            <option key={n} value={n}>{n} per page</option>
                        ))}
                    </select>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="px-3 py-2 rounded-xl text-xs font-black border border-border bg-white disabled:opacity-50"
                >
                    Previous
                </button>
                <span className="text-xs font-black text-muted-foreground">
                    Page {page} / {totalPages}
                </span>
                <button
                    type="button"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="px-3 py-2 rounded-xl text-xs font-black border border-border bg-white disabled:opacity-50"
                >
                    Next
                </button>
            </div>
        </div>
    )
}
