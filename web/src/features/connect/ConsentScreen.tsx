import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { errorMessage } from '../../lib/errors'

type Details = { authorizationId: string; clientName: string; redirectHost: string; email: string }

type State =
  | { kind: 'loading' }
  | { kind: 'ask'; details: Details }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string }

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/** OAuth の同意画面（SPEC Phase 3）。ChatGPT などがこのアプリに接続するときに表示される */
export function ConsentScreen() {
  const authorizationId = new URLSearchParams(location.search).get('authorization_id') ?? ''
  const [state, setState] = useState<State>(() =>
    authorizationId ? { kind: 'loading' } : { kind: 'error', message: '接続の情報が見つかりません。接続元のアプリからやり直してください。' },
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authorizationId) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (cancelled) return
      if (error || !data) {
        setState({ kind: 'error', message: errorMessage(error, '接続の情報を読み込み') })
        return
      }
      if (!('authorization_id' in data)) {
        // すでに許可済み：そのまま接続元へ戻す
        setState({ kind: 'redirecting' })
        location.assign(data.redirect_url)
        return
      }
      setState({
        kind: 'ask',
        details: {
          authorizationId: data.authorization_id,
          clientName: data.client.name || '名前のないアプリ',
          redirectHost: hostOf(data.redirect_uri),
          email: data.user.email,
        },
      })
    })()
    return () => {
      cancelled = true
    }
  }, [authorizationId])

  const decide = async (approve: boolean) => {
    if (state.kind !== 'ask') return
    setBusy(true)
    const id = state.details.authorizationId
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    if (error || !data) {
      setBusy(false)
      setState({ kind: 'error', message: errorMessage(error, approve ? '許可' : '拒否') })
      return
    }
    setState({ kind: 'redirecting' })
    location.assign(data.redirect_url)
  }

  return (
    <main className="login consent">
      <h1 className="login-title">アプリの連携</h1>
      {state.kind === 'loading' ? <p className="loading-text">読み込み中…</p> : null}
      {state.kind === 'redirecting' ? <p className="loading-text">接続元のアプリに戻っています…</p> : null}
      {state.kind === 'error' ? (
        <p className="field-error consent-body" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === 'ask' ? (
        <div className="consent-body">
          <p className="consent-lead">
            「<strong>{state.details.clientName}</strong>」が、このアプリへの接続を求めています。
          </p>
          <div className="notice">
            <p>許可すると、次のことができるようになります。</p>
            <ul className="consent-list">
              <li>タスクとルーティーンを見る</li>
              <li>タスクの追加・完了・日付や締め切りの変更・メモへの追記</li>
              <li>ルーティーンのその日の完了</li>
            </ul>
            <p>タスクの削除、ルーティーン本体の変更、画像の操作はできません。操作はすべて記録され、設定画面で確認・連携の解除ができます。</p>
          </div>
          <p className="field-hint">
            ログイン中：{state.details.email}
            <br />
            戻り先：{state.details.redirectHost}
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={() => void decide(true)}>
              許可する
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void decide(false)}>
              許可しない
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}
