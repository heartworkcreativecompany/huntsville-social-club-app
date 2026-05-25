import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '../login/actions'
import ProfileForm from './profile-form'

export default async function MembersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at')
    .eq('id', user.id)
    .single()

  return (
    <main style={{ maxWidth: '420px', margin: '80px auto', padding: '24px' }}>
      <h1 style={{ marginBottom: '16px' }}>Members Area</h1>
      <p style={{ marginBottom: '8px' }}>Signed in as: {user.email}</p>

      {error ? (
        <p style={{ marginBottom: '16px', color: '#b00020' }}>
          Could not load profile: {error.message}
        </p>
      ) : !profile ? (
        <p style={{ marginBottom: '16px' }}>
          No profile row found yet for this account.
        </p>
      ) : (
        <div style={{ marginBottom: '16px', display: 'grid', gap: '8px' }}>
          <p>Profile email: {profile.email ?? 'Not set yet'}</p>
          <p>Full name: {profile.full_name ?? 'Not set yet'}</p>
        </div>
      )}

      <ProfileForm
        userId={user.id}
        email={profile?.email ?? user.email ?? ''}
        fullName={profile?.full_name ?? null}
      />

      <form action={signOut}>
        <button
          type="submit"
          style={{ padding: '12px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}
        >
          Log Out
        </button>
      </form>
    </main>
  )
}
