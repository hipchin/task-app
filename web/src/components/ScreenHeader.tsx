import type { ReactNode } from 'react'
import { goBack, type Route } from '../lib/router'
import { IconChevronLeft } from './Icons'

export function ScreenHeader({
  title,
  backLabel = '一覧',
  backTo,
  right,
}: {
  title: string
  backLabel?: string
  backTo?: Route
  right?: ReactNode
}) {
  return (
    <header className="screen-header">
      <button type="button" className="back-btn" onClick={() => goBack(backTo)}>
        <IconChevronLeft className="icon icon-sm" />
        {backLabel}
      </button>
      <h1 className="screen-title">{title}</h1>
      <div className="screen-header-right">{right}</div>
    </header>
  )
}
