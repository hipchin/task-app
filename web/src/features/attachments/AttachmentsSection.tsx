import { useRef, useState } from 'react'
import { useDeleteAttachment, useAttachments, useUploadAttachments, type AttachmentOwner, type AttachmentWithUrl } from './api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconClose, IconPlus, IconTrash } from '../../components/Icons'
import { errorMessage } from '../../lib/errors'

interface Props {
  owner: AttachmentOwner | null
  /** owner がまだない（ルーティーンの記録が未作成）ときに作る */
  resolveOwner?: () => Promise<AttachmentOwner>
  disabled: boolean
}

const LONG_PRESS_MS = 500

export function AttachmentsSection({ owner, resolveOwner, disabled }: Props) {
  const q = useAttachments(owner)
  const upload = useUploadAttachments()
  const del = useDeleteAttachment()
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<AttachmentWithUrl | null>(null)
  const [confirming, setConfirming] = useState<AttachmentWithUrl | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    setMessage(null)
    upload.mutate(
      { owner, files: [...files], resolveOwner },
      {
        onSuccess: (res) => {
          if (res.failed.length > 0) {
            setMessage({
              kind: 'error',
              text: `${res.failed.length}枚を追加できませんでした（${res.failed.map((f) => f.message).join('、')}）。もう一度お試しください。`,
            })
          }
        },
        onError: (e) => setMessage({ kind: 'error', text: errorMessage(e, '画像を追加') }),
      },
    )
    if (fileRef.current) fileRef.current.value = ''
  }

  const confirmDelete = () => {
    if (!confirming) return
    del.mutate(confirming, {
      onSuccess: () => {
        setConfirming(null)
        setViewing(null)
      },
      onError: (e) => {
        setConfirming(null)
        setMessage({ kind: 'error', text: errorMessage(e, '画像を削除') })
      },
    })
  }

  const items = q.data ?? []

  return (
    <div className="field">
      <span className="field-label" id="attachments-label">
        画像
      </span>
      {q.isError ? (
        <p className="field-error" role="alert">
          {errorMessage(q.error, '画像を読み込め')}
        </p>
      ) : null}
      <ul className="thumbs" aria-labelledby="attachments-label">
        {items.map((a, i) => (
          <li key={a.id} className="thumb">
            <button
              type="button"
              className="thumb-btn"
              aria-label={`画像 ${i + 1} を全画面で表示（長押しで削除）`}
              onClick={() => {
                if (longPressed.current) {
                  longPressed.current = false
                  return
                }
                setViewing(a)
              }}
              onPointerDown={() => {
                if (disabled) return
                longPressed.current = false
                pressTimer.current = setTimeout(() => {
                  longPressed.current = true
                  setConfirming(a)
                }, LONG_PRESS_MS)
              }}
              onPointerUp={() => pressTimer.current && clearTimeout(pressTimer.current)}
              onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
              onContextMenu={(e) => e.preventDefault()}
            >
              {a.url ? <img src={a.url} alt="" width={a.width ?? undefined} height={a.height ?? undefined} loading="lazy" /> : null}
            </button>
          </li>
        ))}
        {upload.isPending ? (
          <li className="thumb thumb-pending" aria-live="polite">
            <span>追加中…</span>
          </li>
        ) : null}
      </ul>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => onFiles(e.target.files)}
        data-testid="file-input"
      />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || upload.isPending}
        aria-busy={upload.isPending}
      >
        <IconPlus className="icon icon-sm" />
        画像を追加
      </button>
      {message ? (
        <p className={message.kind === 'error' ? 'field-error' : 'field-hint'} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}

      {viewing ? (
        <ImageViewer
          item={viewing}
          canDelete={!disabled}
          onClose={() => setViewing(null)}
          onDelete={() => setConfirming(viewing)}
        />
      ) : null}
      <ConfirmDialog
        open={confirming !== null}
        title="画像を削除しますか？"
        message="この画像を削除します。元に戻せません。"
        confirmLabel="削除"
        danger
        busy={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}

function ImageViewer({
  item,
  canDelete,
  onClose,
  onDelete,
}: {
  item: AttachmentWithUrl
  canDelete: boolean
  onClose: () => void
  onDelete: () => void
}) {
  return (
    <dialog
      className="viewer"
      aria-label="画像の全画面表示"
      ref={(d) => {
        if (d && !d.open) d.showModal()
      }}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div className="viewer-bar">
        <button type="button" className="btn btn-ghost-inverse" onClick={onClose}>
          <IconClose className="icon icon-sm" />
          閉じる
        </button>
        {canDelete ? (
          <button type="button" className="btn btn-ghost-inverse" onClick={onDelete}>
            <IconTrash className="icon icon-sm" />
            削除
          </button>
        ) : null}
      </div>
      <div className="viewer-body" onClick={onClose}>
        {item.url ? <img src={item.url} alt="" /> : <p>画像を表示できません</p>}
      </div>
    </dialog>
  )
}
