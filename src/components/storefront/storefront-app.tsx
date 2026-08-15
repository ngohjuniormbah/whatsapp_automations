'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Loader2,
  Send,
  MessageCircle,
  ShoppingBag,
  ShoppingCart,
} from 'lucide-react'
import type { ChatMessage } from '@/lib/ai/types'
import type { Product } from '@/lib/storefront/config'
import {
  buildOrderSummary,
  buildCartOrderSummary,
  buildWaMeLink,
  formatFcfa,
  type OrderItem,
} from '@/lib/storefront/handoff'
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

type Tab = 'shop' | 'chat'

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
  const { slug, displayName, tagline, greeting, ownerWhatsapp, closeMode, products } =
    props

  const hasProducts = products.length > 0
  const canWhatsApp = closeMode !== 'momo' && Boolean(ownerWhatsapp)

  const [tab, setTab] = useState<Tab>(hasProducts ? 'shop' : 'chat')
  const [cart, setCart] = useState<Record<string, number>>({})

  // Chat state
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
    if (tab === 'chat') {
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [messages, sending, tab])

  const productById = useMemo(() => {
    const m = new Map<string, Product>()
    products.forEach((p) => m.set(p.id, p))
    return m
  }, [products])

  const cartItems: OrderItem[] = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const p = productById.get(id)
          if (!p) return null
          return { name: p.name, priceFcfa: p.priceFcfa, quantity: qty }
        })
        .filter((x): x is OrderItem => x !== null),
    [cart, productById],
  )

  const cartCount = useMemo(
    () => Object.values(cart).reduce((a, b) => a + b, 0),
    [cart],
  )
  const cartTotal = useMemo(
    () => cartItems.reduce((sum, it) => sum + it.priceFcfa * it.quantity, 0),
    [cartItems],
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

  const markHandoff = useCallback(() => {
    try {
      const payload = JSON.stringify({ session_id: sessionRef.current, handoff: true })
      const url = `/api/agent/${encodeURIComponent(slug)}`
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
      } else {
        void fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        })
      }
    } catch {
      /* best-effort */
    }
  }, [slug])

  const orderCartOnWhatsApp = useCallback(() => {
    if (cartItems.length === 0) return
    const text = buildCartOrderSummary({ businessName: displayName, items: cartItems })
    const link = buildWaMeLink({ ownerWhatsapp, text })
    if (!link) return
    markHandoff()
    window.open(link, '_blank', 'noopener,noreferrer')
  }, [cartItems, displayName, ownerWhatsapp, markHandoff])

  const orderChatOnWhatsApp = useCallback(() => {
    const text = buildOrderSummary({
      businessName: displayName,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })
    const link = buildWaMeLink({ ownerWhatsapp, text })
    if (!link) return
    markHandoff()
    window.open(link, '_blank', 'noopener,noreferrer')
  }, [displayName, messages, ownerWhatsapp, markHandoff])

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
      setChatError('Network error — please check your connection and try again.')
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

  // Cart order bar — the primary "close" for the shop.
  const cartBar =
    cartCount > 0 ? (
      <div className="shrink-0 border-t border-border bg-card px-3 py-3">
        {canWhatsApp ? (
          <button
            type="button"
            onClick={orderCartOnWhatsApp}
            className="flex w-full items-center justify-between gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <span className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Order on WhatsApp
            </span>
            <span className="tabular-nums">
              {cartCount} item{cartCount > 1 ? 's' : ''}
              {cartTotal > 0 ? ` · ${formatFcfa(cartTotal)}` : ''}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTab('chat')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            <ShoppingCart className="h-4 w-4" />
            Checkout in Chat ({cartCount})
          </button>
        )}
      </div>
    ) : null

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col bg-background">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShoppingBag className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-foreground">
            {displayName}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {tagline || 'Online now — shop or ask us anything'}
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

      {/* Tabs */}
      {hasProducts && (
        <div className="flex shrink-0 gap-1 border-b border-border bg-card px-3 py-2">
          <TabButton active={tab === 'shop'} onClick={() => setTab('shop')}>
            <ShoppingBag className="h-4 w-4" /> Shop
          </TabButton>
          <TabButton active={tab === 'chat'} onClick={() => setTab('chat')}>
            <MessageCircle className="h-4 w-4" /> Chat
          </TabButton>
        </div>
      )}

      {/* Body */}
      {tab === 'shop' ? (
        <>
          <div className="flex flex-1 flex-col overflow-hidden">
            <StorefrontCatalog
              products={products}
              cart={cart}
              onAdd={addToCart}
              onRemove={removeFromCart}
            />
          </div>
          {cartBar}
        </>
      ) : (
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
                  Ask about products, prices, or delivery — I&apos;m here to help.
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

          {/* Cart bar (if items) OR a chat-based WhatsApp order fallback */}
          {cartCount > 0
            ? cartBar
            : canWhatsApp &&
              messages.some((m) => m.role === 'user') && (
                <div className="shrink-0 px-4 pb-2">
                  <button
                    type="button"
                    onClick={orderChatOnWhatsApp}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Order on WhatsApp
                  </button>
                </div>
              )}

          {/* Composer */}
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
        (active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted')
      }
    >
      {children}
    </button>
  )
}
