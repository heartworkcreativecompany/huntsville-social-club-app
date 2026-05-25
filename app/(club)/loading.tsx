export default function ClubLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-24 rounded bg-border" />
      <div className="h-10 w-2/3 max-w-md rounded bg-border" />
      <div className="h-32 rounded-lg bg-border/80" />
      <div className="h-32 rounded-lg bg-border/80" />
    </div>
  )
}
