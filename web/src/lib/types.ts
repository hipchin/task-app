import type { DateStr } from './date.ts'

export type RuleType = 'daily' | 'weekly' | 'monthly' | 'weekdays'

export interface Task {
  id: string
  user_id: string
  title: string
  memo: string
  date: DateStr
  due_date: DateStr | null
  done: boolean
  done_at: string | null
  sort_order: number
  remind_at: string | null
  notified_at: string | null
  created_at: string
  updated_at: string
}

/** 一覧用：添付の有無を含む */
export interface TaskWithAttachments extends Task {
  attachments: { id: string }[]
}

export interface Routine {
  id: string
  user_id: string
  title: string
  memo: string
  rule_type: RuleType
  rule_days: number[] | null
  start_date: DateStr
  end_date: DateStr | null
  remind_time: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface RoutineLog {
  id: string
  user_id: string
  routine_id: string
  date: DateStr
  done: boolean
  memo: string
  notified_at: string | null
}

export interface RoutineLogWithAttachments extends RoutineLog {
  attachments: { id: string }[]
}

export interface Attachment {
  id: string
  user_id: string
  task_id: string | null
  routine_log_id: string | null
  storage_path: string
  width: number | null
  height: number | null
  created_at: string
}
