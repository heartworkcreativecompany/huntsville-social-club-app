'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'
import { submitBusinessListingApplication } from '@/app/(club)/business/actions'

export default function BusinessListingApplyPage() {
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [description, setDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [category, setCategory] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [city, setCity] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    setError('')
    setMessage('')
    startTransition(async () => {
      const result = await submitBusinessListingApplication({
        businessName,
        description,
        industry,
        category,
        websiteUrl,
        city,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setMessage('Listing submitted for admin approval.')
      router.refresh()
    })
  }

  return (
    <>
      <Link
        href="/business"
        className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground"
      >
        ← Business Directory
      </Link>
      <PageHeader
        eyebrow="Elite Circle"
        title="Apply for a listing"
        description="Listings require admin approval and appear by industry/category."
      />
      <Card>
        <div className="grid gap-4">
          <input
            className={inputClassName}
            placeholder="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <input
            className={inputClassName}
            placeholder="Industry (e.g. Technology)"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
          <input
            className={inputClassName}
            placeholder="Category (e.g. Software)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            className={inputClassName}
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <input
            className={inputClassName}
            placeholder="Website URL"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
          <textarea
            className={`${inputClassName} min-h-[120px]`}
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <button
            type="button"
            className={buttonPrimaryClassName}
            disabled={isPending}
            onClick={submit}
          >
            {isPending ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </Card>
    </>
  )
}
