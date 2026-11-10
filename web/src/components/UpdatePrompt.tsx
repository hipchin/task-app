import { useRegisterSW } from 'virtual:pwa-register/react'

/** 新しいバージョンを取得したら知らせる */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // フォアグラウンド復帰時に更新を確認する
      if (!reg) return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update()
      })
    },
  })
  if (!needRefresh) return null
  return (
    <div className="toasts">
      <div className="toast toast-info" role="status">
        <span className="toast-text">新しいバージョンがあります。</span>
        <button type="button" className="toast-close" onClick={() => void updateServiceWorker(true)}>
          更新
        </button>
        <button type="button" className="toast-close" onClick={() => setNeedRefresh(false)}>
          あとで
        </button>
      </div>
    </div>
  )
}
