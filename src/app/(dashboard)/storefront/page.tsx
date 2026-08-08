'use client'

import { Store } from 'lucide-react'
import { StorefrontManager } from '@/components/storefront/storefront-manager'

export default function StorefrontPage() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Store className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Storefront
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Your AI sales page — a shareable link where customers chat with your
        agent and order, no WhatsApp API required.
      </p>

      <div className="mt-6">
        <StorefrontManager />
      </div>
    </div>
  )
}
