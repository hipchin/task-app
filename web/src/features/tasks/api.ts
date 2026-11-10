import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Task, TaskWithAttachments } from '../../lib/types'
import type { DateStr } from '../../lib/date'
import { removeStorageFiles } from '../attachments/api'

export const taskKeys = {
  all: ['tasks'] as const,
  range: (from: DateStr, to: DateStr) => ['tasks', from, to] as const,
  detail: (id: string) => ['task', id] as const,
}

const LIST_COLUMNS = '*, attachments(id)'

export function useTasks(from: DateStr, to: DateStr) {
  return useQuery({
    queryKey: taskKeys.range(from, to),
    queryFn: async (): Promise<TaskWithAttachments[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(LIST_COLUMNS)
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data as TaskWithAttachments[]
    },
  })
}

export function useTask(id: string) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: taskKeys.detail(id),
    // 一覧のキャッシュがあれば即表示する（オフラインでも開ける）。表示後に取り直す
    initialData: () => {
      for (const [, list] of qc.getQueriesData<TaskWithAttachments[]>({ queryKey: taskKeys.all })) {
        const hit = list?.find((t) => t.id === id)
        if (hit) {
          const { attachments: _a, ...task } = hit
          return task
        }
      }
      return undefined
    },
    initialDataUpdatedAt: 0,
    queryFn: async (): Promise<Task | null> => {
      const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data as Task | null
    },
  })
}

type RangeKey = readonly ['tasks', DateStr, DateStr]

/** キャッシュ済みの全期間のタスク一覧に変更を適用する */
function updateTaskLists(
  qc: QueryClient,
  fn: (list: TaskWithAttachments[], from: DateStr, to: DateStr) => TaskWithAttachments[],
) {
  for (const [key, list] of qc.getQueriesData<TaskWithAttachments[]>({ queryKey: taskKeys.all })) {
    if (!list) continue
    const [, from, to] = key as unknown as RangeKey
    qc.setQueryData(key, fn(list, from, to))
  }
}

function sortTasks(list: TaskWithAttachments[]) {
  return [...list].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  )
}

async function snapshot(qc: QueryClient) {
  await qc.cancelQueries({ queryKey: taskKeys.all })
  return qc.getQueriesData<TaskWithAttachments[]>({ queryKey: taskKeys.all })
}

/**
 * 連続で追加・完了しているあいだは再取得しない（未反映の楽観的な行が一瞬消えるのを防ぐ）。
 * 最後の操作が終わったときにまとめて再取得する。
 */
export function invalidateWhenIdle(qc: QueryClient) {
  if (qc.isMutating() <= 1) void qc.invalidateQueries({ queryKey: taskKeys.all })
}

function restore(qc: QueryClient, snap: [readonly unknown[], TaskWithAttachments[] | undefined][]) {
  for (const [key, data] of snap) qc.setQueryData(key, data)
}

/** ＋からの即時追加（楽観的に表示する） */
export function useAddTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; title: string; date: DateStr; sort_order: number }) => {
      const { error } = await supabase.from('tasks').insert(input)
      if (error) throw error
    },
    onMutate: async (input) => {
      const snap = await snapshot(qc)
      const now = new Date().toISOString()
      const row: TaskWithAttachments = {
        ...input,
        user_id: '',
        memo: '',
        done: false,
        done_at: null,
        remind_at: null,
        notified_at: null,
        created_at: now,
        updated_at: now,
        attachments: [],
      }
      updateTaskLists(qc, (list, from, to) =>
        input.date >= from && input.date <= to ? sortTasks([...list, row]) : list,
      )
      return { snap }
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: () => invalidateWhenIdle(qc),
  })
}

/** 完了チェック（楽観的更新。失敗したら元に戻す） */
export function useToggleTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('tasks')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, done }) => {
      const snap = await snapshot(qc)
      updateTaskLists(qc, (list) => list.map((t) => (t.id === id ? { ...t, done } : t)))
      return { snap }
    },
    onError: (_e, _v, ctx) => ctx && restore(qc, ctx.snap),
    onSettled: (_d, _e, { id }) => {
      invalidateWhenIdle(qc)
      void qc.invalidateQueries({ queryKey: taskKeys.detail(id) })
    },
  })
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'memo' | 'date' | 'done' | 'remind_at' | 'notified_at' | 'done_at'>>

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TaskPatch }) => {
      const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select('*').single()
      if (error) throw error
      return data as Task
    },
    onSuccess: (task) => {
      qc.setQueryData(taskKeys.detail(task.id), task)
      void qc.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // 行の削除で attachments は cascade で消えるが、Storage のファイルは消えないので先に消す
      const { data: atts, error: e1 } = await supabase.from('attachments').select('storage_path').eq('task_id', id)
      if (e1) throw e1
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
      await removeStorageFiles((atts ?? []).map((a: { storage_path: string }) => a.storage_path))
    },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: taskKeys.detail(id) })
      updateTaskLists(qc, (list) => list.filter((t) => t.id !== id))
      void qc.invalidateQueries({ queryKey: taskKeys.all })
    },
  })
}
