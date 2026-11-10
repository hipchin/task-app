import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const CRED_FILE = fileURLToPath(new URL('../node_modules/.tmp/e2e-user.json', import.meta.url))

export function localSupabase(): { url: string; anon: string; service: string } {
  const out = execSync('npx supabase status -o env', {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    encoding: 'utf8',
  })
  const env: Record<string, string> = {}
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2]
  }
  const url = env.API_URL ?? ''
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error('E2E はローカルの Supabase に対してのみ実行する')
  return { url, anon: env.ANON_KEY ?? '', service: env.SERVICE_ROLE_KEY ?? '' }
}

export function credentials(): { email: string; password: string; id: string } {
  return JSON.parse(readFileSync(CRED_FILE, 'utf8')) as { email: string; password: string; id: string }
}
