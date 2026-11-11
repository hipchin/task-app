import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export const connectKeys = {
  grants: ['oauthGrants'] as const,
  actions: ['agentActions'] as const,
}

export interface Grant {
  clientId: string
  name: string
  grantedAt: string
}

/** 許可済みの連携アプリ（SPEC Phase 3） */
export function useGrants() {
  return useQuery({
    queryKey: connectKeys.grants,
    queryFn: async (): Promise<Grant[]> => {
      const { data, error } = await supabase.auth.oauth.listGrants()
      if (error) throw error
      return (data ?? []).map((g) => ({ clientId: g.client.id, name: g.client.name || '名前のないアプリ', grantedAt: g.granted_at }))
    },
  })
}

export function useRevokeGrant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: connectKeys.grants }),
  })
}

export interface AgentAction {
  id: string
  client_id: string | null
  action: string
  summary: string
  created_at: string
}

/** AI の操作履歴（直近20件） */
export function useAgentActions() {
  return useQuery({
    queryKey: connectKeys.actions,
    queryFn: async (): Promise<AgentAction[]> => {
      const { data, error } = await supabase
        .from('agent_actions')
        .select('id, client_id, action, summary, created_at')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as AgentAction[]
    },
  })
}
