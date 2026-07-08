import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

export async function GET(request) {
  const client = createRouteClient(request)
  if (client.error) {
    return NextResponse.json({ user: null, profile: null })
  }

  const { supabase, jsonBody } = client

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return jsonBody({ user: null, profile: null })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    return jsonBody({ user, profile })
  } catch (err) {
    console.error('[session]', err)
    return jsonBody({ user: null, profile: null })
  }
}
