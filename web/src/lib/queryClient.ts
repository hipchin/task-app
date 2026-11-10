import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 永続化したキャッシュを長く保持する（オフライン閲覧用）
      gcTime: 1000 * 60 * 60 * 24 * 7,
      staleTime: 1000 * 30,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
})

const PERSIST_KEY = 'task-app-query-cache'

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: async (key) => (await get<string>(key)) ?? null,
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: PERSIST_KEY,
  throttleTime: 500,
})

export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 7
/** キャッシュの形式を変えたら上げる */
export const PERSIST_BUSTER = 'v1'

export async function clearPersistedCache() {
  queryClient.clear()
  await del(PERSIST_KEY)
}
