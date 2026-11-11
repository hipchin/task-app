import type { ReactNode } from 'react'
import { Link } from './Link'
import { IconList, IconRepeat, IconSettings } from './Icons'
import type { TabName } from '../lib/router'

const tabs: { name: TabName; label: string; icon: ReactNode }[] = [
  { name: 'list', label: '一覧', icon: <IconList className="icon" /> },
  { name: 'routines', label: 'ルーティーン', icon: <IconRepeat className="icon" /> },
  { name: 'settings', label: '設定', icon: <IconSettings className="icon" /> },
]

/** 画面下のタブ（一覧・ルーティーン・設定） */
export function TabBar({ current }: { current: TabName }) {
  return (
    <nav className="tab-bar" aria-label="メイン">
      {tabs.map((t) => (
        <Link
          key={t.name}
          to={{ name: t.name }}
          className="tab"
          aria-current={t.name === current ? 'page' : undefined}
        >
          {t.icon}
          <span className="tab-label">{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}
