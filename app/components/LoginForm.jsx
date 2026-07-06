'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm({ authError }) {
  const supabase = createClient()
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(authError || '')

  async function handleEmailAuth(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedName) {
      setError('Name is required.')
      setLoading(false)
      return
    }

    if (!trimmedEmail || !password) {
      setError('Email and password are required.')
      setLoading(false)
      return
    }

    if (!trimmedPhone) {
      setError('Phone is required.')
      setLoading(false)
      return
    }

    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
              data: { full_name: trimmedName, phone: trimmedPhone },
            },
          })

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    if (result.data.user) {
      await supabase
        .from('profiles')
        .update({
          display_name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          initial: trimmedName.charAt(0).toUpperCase() || '?',
        })
        .eq('id', result.data.user.id)
    }

    if (mode === 'signup' && !result.data.session) {
      setError('Check your email for a confirmation link, then sign in.')
      setLoading(false)
      return
    }

    window.location.href = '/application'
  }

  async function handleGoogle() {
    setLoading(true)
    setError('')

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (oauthError) {
      setError(oauthError.message)
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="brand">
        <div className="brand-mark">
          <div className="brand-icon">
            <div className="brand-icon-inner" />
          </div>
          <div className="brand-name">LOOP</div>
        </div>
        <p className="brand-tagline">
          Put money on the line.
          <br />
          Earn it back — verified by someone you trust.
        </p>
      </div>

      <form onSubmit={handleEmailAuth}>
        <label className="label" htmlFor="name">
          NAME
        </label>
        <input
          id="name"
          className="input"
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />

        <label className="label" htmlFor="email">
          EMAIL
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="username"
          placeholder="you@loop.app"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />

        <label className="label" htmlFor="phone">
          PHONE
        </label>
        <input
          id="phone"
          className="input"
          type="tel"
          autoComplete="tel"
          placeholder="+1 555 000 0000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
        />

        <label className="label" htmlFor="password">
          PASSWORD
        </label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />

        {error && <p className="error">{error}</p>}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading
            ? 'Please wait…'
            : mode === 'signin'
              ? 'Enter the loop'
              : 'Create account'}
        </button>
      </form>

      <div className="divider">
        <span>OR</span>
      </div>

      <button
        className="btn-secondary btn-google"
        type="button"
        onClick={handleGoogle}
        disabled={loading}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.611 20.083H42V20H24v8h11.303C33.635 32.66 29.273 36 24 36c-5.522 0-10-4.478-10-10s4.478-10 10-10c2.52 0 4.85.93 6.63 2.47l5.66-5.66C33.64 9.64 29.05 8 24 8 12.955 8 4 16.955 4 28s8.955 20 20 20 20-8.955 20-20c0-1.33-.14-2.63-.389-3.917z"
          />
          <path
            fill="#FF3D00"
            d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 13 24 13c2.52 0 4.85.93 6.63 2.47l5.66-5.66C33.64 9.64 29.05 8 24 8 15.66 8 8.64 13.337 6.306 14.691z"
          />
          <path
            fill="#4CAF50"
            d="M24 48c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 39.091 26.715 40 24 40c-5.252 0-9.61-3.558-11.187-8.352l-6.52 5.02C8.5 43.98 15.66 48 24 48z"
          />
          <path
            fill="#1976D2"
            d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C42.022 35.026 44 31.766 44 28c0-2.73-.5-5.357-1.389-7.917z"
          />
        </svg>
        Continue with Google
      </button>

      <p className="toggle-mode">
        {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError('')
          }}
          disabled={loading}
        >
          {mode === 'signin' ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
