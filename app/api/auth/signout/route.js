import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

export async function POST(request) {
  const client = createRouteClient(request)
  if (client.error) {
    return NextResponse.json({ error: client.error }, { status: 500 })
  }

  const { supabase, jsonBody } = client

  try {
    await supabase.auth.signOut()
    return jsonBody({ ok: true })
  } catch (err) {
    console.error('[signout]', err)
    return jsonBody({ error: 'Sign out failed.' }, { status: 500 })
  }
}
