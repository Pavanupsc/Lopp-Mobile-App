'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

function initialFromName(name) {
  const trimmed = (name || '').trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

async function acceptInvite(userId, inviteCode) {
  const code = inviteCode?.trim()
  if (!code) return null

  const admin = createAdminClient()
  const { data: invite, error } = await admin
    .from('invites')
    .select('*')
    .eq('code', code)
    .is('accepted_by', null)
    .maybeSingle()

  if (error || !invite) {
    return 'Invalid or already-used invite code.'
  }

  const pair = invite.inviter_is_verifier
    ? { verifier_id: invite.inviter_id, subject_id: userId, status: 'active' }
    : { verifier_id: userId, subject_id: invite.inviter_id, status: 'active' }

  const { error: pairError } = await admin.from('pairs').insert(pair)
  if (pairError) {
    return pairError.message
  }

  await admin
    .from('invites')
    .update({
      accepted_by: userId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invite.id)

  return null
}

export async function submitApplication(formData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You must be signed in to submit.' }
  }

  const displayName = String(formData.get('displayName') || '').trim()
  const email = String(formData.get('email') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  const timezone = String(formData.get('timezone') || 'UTC')
  const avatarColor = String(formData.get('avatarColor') || '#46f08a')
  const stake = Number(formData.get('stake'))
  const dailyTarget = Number(formData.get('dailyTarget'))
  const daysInMonth = Number(formData.get('daysInMonth'))
  const model = String(formData.get('model') || 'all_or_nothing')
  const inviteCode = String(formData.get('inviteCode') || '')
  const goalsJson = String(formData.get('goals') || '[]')
  const microsJson = String(formData.get('micros') || '[]')

  if (!displayName) {
    return { error: 'Name is required.' }
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'A valid email is required.' }
  }

  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return { error: 'A valid phone number is required.' }
  }

  if (!stake || stake < 100 || stake > 5000) {
    return { error: 'Monthly stake must be between $100 and $5,000.' }
  }

  if (!dailyTarget || dailyTarget < 5 || dailyTarget > 40) {
    return { error: 'Daily target must be between 5 and 40 points.' }
  }

  if (!daysInMonth || daysInMonth < 28 || daysInMonth > 31) {
    return { error: 'Days in month must be between 28 and 31.' }
  }

  let goals = []
  let micros = []
  try {
    goals = JSON.parse(goalsJson)
    micros = JSON.parse(microsJson)
  } catch {
    return { error: 'Invalid goals data.' }
  }

  if (!Array.isArray(goals) || goals.length === 0) {
    return { error: 'Add at least one daily goal.' }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      display_name: displayName,
      email,
      phone,
      initial: initialFromName(displayName),
      timezone,
      avatar_color: avatarColor,
    })
    .eq('id', user.id)

  if (profileError) {
    return { error: profileError.message }
  }

  await supabase
    .from('contracts')
    .update({ active: false })
    .eq('user_id', user.id)
    .eq('active', true)

  const { error: contractError } = await supabase.from('contracts').insert({
    user_id: user.id,
    stake,
    daily_target: dailyTarget,
    days_in_month: daysInMonth,
    model,
    active: true,
  })

  if (contractError) {
    return { error: contractError.message }
  }

  await supabase.from('goals').update({ active: false }).eq('user_id', user.id)

  const goalRows = [
    ...goals.map((goal, index) => ({
      user_id: user.id,
      title: String(goal.title || '').trim(),
      meta: String(goal.meta || '').trim(),
      points: Math.min(10, Math.max(1, Number(goal.points) || 5)),
      kind: 'goal',
      sort: index,
      active: true,
    })),
    ...micros.map((micro, index) => ({
      user_id: user.id,
      title: String(micro.title || '').trim(),
      meta: String(micro.meta || '').trim(),
      points: Math.min(10, Math.max(1, Number(micro.points) || 3)),
      kind: 'micro',
      sort: index,
      active: true,
    })),
  ].filter((row) => row.title)

  if (goalRows.length === 0) {
    return { error: 'Each goal needs a title.' }
  }

  const { error: goalsError } = await supabase.from('goals').insert(goalRows)
  if (goalsError) {
    return { error: goalsError.message }
  }

  const inviteError = await acceptInvite(user.id, inviteCode)
  if (inviteError) {
    return { error: inviteError }
  }

  redirect('/application?submitted=1')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
