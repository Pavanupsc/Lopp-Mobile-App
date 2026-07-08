import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

function siteOrigin(request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.headers.get('origin') ||
    request.headers.get('x-forwarded-host')
      ? `https://${request.headers.get('x-forwarded-host')}`
      : 'http://localhost:3000'
  )
}

export async function POST(request) {
  const client = createRouteClient(request)
  if (client.error) {
    return NextResponse.json({ error: client.error }, { status: 500 })
  }

  const { supabase, jsonBody } = client

  try {
    const body = await request.json()
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const phone = String(body.phone || '').trim()
    const password = String(body.password || '')

    if (!name) {
      return jsonBody({ error: 'Name is required.' }, { status: 400 })
    }
    if (!email || !password) {
      return jsonBody(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }
    if (!phone) {
      return jsonBody({ error: 'Phone is required.' }, { status: 400 })
    }
    if (password.length < 6) {
      return jsonBody(
        { error: 'Password must be at least 6 characters.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${siteOrigin(request)}/auth/callback`,
        data: { full_name: name, phone },
      },
    })

    if (error) {
      return jsonBody({ error: error.message }, { status: 400 })
    }

    if (data.user && data.session) {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          display_name: name,
          email,
          phone,
          initial: name.charAt(0).toUpperCase() || '?',
        })
        .eq('id', data.user.id)

      if (profileError) {
        console.error('[signup] profile update:', profileError.message)
      }
    }

    if (!data.session) {
      return jsonBody({
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

    return jsonBody({ user: data.user, profile })
  } catch (err) {
    console.error('[signup]', err)
    return jsonBody({ error: 'Signup failed. Please try again.' }, { status: 500 })
  }
}
