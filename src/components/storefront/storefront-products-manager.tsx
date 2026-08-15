'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Package,
  Plus,
  Trash2,
  Pencil,
  ImageOff,
  Upload,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { canEditSettings } from '@/lib/auth/roles'
import { Button } from '@/components/ui/button'
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
  uploadAccountMedia,
  deleteAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media'
import { formatFcfa } from '@/lib/storefront/handoff'

const BUCKET = 'storefront-products'

interface Product {
  id: string
  name: string
  description: string | null
  price_fcfa: number
  image_url: string | null
  image_path: string | null
  is_available: boolean
}

interface Draft {
  id: string | null
  name: string
  price: string
  description: string
  image_url: string | null
  image_path: string | null
  is_available: boolean
}

const EMPTY: Draft = {
  id: null,
  name: '',
  price: '',
  description: '',
  image_url: null,
  image_path: null,
  is_available: true,
}

export function StorefrontProductsManager() {
  const { accountRole, profileLoading } = useAuth()
  const canEdit = accountRole ? canEditSettings(accountRole) : false

  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [noStorefront, setNoStorefront] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/storefront/products')
      const data = await res.json()
      if (res.ok) setProducts(data.products ?? [])
      else toast.error(data.error ?? 'Failed to load products')
    } catch {
      toast.error('Failed to load products')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const startAdd = () => setDraft({ ...EMPTY })
  const startEdit = (p: Product) =>
    setDraft({
      id: p.id,
      name: p.name,
      price: p.price_fcfa ? String(p.price_fcfa) : '',
      description: p.description ?? '',
      image_url: p.image_url,
      image_path: p.image_path,
      is_available: p.is_available,
    })
  const cancel = () => setDraft(null)

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file || !draft) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file.')
      return
    }
    if (file.size > MEDIA_MAX_BYTES_BY_KIND.image) {
      toast.error('Image is too large (max 5 MB).')
      return
    }
    setUploading(true)
    try {
      const { publicUrl, path } = await uploadAccountMedia(BUCKET, file)
      setDraft((d) => (d ? { ...d, image_url: publicUrl, image_path: path } : d))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const removeImage = () =>
    setDraft((d) => (d ? { ...d, image_url: null, image_path: null } : d))

  const save = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      toast.error('Product name is required')
      return
    }
    setSaving(true)
    const payload = {
      name: draft.name.trim(),
      price_fcfa: Math.max(0, Math.floor(Number(draft.price) || 0)),
      description: draft.description.trim() || null,
      image_url: draft.image_url,
      image_path: draft.image_path,
      is_available: draft.is_available,
    }
    try {
      const res = draft.id
        ? await fetch(`/api/storefront/products/${draft.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/storefront/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await res.json()
      if (res.ok) {
        toast.success(draft.id ? 'Product updated' : 'Product added')
        setDraft(null)
        await load()
      } else {
        if (res.status === 400 && /storefront first/i.test(data.error ?? '')) {
          setNoStorefront(true)
        }
        toast.error(data.error ?? 'Failed to save product')
      }
    } catch {
      toast.error('Failed to save product')
    } finally {
      setSaving(false)
    }
  }

  const toggleAvailable = async (p: Product) => {
    setProducts((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, is_available: !x.is_available } : x)),
    )
    try {
      await fetch(`/api/storefront/products/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !p.is_available }),
      })
    } catch {
      toast.error('Could not update availability')
      void load()
    }
  }

  const remove = async (p: Product) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    setProducts((prev) => prev.filter((x) => x.id !== p.id))
    try {
      const res = await fetch(`/api/storefront/products/${p.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Failed to delete')
        void load()
        return
      }
      // Best-effort image cleanup.
      if (p.image_path) void deleteAccountMedia(BUCKET, p.image_path).catch(() => {})
    } catch {
      toast.error('Failed to delete')
      void load()
    }
  }

  if (loading || profileLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading products…
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" /> Products
          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
            {products.length}
          </span>
        </CardTitle>
        <CardDescription>
          Photos and prices shoppers browse on your page. The AI also uses these to
          answer &quot;how much&quot; and &quot;do you have…&quot; questions.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {noStorefront && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
            Save your storefront details above first, then add products.
          </p>
        )}

        {/* Product list */}
        {products.length > 0 && (
          <ul className="divide-y divide-border">
            {products.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.price_fcfa > 0 ? formatFcfa(p.price_fcfa) : 'Ask us'}
                    {!p.is_available && ' · hidden'}
                  </p>
                </div>
                <Switch
                  checked={p.is_available}
                  onCheckedChange={() => toggleAvailable(p)}
                  disabled={!canEdit}
                  aria-label="Available"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => startEdit(p)}
                  disabled={!canEdit}
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(p)}
                  disabled={!canEdit}
                  aria-label="Delete"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Add / edit form */}
        {draft ? (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {draft.id ? 'Edit product' : 'New product'}
              </p>
              <Button variant="ghost" size="icon-sm" onClick={cancel} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-start gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {draft.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.image_url}
                    alt="Preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageOff className="h-5 w-5" />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickFile}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {draft.image_url ? 'Change photo' : 'Upload photo'}
                </Button>
                {draft.image_url && (
                  <Button
                    variant="ghost"
                    onClick={removeImage}
                    className="text-destructive hover:text-destructive"
                  >
                    Remove
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">JPG/PNG/WebP, max 5 MB.</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Robe rouge"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Price (FCFA)</Label>
                <Input
                  id="p-price"
                  type="number"
                  min={0}
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  placeholder="18000"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Description (optional)</Label>
              <Textarea
                id="p-desc"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Coton, tailles S–L, plusieurs couleurs"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <span className="text-sm">Show on the page</span>
              <Switch
                checked={draft.is_available}
                onCheckedChange={(v) => setDraft({ ...draft, is_available: v })}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || uploading}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {draft.id ? 'Save changes' : 'Add product'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={startAdd} disabled={!canEdit}>
            <Plus className="mr-2 h-4 w-4" /> Add product
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
