import React from 'react'

type TabItem<T extends string> = {
    id: T
    label: string
    icon?: React.ReactNode
}

type Props<T extends string> = {
    items: TabItem<T>[]
    active: T
    onChange: (id: T) => void
}

export default function PortalTabBar<T extends string>({ items, active, onChange }: Props<T>) {
    return (
        <div className="flex gap-2 border-b pb-0" style={{ borderColor: '#FFE8F0' }}>
            {items.map(item => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => onChange(item.id)}
                    className={`flex items-center gap-2 px-4 py-3 font-black text-sm rounded-t-2xl transition-all border-b-2 -mb-px ${
                        active === item.id
                            ? 'text-pink-600 border-pink-400 bg-pink-50'
                            : 'text-gray-400 border-transparent hover:text-gray-600'
                    }`}
                >
                    {item.icon}
                    {item.label}
                </button>
            ))}
        </div>
    )
}
