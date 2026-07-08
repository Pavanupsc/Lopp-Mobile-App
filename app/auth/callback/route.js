import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import { getSupabaseEnv } from '@/lib/supabase/route'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/Loop.dc.html'

  const env = getSupabaseEnv()
  if (!env) {
    return NextResponse.redirect(`${origin}/Loop.dc.html`)
  }

  if (code) {
    const pendingCookies = []
    let response = NextResponse.redirect(`${origin}${next}`)

    const supabase = createServerClient(env.url, env.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          pendingCookies.push(...cookiesToSet)
        },
      },
    })

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options)
      })
      return response
    }
  }

  return NextResponse.redirect(`${origin}/Loop.dc.html`)
}
