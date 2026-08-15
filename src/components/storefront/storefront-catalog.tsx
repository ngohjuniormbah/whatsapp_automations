'use client'

import { Plus, Minus, ImageOff } from 'lucide-react'
import type { Product } from '@/lib/storefront/config'
import { formatFcfa } from '@/lib/storefront/handoff'

export interface CatalogProps {
  products: Product[]
  /** product id → quantity in cart */
  cart: Record<string, number>
  onAdd: (id: string) => void
  onRemove: (id: string) => void
}

export function StorefrontCatalog({ products, cart, onAdd, onRemove }: CatalogProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
        <ImageOff className="h-8 w-8" />
        <p className="text-sm">
          No products yet. Ask us in Chat — we&apos;re happy to help!
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 overflow-y-auto p-3">
      {products.map((p) => {
        const qty = cart[p.id] ?? 0
        return (
          <div
            key={p.id}
            className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className="relative aspect-square w-full bg-muted">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col p-2.5">
              <p className="line-clamp-2 text-sm font-medium text-foreground">
                {p.name}
              </p>
              {p.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {p.description}
                </p>
              )}
              <p className="mt-1 text-sm font-semibold text-primary">
                {p.priceFcfa > 0 ? formatFcfa(p.priceFcfa) : 'Ask us'}
              </p>

              <div className="mt-2">
                {qty === 0 ? (
                  <button
                    type="button"
                    onClick={() => onAdd(p.id)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => onRemove(p.id)}
                      aria-label={`Remove one ${p.name}`}
                      className="flex h-8 w-9 items-center justify-center text-foreground"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-sm font-semibold tabular-nums">{qty}</span>
                    <button
                      type="button"
                      onClick={() => onAdd(p.id)}
                      aria-label={`Add one ${p.name}`}
                      className="flex h-8 w-9 items-center justify-center text-primary"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
