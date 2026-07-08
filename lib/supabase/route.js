import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

/** Supabase client for Route Handlers — sets auth cookies on the JSON response (required on Vercel). */
export function createRouteClient(request) {
  const env = getSupabaseEnv()
  if (!env) {
    return { error: 'Server is missing Supabase configuration.' }
  }

  const pendingCookies = []

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

  function jsonBody(data, init = {}) {
    const res = NextResponse.json(data, init)
    pendingCookies.forEach(({ name, value, options }) => {
      res.cookies.set(name, value, options)
    })
    return res
  }

  return { supabase, jsonBody }
}
