import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApiUser, ApiOrganization } from './api'

interface AuthState {
  user: ApiUser | null
  currentOrg: ApiOrganization | null
  isAuthenticated: boolean
  setUser: (user: ApiUser) => void
  setOrg: (org: ApiOrganization) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      currentOrg: null,
      isAuthenticated: false,
      setUser: (user) => set({ user, isAuthenticated: true }),
      setOrg: (org) => set({ currentOrg: org }),
      logout: () => set({ user: null, currentOrg: null, isAuthenticated: false }),
    }),
    {
      name: 'rooiam-admin-auth',
    }
  )
)
