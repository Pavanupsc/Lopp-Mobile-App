import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

export async function POST(request) {
  const client = createRouteClient(request)
  if (client.error) {
    return NextResponse.json({ error: client.error }, { status: 500 })
  }

  const { supabase, jsonBody } = client

  try {
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    if (!email || !password) {
      return jsonBody(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      return jsonBody({ error: error.message }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle()

    return jsonBody({ user: data.user, profile })
  } catch (err) {
    console.error('[signin]', err)
    return jsonBody({ error: 'Sign in failed. Please try again.' }, { status: 500 })
  }
}
