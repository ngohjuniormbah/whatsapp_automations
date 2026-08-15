'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ClipboardList, Phone } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { canSendMessages } from '@/lib/auth/roles'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatFcfa } from '@/lib/storefront/handoff'

type Status = 'new' | 'confirmed' | 'completed' | 'cancelled'

interface OrderItem {
  name: string
  quantity: number
  price_fcfa: number
}
interface Order {
  id: string
  kind: 'order' | 'booking'
  customer_name: string | null
  customer_phone: string | null
  items: OrderItem[] | null
  service_name: string | null
  preferred_time: string | null
  note: string | null
  total_fcfa: number
  status: Status
  created_at: string
}

function itemsSummary(items: OrderItem[] | null): string {
  if (!items || items.length === 0) return ''
  return items.map((i) => `${i.quantity}× ${i.name}`).join(', ')
}

export function StorefrontOrdersManager() {
  const { accountRole } = useAuth()
  const canEdit = accountRole ? canSendMessages(accountRole) : false
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<Order[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/storefront/orders')
      const data = await res.json()
      if (res.ok) setOrders(data.orders ?? [])
    } catch {
      // best-effort
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setStatus = async (id: string, status: Status) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    try {
      await fetch('/api/storefront/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
    } catch {
      toast.error('Could not update status')
      void load()
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" /> Orders &amp; Bookings
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {orders.length}
          </span>
        </CardTitle>
        <CardDescription>
          Every order and booking captured from your page — with the customer&apos;s
          contact, so nothing is lost even if they don&apos;t message you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : orders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No orders or bookings yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {orders.map((o) => (
              <li key={o.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                        o.kind === 'booking'
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
                      }`}
                    >
                      {o.kind}
                    </span>
                    {o.customer_name && (
                      <span className="text-sm font-medium text-foreground">
                        {o.customer_name}
                      </span>
                    )}
                    {o.customer_phone && (
                      <a
                        href={`tel:${o.customer_phone}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Phone className="h-3 w-3" /> {o.customer_phone}
                      </a>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-foreground">
                    {o.kind === 'booking'
                      ? `${o.service_name ?? 'Service'}${o.preferred_time ? ` · ${o.preferred_time}` : ''}`
                      : itemsSummary(o.items)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {o.total_fcfa > 0 ? `${formatFcfa(o.total_fcfa)} · ` : ''}
                    {new Date(o.created_at).toLocaleString()}
                  </p>
                  {o.note && (
                    <p className="mt-0.5 truncate text-xs italic text-muted-foreground">
                      “{o.note}”
                    </p>
                  )}
                </div>
                <Select
                  value={o.status}
                  onValueChange={(v) => setStatus(o.id, v as Status)}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
