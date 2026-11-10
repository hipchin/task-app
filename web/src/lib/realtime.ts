import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'

// SPEC §3.4：変更を購読して該当するクエリを無効化する
const TABLE_KEYS: Record<string, string[][]> = {
  tasks: [['tasks'], ['task']],
  routines: [['routines']],
  routine_logs: [['routineLogs'], ['routineLog']],
  attachments: [['attachments'], ['tasks'], ['routineLogs']],
}

let pending = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null

function flush(qc: QueryClient) {
  timer = null
  // 操作中（楽観的更新の途中）は待つ。操作の完了時にも再取得される
  if (qc.isMutating() > 0) {
    timer = setTimeout(() => flush(qc), 300)
    return
  }
  const tables = pending
  pending = new Set()
  for (const t of tables) for (const key of TABLE_KEYS[t] ?? []) void qc.invalidateQueries({ queryKey: key })
}

export function useRealtimeSync(userId: string | null) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!userId) return
    const channel = supabase.channel(`sync-${userId}`)
    for (const table of Object.keys(TABLE_KEYS)) {
      // filter を付けると DELETE が届かないため付けない（RLS により他人の行の内容は届かない）
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        pending.add(table)
        if (!timer) timer = setTimeout(() => flush(qc), 150)
      })
    }
    channel.subscribe((status) => {
      // 再接続したときは取りこぼしがありうるので取り直す
      if (status === 'SUBSCRIBED') void qc.invalidateQueries()
    })
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc, userId])
}
