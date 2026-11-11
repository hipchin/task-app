import type { ReactNode } from 'react'
import { href, navigate, type Route } from '../lib/router'

interface Props {
  to: Route
  className?: string
  children: ReactNode
  'aria-label'?: string
  'aria-current'?: 'page'
}

/** アプリ内リンク。履歴の深さを数えるため navigate を通す（戻るで一覧の位置を保つ） */
export function Link({ to, className, children, ...rest }: Props) {
  return (
    <a
      href={href(to)}
      className={className}
      aria-label={rest['aria-label']}
      aria-current={rest['aria-current']}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
