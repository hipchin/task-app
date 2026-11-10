import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { CRED_FILE, localSupabase } from './env.ts'

export default async function globalSetup() {
  const { url, service } = localSupabase()
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const email = `e2e-${Date.now()}@example.com`
  const password = 'e2e-password-123'
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  mkdirSync(dirname(CRED_FILE), { recursive: true })
  writeFileSync(CRED_FILE, JSON.stringify({ email, password, id: data.user.id }))
}
