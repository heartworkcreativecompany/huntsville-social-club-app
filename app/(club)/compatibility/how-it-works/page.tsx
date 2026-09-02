import Link from 'next/link'
import { redirect } from 'next/navigation'
import HowCompatibilityWorksContent from '@/components/compatibility/how-compatibility-works-content'
import Card from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import { isCompatibilityFeatureEnabled } from '@/lib/compatibility/eligibility'
import { getViewer } from '@/lib/viewer'

export default async function HowCompatibilityWorksPage() {
  const viewer = await getViewer()

  if (!viewer) {
    redirect('/login')
  }

  if (!viewer.canAccessApp) {
    redirect('/application')
  }

  return (
    <>
      <PageHeader
        eyebrow="Curated matches"
        title="How compatibility works"
        description="A straightforward overview of how we recommend members — and what stays private."
      />

      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link
          href="/matches/dating"
          className="text-muted-foreground hover:text-foreground"
        >
          ← Dating Matches
        </Link>
        <Link
          href="/compatibility"
          className="text-muted-foreground hover:text-foreground"
        >
          Compatibility questionnaire
        </Link>
      </div>

      {!isCompatibilityFeatureEnabled() ? (
        <Card className="mb-6">
          <p className="text-sm text-muted-foreground">
            Curated matching is not enabled in this environment. The overview
            below describes how it works when the feature is turned on.
          </p>
        </Card>
      ) : null}

      <Card>
        <HowCompatibilityWorksContent />
      </Card>
    </>
  )
}
