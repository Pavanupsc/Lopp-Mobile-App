import { createClient } from '@/lib/supabase/server'
import ApplicationForm from '@/app/components/ApplicationForm'
import { signOut } from '@/app/application/actions'

const DEFAULTS = {
  displayName: '',
  email: '',
  phone: '',
  timezone: 'UTC',
  avatarColor: '#46f08a',
  stake: 1000,
  dailyTarget: 15,
  daysInMonth: 30,
  model: 'all_or_nothing',
  goals: [{ title: '', meta: '', points: 5 }],
  micros: [],
}

export default async function ApplicationPage({ searchParams }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, email, phone, timezone, avatar_color')
    .eq('id', user.id)
    .maybeSingle()

  const { data: contract } = await supabase
    .from('contracts')
    .select('stake, daily_target, days_in_month, model')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  const { data: goals } = await supabase
    .from('goals')
    .select('title, meta, points, kind')
    .eq('user_id', user.id)
    .eq('active', true)
    .order('sort')

  const initialData = {
    displayName: profile?.display_name || user.user_metadata?.full_name || '',
    email: profile?.email || user.email || '',
    phone: profile?.phone || '',
    timezone: profile?.timezone || DEFAULTS.timezone,
    avatarColor: profile?.avatar_color || DEFAULTS.avatarColor,
    stake: contract?.stake ?? DEFAULTS.stake,
    dailyTarget: contract?.daily_target ?? DEFAULTS.dailyTarget,
    daysInMonth: contract?.days_in_month ?? DEFAULTS.daysInMonth,
    model: contract?.model ?? DEFAULTS.model,
    goals:
      goals?.filter((g) => g.kind === 'goal').map((g) => ({
        title: g.title,
        meta: g.meta || '',
        points: g.points,
      })) || DEFAULTS.goals,
    micros:
      goals?.filter((g) => g.kind === 'micro').map((g) => ({
        title: g.title,
        meta: g.meta || '',
        points: g.points,
      })) || DEFAULTS.micros,
  }

  if (initialData.goals.length === 0) {
    initialData.goals = DEFAULTS.goals
  }

  const submitted = (await searchParams)?.submitted === '1'

  return (
    <main className="page-shell">
      <div style={{ width: '100%', maxWidth: 640 }}>
        <form action={signOut} style={{ textAlign: 'right', marginBottom: 12 }}>
          <button
            type="submit"
            style={{
              background: 'none',
              border: 'none',
              color: '#ff7a8f',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </form>
        <ApplicationForm
          initialData={initialData}
          submitted={submitted}
        />
      </div>
    </main>
  )
}
