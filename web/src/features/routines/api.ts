import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { todayJst, type DateStr } from '../../lib/date'
import type { Routine, RoutineLog, RoutineLogWithAttachments } from '../../lib/types'
import { endDateForStop, planRoutineSave, type RoutineDraft } from '../../lib/routineRule'
import { removeStorageFiles } from '../attachments/api'

export const routineKeys = {
  all: ['routines'] as const,
  logs: ['routineLogs'] as const,
  logRange: (from: DateStr, to: DateStr) => ['routineLogs', from, to] as const,
  log: (routineId: string, date: DateStr) => ['routineLog', routineId, date] as const,
}

export function useRoutines() {
  return useQuery({
    queryKey: routineKeys.all,
    queryFn: async (): Promise<Routine[]> => {
      const { data, error } = await supabase.from('routines').select('*').order('sort_order').order('created_at')
      if (error) throw error
      return data as Routine[]
    },
  })
}

export function useRoutineLogs(from: DateStr, to: DateStr) {
  return useQuery({
    queryKey: routineKeys.logRange(from, to),
    queryFn: async (): Promise<RoutineLogWithAttachments[]> => {
      const { data, error } = await supabase
        .from('routine_logs')
        .select('*, attachments(id)')
        .gte('date', from)
        .lte('date', to)
      if (error) throw error
      return data as RoutineLogWithAttachments[]
    },
  })
}

export function useRoutineLog(routineId: string, date: DateStr) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: routineKeys.log(routineId, date),
    // 一覧のキャッシュに該当日が含まれていれば即表示する（オフラインでも開ける）
    initialData: () => {
      for (const [key, list] of qc.getQueriesData<RoutineLogWithAttachments[]>({ queryKey: routineKeys.logs })) {
        const [, from, to] = key as unknown as LogRangeKey
        if (!list || date < from || date > to) continue
        const hit = list.find((l) => l.routine_id === routineId && l.date === date)
        if (!hit) return null
        if (hit.id.startsWith('optimistic-')) return undefined
        const { attachments: _a, ...log } = hit
        return log
      }
      return undefined
    },
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<RoutineLog | null> => {
      const { data, error } = await supabase
        .from('routine_logs')
        .select('*')
        .eq('routine_id', routineId)
        .eq('date', date)
        .maybeSingle()
      if (error) throw error
      return data as RoutineLog | null
    },
  })
}

/** (routine_id, date) の記録を upsert して返す（SPEC §3.1：完了操作で初めて作る） */
export async function upsertRoutineLog(
  routineId: string,
  date: DateStr,
  patch: Partial<Pick<RoutineLog, 'done' | 'memo'>>,
): Promise<RoutineLog> {
  const { data, error } = await supabase
    .from('routine_logs')
    .upsert({ routine_id: routineId, date, ...patch }, { onConflict: 'routine_id,date' })
    .select('*')
    .single()
  if (error) throw error
  return data as RoutineLog
}

type LogRangeKey = readonly ['routineLogs', DateStr, DateStr]

function invalidateLogsWhenIdle(qc: QueryClient) {
  if (qc.isMutating() <= 1) void qc.invalidateQueries({ queryKey: routineKeys.logs })
}

/** ルーティーンのその日の完了（楽観的更新） */
export function useToggleRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ routineId, date, done }: { routineId: string; date: DateStr; done: boolean }) =>
      upsertRoutineLog(routineId, date, { done }),
    onMutate: async ({ routineId, date, done }) => {
      await qc.cancelQueries({ queryKey: routineKeys.logs })
      const snap = qc.getQueriesData<RoutineLogWithAttachments[]>({ queryKey: routineKeys.logs })
      for (const [key, list] of snap) {
        if (!list) continue
        const [, from, to] = key as unknown as LogRangeKey
        if (date < from || date > to) continue
        const exists = list.some((l) => l.routine_id === routineId && l.date === date)
        qc.setQueryData<RoutineLogWithAttachments[]>(
          key,
          exists
            ? list.map((l) => (l.routine_id === routineId && l.date === date ? { ...l, done } : l))
            : [
                ...list,
                {
                  id: `optimistic-${routineId}-${date}`,
                  user_id: '',
                  routine_id: routineId,
                  date,
                  done,
                  memo: '',
                  notified_at: null,
                  attachments: [],
                },
              ],
        )
      }
      return { snap }
    },
    onError: (_e, _v, ctx) => {
      if (ctx) for (const [key, data] of ctx.snap) qc.setQueryData(key, data)
    },
    onSuccess: (log) => qc.setQueryData(routineKeys.log(log.routine_id, log.date), log),
    onSettled: () => invalidateLogsWhenIdle(qc),
  })
}

export function useSaveRoutineLogMemo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ routineId, date, memo }: { routineId: string; date: DateStr; memo: string }) =>
      upsertRoutineLog(routineId, date, { memo }),
    onSuccess: (log) => {
      qc.setQueryData(routineKeys.log(log.routine_id, log.date), log)
      void qc.invalidateQueries({ queryKey: routineKeys.logs })
    },
  })
}

function draftToRow(d: RoutineDraft) {
  return {
    title: d.title,
    memo: d.memo,
    rule_type: d.rule_type,
    rule_days: d.rule_days,
    start_date: d.start_date,
    end_date: d.end_date,
    remind_time: d.remind_time,
  }
}

/** 新規作成、または SPEC §3.2 に従った保存。保存後のルーティーン id を返す */
export function useSaveRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ before, draft }: { before: Routine | null; draft: RoutineDraft }): Promise<string> => {
      if (!before) {
        const { data, error } = await supabase
          .from('routines')
          .insert({ ...draftToRow(draft), sort_order: Date.now() })
          .select('id')
          .single()
        if (error) throw error
        return (data as { id: string }).id
      }
      const plan = planRoutineSave(before, draft, todayJst())
      if (plan.kind === 'update') {
        const { error } = await supabase.from('routines').update(draftToRow(plan.patch)).eq('id', before.id)
        if (error) throw error
        return before.id
      }
      // 1. 新しいルーティーンを作る（先に作ることで、途中で失敗しても旧ルーティーンが残る）
      const { data, error } = await supabase
        .from('routines')
        .insert({ ...draftToRow(plan.create), sort_order: before.sort_order })
        .select('id')
        .single()
      if (error) throw error
      const newId = (data as { id: string }).id
      // 2. 今日以降の記録を新しいルーティーンへ付け替える
      const { error: e2 } = await supabase
        .from('routine_logs')
        .update({ routine_id: newId })
        .eq('routine_id', before.id)
        .gte('date', plan.moveLogsFrom)
      if (e2) throw e2
      // 3. 既存ルーティーンを昨日で終了する（終了日が既に昨日より前ならそのまま）
      const end = before.end_date !== null && before.end_date < plan.endOldAt ? before.end_date : plan.endOldAt
      const { error: e3 } = await supabase.from('routines').update({ end_date: end }).eq('id', before.id)
      if (e3) throw e3
      return newId
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: routineKeys.all })
      void qc.invalidateQueries({ queryKey: routineKeys.logs })
    },
  })
}

/** 今日以降を終了する（履歴は残す） */
export function useStopRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: Routine) => {
      const { error } = await supabase
        .from('routines')
        .update({ end_date: endDateForStop(r, todayJst()) })
        .eq('id', r.id)
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: routineKeys.all }),
  })
}

/** 完全に削除（記録と添付も消える） */
export function useDeleteRoutine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (r: Routine) => {
      const { data: logs, error: e1 } = await supabase.from('routine_logs').select('id').eq('routine_id', r.id)
      if (e1) throw e1
      const logIds = (logs ?? []).map((l: { id: string }) => l.id)
      let paths: string[] = []
      if (logIds.length > 0) {
        const { data: atts, error: e2 } = await supabase
          .from('attachments')
          .select('storage_path')
          .in('routine_log_id', logIds)
        if (e2) throw e2
        paths = (atts ?? []).map((a: { storage_path: string }) => a.storage_path)
      }
      const { error } = await supabase.from('routines').delete().eq('id', r.id)
      if (error) throw error
      await removeStorageFiles(paths)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: routineKeys.all })
      void qc.invalidateQueries({ queryKey: routineKeys.logs })
    },
  })
}
