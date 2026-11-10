import { useId, useState } from 'react'
import { allowSignup, isConfigured, supabase } from '../../lib/supabase'
import { useOnline } from '../../lib/online'

/** メールアドレスとパスワードでログイン（SPEC §1.5。マジックリンクは使わない） */
export function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const online = useOnline()
  const id = useId()

  const submit = async () => {
    setError(null)
    setInfo(null)
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (e) {
          setError(
            /invalid login credentials/i.test(e.message)
              ? 'メールアドレスかパスワードが違います。'
              : /email not confirmed/i.test(e.message)
                ? 'メールアドレスの確認が済んでいません。届いたメールのリンクを開いてから、もう一度ログインしてください。'
                : `ログインできませんでした（${e.message}）。`,
          )
        }
      } else {
        const { data, error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: location.origin + location.pathname },
        })
        if (e) {
          setError(/signups not allowed/i.test(e.message) ? '新規登録は受け付けていません。' : `登録できませんでした（${e.message}）。`)
        } else if (!data.session) {
          setInfo('確認メールを送りました。メールのリンクを開いたあと、このアプリに戻ってログインしてください。')
          setMode('login')
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <h1 className="login-title">やること</h1>
      {!isConfigured ? (
        <p className="field-error" role="alert">
          Supabase の接続先が設定されていません（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）。
        </p>
      ) : null}
      <form
        className="form login-form"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="field">
          <label className="field-label" htmlFor={`${id}-email`}>
            メールアドレス
          </label>
          <input
            id={`${id}-email`}
            type="email"
            className="input"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor={`${id}-password`}>
            パスワード
          </label>
          <input
            id={`${id}-password`}
            type="password"
            className="input"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signup' ? <p className="field-hint">8文字以上</p> : null}
        </div>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="field-ok" role="status">
            {info}
          </p>
        ) : null}
        {!online ? <p className="field-hint">オフラインです。接続してからログインしてください。</p> : null}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !online} aria-busy={busy}>
          {mode === 'login' ? 'ログイン' : 'アカウントを作成'}
        </button>
        {allowSignup ? (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
            }}
          >
            {mode === 'login' ? '初めての方：アカウントを作成' : 'ログインに戻る'}
          </button>
        ) : null}
      </form>
    </div>
  )
}
