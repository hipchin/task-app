import { useState } from 'react'
import { ScreenHeader } from '../../components/ScreenHeader'
import { supabase } from '../../lib/supabase'
import { clearPersistedCache } from '../../lib/queryClient'
import { errorMessage } from '../../lib/errors'

export function SettingsScreen({ email }: { email: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="screen">
      <ScreenHeader title="設定" />
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
      </div>
    </div>
  )
}
