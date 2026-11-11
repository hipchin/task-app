import { useRoutines } from './api'
import { ScreenHeader } from '../../components/ScreenHeader'
import { Link } from '../../components/Link'
import { IconChevronRight, IconPlus } from '../../components/Icons'
import { formatLongDate, todayJst } from '../../lib/date'
import { isEnded, summarizeRule } from '../../lib/routineRule'
import { errorMessage } from '../../lib/errors'
import { useOnline } from '../../lib/online'
import { navigate } from '../../lib/router'

export function RoutinesScreen() {
  const q = useRoutines()
  const online = useOnline()
  const today = todayJst()
  const list = [...(q.data ?? [])].sort((a, b) => Number(isEnded(a, today)) - Number(isEnded(b, today)))

  return (
    <div className="screen">
      <ScreenHeader
        title="ルーティーン"
        showBack={false}
        right={
          <button
            type="button"
            className="btn btn-primary btn-compact"
            disabled={!online}
            onClick={() => navigate({ name: 'routineEdit', id: null })}
          >
            <IconPlus className="icon icon-sm" />
            新規
          </button>
        }
      />
      {q.isPending ? <p className="loading-text">読み込み中…</p> : null}
      {q.isError ? (
        <div className="inline-error" role="alert">
          <p>{errorMessage(q.error, 'ルーティーンを読み込み')}</p>
        </div>
      ) : null}
      {q.data && list.length === 0 ? (
        <div className="empty">
          <p>ルーティーンはまだありません。</p>
          <p className="field-hint">「新規」から、毎日・毎週・毎月・平日のくり返しを作れます。</p>
        </div>
      ) : null}
      <ul className="routine-list">
        {list.map((r) => {
          const ended = isEnded(r, today)
          return (
            <li key={r.id}>
              <Link to={{ name: 'routineEdit', id: r.id }} className={`routine-item${ended ? ' routine-ended' : ''}`}>
                <span className="routine-item-main">
                  <span className="routine-item-title">{r.title}</span>
                  <span className="routine-item-rule">
                    {summarizeRule(r)}
                    {r.end_date && !ended ? ` ・ ${formatLongDate(r.end_date)}まで` : ''}
                  </span>
                </span>
                <span className={`status-tag ${ended ? 'status-ended' : 'status-active'}`}>{ended ? '終了済み' : '有効'}</span>
                <IconChevronRight className="icon icon-sm" />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
