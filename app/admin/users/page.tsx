import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RoleUpdate from './role-update'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (currentProfile?.role !== 'admin') {
    return (
      <main style={{ maxWidth: '720px', margin: '80px auto', padding: '24px' }}>
        <p>You do not have access to this page.</p>
        <p style={{ marginTop: '16px' }}>
          <Link href="/members">Back to Members</Link>
        </p>
      </main>
    )
  }

  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .order('email', { ascending: true })

  return (
    <main style={{ maxWidth: '720px', margin: '80px auto', padding: '24px' }}>
      <p style={{ marginBottom: '16px' }}>
        <Link href="/members">← Back to Members</Link>
      </p>

      <h1 style={{ marginBottom: '16px' }}>Manage Users</h1>
      <p style={{ marginBottom: '8px' }}>Signed in as admin: {user.email}</p>
      <p style={{ marginBottom: '24px', fontSize: '14px', color: '#555' }}>
        Admins cannot change their own role here.
      </p>

      {error ? (
        <p style={{ color: '#b00020' }}>Could not load users: {error.message}</p>
      ) : !users?.length ? (
        <p>No users found.</p>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {users.map((profile) => (
            <div
              key={profile.id}
              style={{
                padding: '12px',
                border: '1px solid #ccc',
                borderRadius: '8px',
                display: 'grid',
                gap: '8px',
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>
                {profile.full_name ?? profile.email ?? 'Unknown member'}
              </p>
              <p style={{ margin: 0, fontSize: '14px' }}>
                Email: {profile.email ?? 'Not set'}
              </p>
              {profile.id === user.id ? (
                <div style={{ fontSize: '14px' }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Current account</p>
                  <p style={{ margin: '4px 0 0' }}>
                    Role: {profile.role ?? 'member'}
                  </p>
                </div>
              ) : (
                <>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    Current role: {profile.role ?? 'member'}
                  </p>
                  <RoleUpdate
                    userId={profile.id}
                    currentRole={profile.role ?? 'member'}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
