import { useLayoutEffect, useRef } from 'react'

/** 内容に合わせて高さが伸びる複数行入力 */
export function AutoTextarea({
  id,
  value,
  onChange,
  maxLength,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  maxLength?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <textarea
      id={id}
      ref={ref}
      className="input textarea"
      value={value}
      rows={4}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
