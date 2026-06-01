import { X } from 'lucide-react'

type Props = {
    dateFrom: string
    dateTo: string
    onDateFromChange: (v: string) => void
    onDateToChange: (v: string) => void
}

export default function DateRangeFilter({ dateFrom, dateTo, onDateFromChange, onDateToChange }: Props) {
    const hasFilter = dateFrom || dateTo
    return (
        <div className="flex items-center gap-2 shrink-0">
            <input
                type="date"
                value={dateFrom}
                onChange={e => onDateFromChange(e.target.value)}
                className="px-3 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all w-[140px]"
                title="From date"
            />
            <span className="text-xs text-muted-foreground font-semibold shrink-0">—</span>
            <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={e => onDateToChange(e.target.value)}
                className="px-3 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all w-[140px]"
                title="To date"
            />
            {hasFilter && (
                <button
                    type="button"
                    onClick={() => { onDateFromChange(''); onDateToChange('') }}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-xl border-2 border-border bg-card hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-muted-foreground transition-colors shrink-0"
                    title="Clear date filter"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    )
}
