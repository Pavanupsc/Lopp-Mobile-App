import LoginForm from '@/app/components/LoginForm'

export default async function LoginPage({ searchParams }) {
  const params = await searchParams
  const authError =
    params?.error === 'auth'
      ? 'Authentication failed. Please try again.'
      : ''

  return (
    <main className="page-shell">
      <LoginForm authError={authError} />
    </main>
  )
}
