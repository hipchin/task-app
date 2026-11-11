import { useState } from 'react'
import { useAgentActions, useGrants, useRevokeGrant, type Grant } from './api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { mcpServerUrl } from '../../lib/supabase'
import { errorMessage } from '../../lib/errors'
import { useOnline } from '../../lib/online'

const timeFmt = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** 設定画面：AI 連携（SPEC Phase 3） */
export function ConnectSection() {
  const online = useOnline()
  const grants = useGrants()
  const actions = useAgentActions()
  const revoke = useRevokeGrant()
  const [target, setTarget] = useState<Grant | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const names = new Map((grants.data ?? []).map((g) => [g.clientId, g.name]))

  return (
    <section className="settings-section" aria-labelledby="s-connect">
      <h2 id="s-connect" className="section-title">
        AI との連携
      </h2>
      <p className="field-hint">ChatGPT の開発者モードで、次の URL をコネクタ（MCP サーバー）として追加してください。</p>
      <div className="input-row">
        <input className="input" readOnly value={mcpServerUrl} aria-label="MCP サーバーの URL" onFocus={(e) => e.target.select()} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(mcpServerUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            } catch {
              setError('コピーできませんでした。URL を長押ししてコピーしてください。')
            }
          }}
        >
          {copied ? 'コピー済み' : 'コピー'}
        </button>
      </div>

      <h3 className="subsection-title">連携中のアプリ</h3>
      {grants.isPending ? <p className="field-hint">読み込み中…</p> : null}
      {grants.isError ? <p className="field-error">{errorMessage(grants.error, '連携中のアプリを読み込み')}</p> : null}
      {grants.data && grants.data.length === 0 ? <p className="field-hint">連携中のアプリはありません。</p> : null}
      {grants.data && grants.data.length > 0 ? (
        <ul className="plain-list">
          {grants.data.map((g) => (
            <li key={g.clientId} className="plain-item">
              <span className="plain-item-main">
                <span className="plain-item-title">{g.name}</span>
                <span className="field-hint">{timeFmt.format(new Date(g.grantedAt))} に許可</span>
              </span>
              <button type="button" className="btn btn-danger-text btn-compact" disabled={!online} onClick={() => setTarget(g)}>
                連携を解除
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="subsection-title">AI の操作履歴</h3>
      {actions.isError ? <p className="field-error">{errorMessage(actions.error, '操作履歴を読み込み')}</p> : null}
      {actions.data && actions.data.length === 0 ? <p className="field-hint">まだ操作はありません。</p> : null}
      {actions.data && actions.data.length > 0 ? (
        <ul className="plain-list">
          {actions.data.map((a) => (
            <li key={a.id} className="plain-item action-item">
              <span className="plain-item-main">
                <span>{a.summary}</span>
                <span className="field-hint">
                  {timeFmt.format(new Date(a.created_at))}・{(a.client_id && names.get(a.client_id)) || '連携アプリ'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        title="連携を解除しますか？"
        message={`「${target?.name ?? ''}」はこのアプリにアクセスできなくなります。使うときは、もう一度接続して許可してください。`}
        confirmLabel="解除"
        danger
        busy={revoke.isPending}
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          if (!target) return
          revoke.mutate(target.clientId, {
            onSuccess: () => setTarget(null),
            onError: (e) => {
              setTarget(null)
              setError(errorMessage(e, '連携の解除'))
            },
          })
        }}
      />
    </section>
  )
}
