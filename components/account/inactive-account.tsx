import { REMOVED_ACCOUNT_MESSAGE } from '@/lib/member-removal'

export default function InactiveAccount() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-6 py-16">
      <div className="grid gap-3">
        <h1 className="text-display text-2xl font-semibold text-foreground">
          Account inactive
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {REMOVED_ACCOUNT_MESSAGE}
        </p>
      </div>
    </main>
  )
}
