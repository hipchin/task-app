import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ATTACHMENTS_BUCKET, supabase } from '../../lib/supabase'
import { resizeImage } from '../../lib/image'
import type { Attachment } from '../../lib/types'

export type AttachmentOwner = { kind: 'task'; id: string } | { kind: 'routineLog'; id: string }

export interface AttachmentWithUrl extends Attachment {
  url: string | null
}

export const attachmentKeys = {
  all: ['attachments'] as const,
  owner: (o: AttachmentOwner) => ['attachments', o.kind, o.id] as const,
}

const SIGNED_URL_SECONDS = 60 * 60

export function useAttachments(owner: AttachmentOwner | null) {
  return useQuery({
    queryKey: owner ? attachmentKeys.owner(owner) : ['attachments', 'none'],
    enabled: owner !== null,
    // 署名付きURLの期限（1時間）より前に取り直す
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<AttachmentWithUrl[]> => {
      if (!owner) return []
      const col = owner.kind === 'task' ? 'task_id' : 'routine_log_id'
      const { data, error } = await supabase.from('attachments').select('*').eq(col, owner.id).order('created_at')
      if (error) throw error
      const rows = data as Attachment[]
      if (rows.length === 0) return []
      const { data: signed, error: e2 } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrls(
          rows.map((r) => r.storage_path),
          SIGNED_URL_SECONDS,
        )
      if (e2) throw e2
      const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]))
      return rows.map((r) => ({ ...r, url: byPath.get(r.storage_path) ?? null }))
    },
  })
}

export async function removeStorageFiles(paths: string[]) {
  if (paths.length === 0) return
  // 失敗しても致命的ではない（孤立ファイルが残るだけ）ので握りつぶさず記録だけする
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths)
  if (error) console.warn('Storage cleanup failed', error)
}

export interface UploadResult {
  ok: number
  failed: { name: string; message: string }[]
}

/** 画像を縮小してアップロードし、attachments に行を追加する。1枚ずつ処理し、失敗分を報告する */
export function useUploadAttachments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      owner,
      files,
      resolveOwner,
    }: {
      owner: AttachmentOwner | null
      files: File[]
      /** routine_logs の行がまだない場合に作ってから id を返す */
      resolveOwner?: () => Promise<AttachmentOwner>
    }): Promise<UploadResult & { owner: AttachmentOwner }> => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('ログインしていません。')
      const target = owner ?? (resolveOwner ? await resolveOwner() : null)
      if (!target) throw new Error('添付先がありません。')

      const result: UploadResult = { ok: 0, failed: [] }
      for (const file of files) {
        const id = crypto.randomUUID()
        const path = `${userId}/${id}.jpg`
        let uploaded = false
        try {
          const img = await resizeImage(file)
          const up = await supabase.storage
            .from(ATTACHMENTS_BUCKET)
            .upload(path, img.blob, { contentType: 'image/jpeg', upsert: false })
          if (up.error) throw up.error
          uploaded = true
          const { error } = await supabase.from('attachments').insert({
            id,
            storage_path: path,
            width: img.width,
            height: img.height,
            task_id: target.kind === 'task' ? target.id : null,
            routine_log_id: target.kind === 'routineLog' ? target.id : null,
          })
          if (error) throw error
          result.ok += 1
        } catch (e) {
          // 失敗したらアップロード済みのファイルを削除する（SPEC §3.3-4）
          if (uploaded) await removeStorageFiles([path])
          result.failed.push({ name: file.name, message: e instanceof Error ? e.message : String(e) })
        }
      }
      return { ...result, owner: target }
    },
    onSettled: (res) => {
      if (res) void qc.invalidateQueries({ queryKey: attachmentKeys.owner(res.owner) })
      // 一覧のクリップアイコンを更新
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['routineLogs'] })
    },
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Attachment) => {
      const { error } = await supabase.from('attachments').delete().eq('id', a.id)
      if (error) throw error
      await removeStorageFiles([a.storage_path])
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: attachmentKeys.all })
      void qc.invalidateQueries({ queryKey: ['tasks'] })
      void qc.invalidateQueries({ queryKey: ['routineLogs'] })
    },
  })
}
