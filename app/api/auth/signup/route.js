import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

function siteOrigin(request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.headers.get('origin') ||
    'http://localhost:3000'
  )
}

export async function POST(request) {
  try {
    const body = await request.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const phone = String(body.phone || '').trim()
    const password = String(body.password || '')

    if (!name) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }
    if (!phone) {
      return NextResponse.json({ error: 'Phone is required.' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteOrigin(request)}/auth/callback`,
        data: { full_name: name, phone },
      },
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (data.user) {
      await supabase
        .from('profiles')
        .update({
          display_name: name,
          email,
          phone,
          initial: name.charAt(0).toUpperCase() || '?',
        })
        .eq('id', data.user.id)
    }

    if (!data.session) {
      return NextResponse.json({
        needsConfirmation: true,
        message:
          'Account created. Check your email for a confirmation link, then sign in.',
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle()

    return NextResponse.json({ user: data.user, profile })
  } catch {
    return NextResponse.json({ error: 'Signup failed.' }, { status: 500 })
  }
}
