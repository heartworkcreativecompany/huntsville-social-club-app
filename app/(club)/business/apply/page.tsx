'use client'

import { useState, useTransition, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { buttonPrimaryClassName, inputClassName } from '@/lib/event-labels'
import { submitBusinessListingApplication } from '@/app/(club)/business/actions'
import { uploadBusinessListingHeaderImage } from '@/lib/business-listing-image-storage'

export default function BusinessListingApplyPage() {
  const router = useRouter()
  const [businessName, setBusinessName] = useState('')
  const [description, setDescription] = useState('')
  const [industry, setIndustry] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [city, setCity] = useState('')
  const [phone, setPhone] = useState('')
  const [clubOffer, setClubOffer] = useState('')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [headerImageName, setHeaderImageName] = useState('')
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const onHeaderImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setError('')
    setMessage('')
    setIsUploadingImage(true)
    const result = await uploadBusinessListingHeaderImage(file)
    setIsUploadingImage(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setHeaderImageUrl(result.url ?? '')
    setHeaderImageName(file.name)
  }

  const submit = () => {
    setError('')
    setMessage('')
    startTransition(async () => {
      const result = await submitBusinessListingApplication({
        businessName,
        description,
        industry,
        websiteUrl,
        city,
        phone,
        clubOffer,
        headerImageUrl,
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
        description="Listings require admin approval and appear by industry."
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
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <input
            className={inputClassName}
            placeholder="Contact Number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
          />
          <div className="grid gap-1.5">
            <input
              className={inputClassName}
              placeholder="Club Offer"
              value={clubOffer}
              onChange={(e) => setClubOffer(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Member discount or special offer for club members.
            </p>
          </div>
          <input
            className={inputClassName}
            placeholder="Website URL"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-foreground">
              Header Image / Logo
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
              disabled={isUploadingImage || isPending}
              onChange={onHeaderImageChange}
            />
            {isUploadingImage ? (
              <p className="text-xs text-muted-foreground">Uploading image…</p>
            ) : null}
            {headerImageUrl ? (
              <div className="mt-1 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={headerImageUrl}
                  alt="Header preview"
                  className="h-14 w-14 rounded-md object-cover"
                />
                <p className="text-xs text-muted-foreground">
                  {headerImageName || 'Image ready'}
                </p>
              </div>
            ) : null}
          </div>
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
            disabled={isPending || isUploadingImage}
            onClick={submit}
          >
            {isPending ? 'Submitting…' : 'Submit for approval'}
          </button>
        </div>
      </Card>
    </>
  )
}
