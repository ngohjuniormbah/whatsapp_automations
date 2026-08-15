'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  Send,
  MessageCircle,
  ShoppingBag,
  CalendarClock,
  Clock,
  X,
  CheckCircle2,
} from 'lucide-react'
import type { ChatMessage } from '@/lib/ai/types'
import type { Product } from '@/lib/storefront/config'
import { formatFcfa } from '@/lib/storefront/handoff'
import { StorefrontCatalog } from './storefront-catalog'

export interface StorefrontAppProps {
  slug: string
  displayName: string
  tagline: string | null
  greeting: string | null
  ownerWhatsapp: string | null
  closeMode: 'whatsapp' | 'momo' | 'both'
  products: Product[]
}

interface UiMessage extends ChatMessage {
  id: string
}
type Tab = 'shop' | 'book' | 'chat'
type Checkout =
  | { mode: 'order' }
  | { mode: 'booking'; service: Product }
  | null

function newId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function getSessionId(slug: string): string {
  const key = `sf_session_${slug}`
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : newId()
    localStorage.setItem(key, id)
    return id
  } catch {
    return newId()
  }
}

export function StorefrontApp(props: StorefrontAppProps) {
  const { slug, displayName, tagline, greeting, products } = props

  const goods = useMemo(() => products.filter((p) => p.kind !== 'service'), [products])
  const services = useMemo(() => products.filter((p) => p.kind === 'service'), [products])
  const hasShop = goods.length > 0
  const hasBook = services.length > 0

  const [tab, setTab] = useState<Tab>(hasShop ? 'shop' : hasBook ? 'book' : 'chat')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [checkout, setCheckout] = useState<Checkout>(null)

  // Chat
  const [messages, setMessages] = useState<UiMessage[]>(() =>
    greeting ? [{ id: newId(), role: 'assistant', content: greeting }] : [],
  )
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const sessionRef = useRef<string>('')
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    sessionRef.current = getSessionId(slug)
  }, [slug])
  useEffect(() => {
    if (tab === 'chat')
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: 'smooth',
      })
  }, [messages, sending, tab])

  const productById = useMemo(() => {
    const m = new Map<string, Product>()
    goods.forEach((p) => m.set(p.id, p))
    return m
  }, [goods])

  const cartCount = useMemo(() => Object.values(cart).reduce((a, b) => a + b, 0), [cart])
  const cartTotal = useMemo(
    () =>
      Object.entries(cart).reduce((sum, [id, qty]) => {
        const p = productById.get(id)
        return sum + (p ? p.priceFcfa * qty : 0)
      }, 0),
    [cart, productById],
  )

  const addToCart = useCallback((id: string) => {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }))
  }, [])
  const removeFromCart = useCallback((id: string) => {
    setCart((c) => {
      const next = { ...c }
      const q = (next[id] ?? 0) - 1
      if (q <= 0) delete next[id]
      else next[id] = q
      return next
    })
  }, [])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setChatError(null)
    const userMsg: UiMessage = { id: newId(), role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setSending(true)
    try {
      const res = await fetch(`/api/agent/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionRef.current,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setChatError(data.error ?? "Sorry, I couldn't respond. Please try again.")
        return
      }
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'assistant', content: String(data.reply ?? '') },
      ])
    } catch {
      setChatError('Network error — please try again.')
    } finally {
      setSending(false)
    }
  }, [input, sending, messages, slug])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  const cartItemsForSubmit = () =>
    Object.entries(cart).map(([id, quantity]) => ({ id, quantity }))

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-foreground">
            {displayName}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {tagline || 'Online now — shop, book or ask us anything'}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-500">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Online
        </span>
      </header>

      {(hasShop || hasBook) && (
        <div className="flex shrink-0 gap-1 border-b border-border bg-card px-3 py-2">
          {hasShop && (
            <TabButton active={tab === 'shop'} onClick={() => setTab('shop')}>
              <ShoppingBag className="h-4 w-4" /> Shop
              {cartCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </TabButton>
          )}
          {hasBook && (
            <TabButton active={tab === 'book'} onClick={() => setTab('book')}>
              <CalendarClock className="h-4 w-4" /> Book
            </TabButton>
          )}
          <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
            <MessageCircle className="h-4 w-4" /> Chat
          </TabButton>
        </div>
      )}

      {/* SHOP */}
      {tab === 'shop' && (
        <>
          <div className="flex flex-1 flex-col overflow-hidden">
            <StorefrontCatalog
              products={goods}
              cart={cart}
              onAdd={addToCart}
              onRemove={removeFromCart}
            />
          </div>
          {cartCount > 0 && (
            <div className="shrink-0 border-t border-border bg-card px-3 py-3">
              <button
                type="button"
                onClick={() => setCheckout({ mode: 'order' })}
                className="flex w-full items-center justify-between gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                <span className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> Checkout on WhatsApp
                </span>
                <span className="tabular-nums">
                  {cartCount} item{cartCount > 1 ? 's' : ''}
                  {cartTotal > 0 ? ` · ${formatFcfa(cartTotal)}` : ''}
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {/* BOOK */}
      {tab === 'book' && (
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {services.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
            >
              {s.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.imageUrl}
                  alt={s.name}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CalendarClock className="h-6 w-6" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.priceFcfa > 0 ? formatFcfa(s.priceFcfa) : 'Ask us'}
                  {s.durationMin ? ` · ${s.durationMin} min` : ''}
                </p>
                {s.description && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                    {s.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCheckout({ mode: 'booking', service: s })}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                Book
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CHAT */}
      {tab === 'chat' && (
        <>
          <div
            ref={threadRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            aria-live="polite"
          >
            {messages.length === 0 && (
              <div className="mt-10 flex flex-col items-center gap-2 text-center text-muted-foreground">
                <MessageCircle className="h-8 w-8" />
                <p className="text-sm">
                  Ask about products, prices, delivery or booking — I&apos;m here to help.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ' +
                    (m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted text-foreground')
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
                </div>
              </div>
            )}
            {chatError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                {chatError}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-end gap-2 border-t border-border bg-card px-3 py-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Type your message…"
              className="max-h-32 flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </>
      )}

      <p className="shrink-0 py-1.5 text-center text-[10px] text-muted-foreground">
        AI assistant · replies may not be perfect
      </p>

      {checkout && (
        <CheckoutSheet
          slug={slug}
          checkout={checkout}
          sessionId={sessionRef.current}
          items={cartItemsForSubmit()}
          onClose={() => setCheckout(null)}
          onOrderDone={() => setCart({})}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ' +
        (active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')
      }
    >
      {children}
    </button>
  )
}

function CheckoutSheet({
  slug,
  checkout,
  sessionId,
  items,
  onClose,
  onOrderDone,
}: {
  slug: string
  checkout: Exclude<Checkout, null>
  sessionId: string
  items: { id: string; quantity: number }[]
  onClose: () => void
  onOrderDone: () => void
}) {
  const isBooking = checkout.mode === 'booking'
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneUrl, setDoneUrl] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async () => {
    if (phone.trim().replace(/\D/g, '').length < 6) {
      setError('Please enter a valid phone number so we can reach you.')
      return
    }
    if (isBooking && !date) {
      setError('Please pick a date.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        session_id: sessionId,
        kind: checkout.mode,
        customer_name: name,
        customer_phone: phone,
        note,
      }
      if (isBooking) {
        payload.service_id = checkout.service.id
        payload.preferred_time = [date, time].filter(Boolean).join(' ')
      } else {
        payload.items = items
      }
      const res = await fetch(`/api/agent/${encodeURIComponent(slug)}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not send your request. Please try again.')
        return
      }
      setDone(true)
      setDoneUrl(data.whatsapp_url ?? null)
      if (!isBooking) onOrderDone()
      if (data.whatsapp_url) window.open(data.whatsapp_url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md rounded-t-2xl border-t border-border bg-card p-4 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {done
              ? 'Request sent'
              : isBooking
                ? `Book: ${checkout.service.name}`
                : 'Complete your order'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm text-foreground">
              {isBooking
                ? "Your booking request was sent. We'll confirm your time on WhatsApp."
                : "Your order was sent. We'll confirm on WhatsApp."}
            </p>
            {doneUrl && (
              <a
                href={doneUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" /> Open WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Your name (optional)
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marie"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Phone / WhatsApp number
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="6XX XXX XXX"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            {isBooking && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Clock className="h-3 w-3" /> Time
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Note (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder={isBooking ? 'Anything we should know?' : 'Delivery address, colour, size…'}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            {error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageCircle className="h-4 w-4" />
              )}
              {isBooking ? 'Send booking request' : 'Send order on WhatsApp'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
