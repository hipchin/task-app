import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './lib/auth'
import { useOnline } from './lib/online'
import { parseRoute, useHash } from './lib/router'
import { useRealtimeSync } from './lib/realtime'
import { ListScreen } from './features/tasks/ListScreen'
import { TaskDetail } from './features/tasks/TaskDetail'
import { RoutineDay } from './features/routines/RoutineDay'
import { RoutinesScreen } from './features/routines/RoutinesScreen'
import { RoutineEdit } from './features/routines/RoutineEdit'
import { SettingsScreen } from './features/settings/SettingsScreen'
import { LoginScreen } from './features/settings/LoginScreen'
import { UpdatePrompt } from './components/UpdatePrompt'

export default function App() {
  const auth = useAuth()
  const online = useOnline()

  return (
    <>
      {!online ? (
        <div className="offline-banner" role="status">
          オフライン（閲覧のみ）
        </div>
      ) : null}
      {auth.status === 'loading' ? null : auth.status === 'signedOut' ? (
        <LoginScreen />
      ) : (
        <SignedIn userId={auth.session.user.id} email={auth.session.user.email ?? ''} />
      )}
      <UpdatePrompt />
    </>
  )
}

function SignedIn({ userId, email }: { userId: string; email: string }) {
  const hash = useHash()
  const route = parseRoute(hash)
  const qc = useQueryClient()
  useRealtimeSync(userId)

  // 別のユーザーでログインし直したときに前のキャッシュを見せない
  useEffect(() => {
    try {
      const prev = localStorage.getItem('task-app:user')
      if (prev && prev !== userId) qc.clear()
      localStorage.setItem('task-app:user', userId)
    } catch {
      // 保存できなくても動作に影響しない
    }
  }, [qc, userId])

  // 画面遷移したら先頭へ（一覧へ戻るときはブラウザがスクロール位置を復元する）
  useEffect(() => {
    if (route.name !== 'list') window.scrollTo({ top: 0 })
  }, [route.name])

  return (
    <main className="app">
      {route.name === 'list' ? <ListScreen /> : null}
      {route.name === 'task' ? <TaskDetail id={route.id} /> : null}
      {route.name === 'routineDay' ? <RoutineDay routineId={route.routineId} date={route.date} /> : null}
      {route.name === 'routines' ? <RoutinesScreen /> : null}
      {route.name === 'routineEdit' ? <RoutineEdit id={route.id} /> : null}
      {route.name === 'settings' ? <SettingsScreen email={email} /> : null}
    </main>
  )
}
