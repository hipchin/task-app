import { useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { supabase } from '../../lib/supabase'
import { clearPersistedCache } from '../../lib/queryClient'
import { errorMessage } from '../../lib/errors'
import { checkForUpdate } from '../../lib/appUpdate'

type UpdateState = 'idle' | 'checking' | 'updating' | 'latest' | 'unsupported' | 'error'

const updateMessages: Partial<Record<UpdateState, string>> = {
  updating: '新しいバージョンに更新しています…',
  latest: '最新のバージョンです。',
  unsupported: 'このブラウザでは確認できません。再読み込みで最新になります。',
  error: '確認できませんでした。通信状態を確かめて、もう一度お試しください。',
}

function UpdateSection() {
  const [state, setState] = useState<UpdateState>('idle')
  const busy = state === 'checking' || state === 'updating'
  const message = updateMessages[state]
  return (
    <section className="settings-section" aria-labelledby="s-version">
      <h2 id="s-version" className="section-title">
        バージョン
      </h2>
      <p className="field-hint">{__APP_VERSION__}</p>
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !navigator.onLine}
          aria-busy={busy}
          onClick={async () => {
            setState('checking')
            try {
              setState(await checkForUpdate())
            } catch {
              setState('error')
            }
          }}
        >
          {state === 'checking' ? '確認中…' : 'アップデートを確認'}
        </button>
      </div>
      {message ? (
        <p className={state === 'error' ? 'field-error' : 'field-hint'} role="status">
          {message}
        </p>
      ) : null}
    </section>
  )
}

export function SettingsScreen({ email }: { email: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="screen">
      <ScreenHeader title="設定" showBack={false} />
      <div className="form">
        <section className="settings-section" aria-labelledby="s-notify">
          <h2 id="s-notify" className="section-title">
            通知
          </h2>
          {/* Phase 2.5 で実装する（SPEC §1.4 / §3.6） */}
          <p className="field-hint">
            通知は次のアップデートで使えるようになります。iPhone では iOS 16.4 以降で、ホーム画面に追加したアプリからのみ通知を受け取れます。
          </p>
        </section>

        <section className="settings-section" aria-labelledby="s-account">
          <h2 id="s-account" className="section-title">
            アカウント
          </h2>
          <p className="field-hint">{email} でログイン中</p>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              aria-busy={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                const { error: e } = await supabase.auth.signOut()
                if (e) {
                  setError(errorMessage(e, 'ログアウト'))
                  setBusy(false)
                  return
                }
                await clearPersistedCache()
                location.hash = '#/'
              }}
            >
              ログアウト
            </button>
          </div>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </section>

        <UpdateSection />
      </div>
    </div>
  )
}
