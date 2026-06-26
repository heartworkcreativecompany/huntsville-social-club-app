import Card from '@/components/ui/card'
import { COMPARISON_TABLE } from '@/lib/membership-pricing-copy'

export default function PricingComparisonTable() {
  const [featureCol, memberCol, innerCol, eliteCol] = COMPARISON_TABLE.columns

  return (
    <section className="mt-16">
      <h2 className="text-display text-2xl font-semibold">Compare plans</h2>
      <Card padding="none" className="mt-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-elevated">
                <th className="px-4 py-3 font-medium text-foreground">
                  {featureCol}
                </th>
                <th className="px-4 py-3 font-medium text-foreground">
                  {memberCol}
                </th>
                <th className="px-4 py-3 font-medium text-accent">
                  {innerCol}
                </th>
                <th className="px-4 py-3 font-medium text-foreground">
                  {eliteCol}
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_TABLE.rows.map((row) => (
                <tr key={row[0]} className="border-b border-border last:border-0">
                  <th
                    scope="row"
                    className="px-4 py-3 font-medium text-foreground"
                  >
                    {row[0]}
                  </th>
                  <td className="px-4 py-3 text-muted-foreground">{row[1]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row[2]}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        {COMPARISON_TABLE.footnote}
      </p>
    </section>
  )
}
