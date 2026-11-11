/** 連携の戻り先として信頼するホスト（SPEC Phase 3）。これ以外は同意画面で警告する */
const TRUSTED_HOSTS = ['chatgpt.com', 'openai.com']

export function isTrustedRedirect(redirectUri: string): boolean {
  let u: URL
  try {
    u = new URL(redirectUri)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false
  const host = u.hostname.toLowerCase()
  return TRUSTED_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))
}
