'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Store,
  Copy,
  ExternalLink,
  Check,
  AlertTriangle,
  Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { canEditSettings } from '@/lib/auth/roles'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import { suggestSlug } from '@/lib/storefront/slug'
import { StorefrontProductsManager } from './storefront-products-manager'

type CloseMode = 'whatsapp' | 'momo' | 'both'

interface Lead {
  id: string
  visitor_name: string | null
  visitor_phone: string | null
  last_message: string | null
  message_count: number
  status: 'new' | 'contacted' | 'closed'
  handed_off: boolean
  created_at: string
  updated_at: string
}

const STATUS_STYLE: Record<Lead['status'], string> = {
  new: 'border-primary/40 bg-primary/10 text-primary',
  contacted: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
  closed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
}

export function StorefrontManager() {
  const { accountRole, profileLoading } = useAuth()
  const canEdit = accountRole ? canEditSettings(accountRole) : false

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [tagline, setTagline] = useState('')
  const [ownerWhatsapp, setOwnerWhatsapp] = useState('')
  const [greeting, setGreeting] = useState('')
  const [momoInstructions, setMomoInstructions] = useState('')
  const [closeMode, setCloseMode] = useState<CloseMode>('both')
  const [isPublished, setIsPublished] = useState(false)

  const [hasAccountKey, setHasAccountKey] = useState(false)
  const [hasGlobalKey, setHasGlobalKey] = useState(false)

  const [leads, setLeads] = useState<Lead[]>([])

  const publicUrl =
    typeof window !== 'undefined' && slug
      ? `${window.location.origin}/${slug}`
      : ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/storefront')
      const data = await res.json()
      if (res.ok) {
        if (data.storefront) {
          const s = data.storefront
          setSlug(s.slug ?? '')
          setSlugTouched(true)
          setDisplayName(s.display_name ?? '')
          setTagline(s.tagline ?? '')
          setOwnerWhatsapp(s.owner_whatsapp ?? '')
          setGreeting(s.greeting ?? '')
          setMomoInstructions(s.momo_instructions ?? '')
          setCloseMode((s.close_mode as CloseMode) ?? 'both')
          setIsPublished(Boolean(s.is_published))
        }
        setHasAccountKey(Boolean(data.ai?.has_account_key))
        setHasGlobalKey(Boolean(data.ai?.has_global_key))
      } else {
        toast.error(data.error ?? 'Failed to load storefront')
      }
    } catch {
      toast.error('Failed to load storefront')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLeads = useCallback(async () => {
    try {
      const res = await fetch('/api/storefront/leads')
      const data = await res.json()
      if (res.ok) setLeads(data.leads ?? [])
    } catch {
      // best-effort
    }
  }, [])

  useEffect(() => {
    void load()
    void loadLeads()
  }, [load, loadLeads])

  // Suggest a slug from the business name until the user edits it.
  const onDisplayName = (v: string) => {
    setDisplayName(v)
    if (!slugTouched) setSlug(suggestSlug(v))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/storefront', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          display_name: displayName,
          tagline,
          owner_whatsapp: ownerWhatsapp,
          greeting,
          momo_instructions: momoInstructions,
          close_mode: closeMode,
          is_published: isPublished,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Storefront saved')
        await load()
      } else {
        toast.error(data.error ?? 'Failed to save')
      }
    } catch {
      toast.error('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const copyLink = async () => {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy — copy it manually')
    }
  }

  const updateLeadStatus = async (id: string, status: Lead['status']) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
    try {
      await fetch('/api/storefront/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
    } catch {
      toast.error('Could not update lead')
    }
  }

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  const aiReady = hasAccountKey || hasGlobalKey
  const disabled = !canEdit || saving

  return (
    <div className="space-y-6">
      {!canEdit && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Only admins and owners can edit the storefront.
        </p>
      )}

      {!aiReady && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            No AI key is configured yet, so the agent can&apos;t reply. Add a
            Gemini key in <strong>AI Agents → Setup</strong>, or ask the operator
            to set a global key.
          </span>
        </div>
      )}

      {/* Public link */}
      {slug && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="h-4 w-4 text-primary" /> Your sales page link
            </CardTitle>
            <CardDescription>
              Share this link in your WhatsApp status, Facebook/Instagram bio,
              and ads. Customers chat with your AI agent and order — no app to
              install.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 text-sm">
                {publicUrl || `/${slug}`}
              </code>
              <Button variant="outline" onClick={copyLink} disabled={!publicUrl}>
                {copied ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {isPublished && publicUrl && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: 'outline' }))}
                >
                  <ExternalLink className="mr-2 h-4 w-4" /> Open
                </a>
              )}
            </div>
            {!isPublished && (
              <p className="mt-2 text-xs text-muted-foreground">
                Not published yet — turn on <strong>Publish</strong> below to make
                the link live.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Storefront details</CardTitle>
          <CardDescription>
            What your customers see. The AI answers from your business info and
            knowledge base (set under AI Agents).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sf-name">Business name</Label>
              <Input
                id="sf-name"
                value={displayName}
                onChange={(e) => onDisplayName(e.target.value)}
                placeholder="Mvog-Ada Boutique"
                disabled={disabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sf-slug">Link name</Label>
              <Input
                id="sf-slug"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value.toLowerCase())
                  setSlugTouched(true)
                }}
                placeholder="mvog-ada-boutique"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and hyphens. This is the end of your
                link.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sf-tagline">Tagline (optional)</Label>
            <Input
              id="sf-tagline"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Fresh fashion, delivered in Yaoundé"
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sf-greeting">Welcome message (optional)</Label>
            <Textarea
              id="sf-greeting"
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Bonjour 👋 Bienvenue ! How can I help you today? / Comment puis-je vous aider ?"
              rows={2}
              disabled={disabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sf-close">How to close the sale</Label>
            <Select
              value={closeMode}
              onValueChange={(v) => setCloseMode(v as CloseMode)}
              disabled={disabled}
            >
              <SelectTrigger id="sf-close">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="both">
                  WhatsApp + Mobile Money (recommended)
                </SelectItem>
                <SelectItem value="whatsapp">WhatsApp handoff only</SelectItem>
                <SelectItem value="momo">Mobile Money only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {closeMode !== 'momo' && (
            <div className="space-y-2">
              <Label htmlFor="sf-wa">Your WhatsApp number</Label>
              <Input
                id="sf-wa"
                value={ownerWhatsapp}
                onChange={(e) => setOwnerWhatsapp(e.target.value)}
                placeholder="2376XXXXXXXX"
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                International format, digits only (country code + number). The
                &quot;Order on WhatsApp&quot; button opens a chat with this
                number — your normal WhatsApp, no API needed.
              </p>
            </div>
          )}

          {closeMode !== 'whatsapp' && (
            <div className="space-y-2">
              <Label htmlFor="sf-momo">Mobile Money instructions</Label>
              <Textarea
                id="sf-momo"
                value={momoInstructions}
                onChange={(e) => setMomoInstructions(e.target.value)}
                placeholder={
                  'MTN MoMo: 67X XXX XXX (Name)\nOrange Money: 69X XXX XXX (Name)\nSend payment, then share the screenshot to confirm your order.'
                }
                rows={3}
                disabled={disabled}
              />
            </div>
          )}

          <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Publish</p>
              <p className="text-xs text-muted-foreground">
                Make the link live so customers can chat with your agent.
              </p>
            </div>
            <Switch
              checked={isPublished}
              onCheckedChange={setIsPublished}
              disabled={disabled}
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={disabled}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save storefront
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      <StorefrontProductsManager />

      {/* Leads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Leads
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {leads.length}
            </span>
          </CardTitle>
          <CardDescription>
            People who chatted with your sales page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No leads yet. Share your link to start getting customers.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {leads.map((lead) => (
                <li
                  key={lead.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLE[lead.status]}`}
                      >
                        {lead.status}
                      </span>
                      {lead.handed_off && (
                        <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-500">
                          WhatsApp
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {lead.message_count} msg
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-foreground">
                      {lead.last_message || '(no message captured)'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(lead.updated_at).toLocaleString()}
                    </p>
                  </div>
                  <Select
                    value={lead.status}
                    onValueChange={(v) =>
                      updateLeadStatus(lead.id, v as Lead['status'])
                    }
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
