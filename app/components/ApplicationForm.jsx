'use client'

import { useMemo, useState, useTransition } from 'react'
import { submitApplication } from '@/app/application/actions'

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
]

const AVATAR_COLORS = [
  '#46f08a',
  '#ff5ea8',
  '#ffb84d',
  '#5eb8ff',
  '#b07cff',
  '#ff7a8f',
]

function emptyGoal(points = 5) {
  return { title: '', meta: '', points }
}

function GoalList({ items, setItems, kind, submitted }) {
  const isMicro = kind === 'micro'
  const label = isMicro ? 'Micro-goals' : 'Daily goals'
  const placeholder = isMicro ? 'New micro-goal…' : 'New goal…'
  const [draft, setDraft] = useState(emptyGoal(isMicro ? 3 : 5))

  function addItem() {
    const title = draft.title.trim()
    if (!title) return
    setItems([...items, { ...draft, title }])
    setDraft(emptyGoal(isMicro ? 3 : 5))
  }

  function updateItem(index, patch) {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeItem(index) {
    setItems(items.filter((_, i) => i !== index))
  }

  return (
    <section>
      <div className="section-title">{label.toUpperCase()}</div>

      {items.map((item, index) => (
        <div className="goal-row" key={`${kind}-${index}`}>
          <input
            value={item.title}
            onChange={(e) => updateItem(index, { title: e.target.value })}
            placeholder={placeholder}
            disabled={submitted}
          />
          <input
            className="meta-input"
            value={item.meta}
            onChange={(e) => updateItem(index, { meta: e.target.value })}
            placeholder="6:30 AM"
            disabled={submitted}
          />
          <div className="pts-control">
            <button
              type="button"
              className="pts-btn"
              onClick={() =>
                updateItem(index, {
                  points: Math.max(1, item.points - 1),
                })
              }
              disabled={submitted}
            >
              −
            </button>
            <span className={`pts-value${isMicro ? ' micro' : ''}`}>
              {item.points}p
            </span>
            <button
              type="button"
              className="pts-btn"
              onClick={() =>
                updateItem(index, {
                  points: Math.min(10, item.points + 1),
                })
              }
              disabled={submitted}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="remove-btn"
            onClick={() => removeItem(index)}
            disabled={submitted}
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      ))}

      {!submitted && (
        <div className="add-row">
          <input
            className="input"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addItem()
              }
            }}
          />
          <div className="pts-control">
            <button
              type="button"
              className="pts-btn"
              onClick={() =>
                setDraft({ ...draft, points: Math.max(1, draft.points - 1) })
              }
            >
              −
            </button>
            <span className={`pts-value${isMicro ? ' micro' : ''}`}>
              {draft.points}p
            </span>
            <button
              type="button"
              className="pts-btn"
              onClick={() =>
                setDraft({ ...draft, points: Math.min(10, draft.points + 1) })
              }
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={`add-btn ${isMicro ? 'micro' : 'goal'}`}
            onClick={addItem}
          >
            Add
          </button>
        </div>
      )}
    </section>
  )
}

export default function ApplicationForm({ initialData, submitted }) {
  const [displayName, setDisplayName] = useState(initialData.displayName)
  const [email, setEmail] = useState(initialData.email)
  const [phone, setPhone] = useState(initialData.phone)
  const [timezone, setTimezone] = useState(initialData.timezone)
  const [avatarColor, setAvatarColor] = useState(initialData.avatarColor)
  const [stake, setStake] = useState(initialData.stake)
  const [dailyTarget, setDailyTarget] = useState(initialData.dailyTarget)
  const [daysInMonth, setDaysInMonth] = useState(initialData.daysInMonth)
  const [model, setModel] = useState(initialData.model)
  const [inviteCode, setInviteCode] = useState('')
  const [goals, setGoals] = useState(initialData.goals)
  const [micros, setMicros] = useState(initialData.micros)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()

  const dailySlice = useMemo(
    () => Math.round(Number(stake) / Number(daysInMonth) || 0),
    [stake, daysInMonth]
  )

  function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const formData = new FormData()
    formData.set('displayName', displayName)
    formData.set('email', email)
    formData.set('phone', phone)
    formData.set('timezone', timezone)
    formData.set('avatarColor', avatarColor)
    formData.set('stake', String(stake))
    formData.set('dailyTarget', String(dailyTarget))
    formData.set('daysInMonth', String(daysInMonth))
    formData.set('model', model)
    formData.set('inviteCode', inviteCode)
    formData.set('goals', JSON.stringify(goals))
    formData.set('micros', JSON.stringify(micros))

    startTransition(async () => {
      const result = await submitApplication(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="card card-wide">
      <div className="brand" style={{ marginBottom: 20 }}>
        <div className="brand-mark">
          <div className="brand-icon">
            <div className="brand-icon-inner" />
          </div>
          <div className="brand-name">Application</div>
        </div>
        <p className="brand-tagline">
          Set up your contract, goals, and verifier before entering the loop.
        </p>
      </div>

      {submitted && (
        <p className="success">
          Application saved. Your profile, contract, and goals are now in
          Supabase. You can update and resubmit anytime.
        </p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="section-title">YOUR DETAILS</div>

        <label className="label" htmlFor="name">
          NAME
        </label>
        <input
          id="name"
          className="input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Full name"
          required
        />

        <label className="label" htmlFor="email">
          EMAIL
        </label>
        <input
          id="email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <label className="label" htmlFor="phone">
          PHONE
        </label>
        <input
          id="phone"
          className="input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 000 0000"
          autoComplete="tel"
          required
        />

        <div className="row-2">
          <div>
            <label className="label" htmlFor="timezone">
              TIMEZONE
            </label>
            <select
              id="timezone"
              className="select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="avatarColor">
              AVATAR COLOR
            </label>
            <select
              id="avatarColor"
              className="select"
              value={avatarColor}
              onChange={(e) => setAvatarColor(e.target.value)}
            >
              {AVATAR_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-title">THE CONTRACT</div>

        <div className="row-2">
          <div>
            <label className="label" htmlFor="stake">
              MONTHLY STAKE ($)
            </label>
            <input
              id="stake"
              className="input"
              type="number"
              min={100}
              max={5000}
              step={100}
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="dailyTarget">
              DAILY TARGET (PTS)
            </label>
            <input
              id="dailyTarget"
              className="input"
              type="number"
              min={5}
              max={40}
              value={dailyTarget}
              onChange={(e) => setDailyTarget(Number(e.target.value))}
              required
            />
          </div>
        </div>

        <div className="row-2">
          <div>
            <label className="label" htmlFor="daysInMonth">
              DAYS IN MONTH
            </label>
            <input
              id="daysInMonth"
              className="input"
              type="number"
              min={28}
              max={31}
              value={daysInMonth}
              onChange={(e) => setDaysInMonth(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="model">
              MONEY MODEL
            </label>
            <select
              id="model"
              className="select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="all_or_nothing">All or nothing</option>
              <option value="pro_rata">Pro rata</option>
            </select>
          </div>
        </div>

        <p className="hint">
          Daily slice: ${dailySlice}/day · Target: {dailyTarget} pts to lock each
          day
        </p>

        <GoalList
          items={goals}
          setItems={setGoals}
          kind="goal"
          submitted={false}
        />

        <GoalList
          items={micros}
          setItems={setMicros}
          kind="micro"
          submitted={false}
        />

        <div className="section-title">WIRE YOUR VERIFIER</div>

        <label className="label" htmlFor="inviteCode">
          INVITE CODE (OPTIONAL)
        </label>
        <input
          id="inviteCode"
          className="input"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          placeholder="Paste invite code from your verifier"
        />
        <p className="hint">
          Your verifier approves daily proof. Enter their invite code to connect
          your loop.
        </p>

        {error && <p className="error">{error}</p>}

        <button className="btn-primary" type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Submit application'}
        </button>
      </form>
    </div>
  )
}
