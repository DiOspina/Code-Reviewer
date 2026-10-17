import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Theme, Repository, Analysis } from '../types';

interface UIState {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Selected items
  selectedRepository: Repository | null;
  setSelectedRepository: (repo: Repository | null) => void;

  selectedAnalysis: Analysis | null;
  setSelectedAnalysis: (analysis: Analysis | null) => void;

  // View modes
  diffViewMode: 'unified' | 'split';
  setDiffViewMode: (mode: 'unified' | 'split') => void;

  // Notifications
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    timestamp: number;
  }>;
  addNotification: (notification: Omit<UIState['notifications'][0], 'id' | 'timestamp'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Loading states
  globalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      // Theme
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => {
        const themes: Theme[] = ['light', 'dark', 'system'];
        const currentIndex = themes.indexOf(get().theme);
        set({ theme: themes[(currentIndex + 1) % themes.length] });
      },

      // Sidebar
      sidebarOpen: true,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),

      // Selected items
      selectedRepository: null,
      setSelectedRepository: (selectedRepository) => set({ selectedRepository }),

      selectedAnalysis: null,
      setSelectedAnalysis: (selectedAnalysis) => set({ selectedAnalysis }),

      // View modes
      diffViewMode: 'unified',
      setDiffViewMode: (diffViewMode) => set({ diffViewMode }),

      // Notifications
      notifications: [],
      addNotification: (notification) => {
        const id = Math.random().toString(36).substr(2, 9);
        const timestamp = Date.now();
        set({ notifications: [...get().notifications, { ...notification, id, timestamp }] });
        // Auto remove after 5 seconds
        setTimeout(() => {
          get().removeNotification(id);
        }, 5000);
      },
      removeNotification: (id) => set({ notifications: get().notifications.filter((n) => n.id !== id) }),
      clearNotifications: () => set({ notifications: [] }),

      // Loading
      globalLoading: false,
      setGlobalLoading: (globalLoading) => set({ globalLoading }),
    }),
    {
      name: 'agent-reviewer-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarOpen: state.sidebarOpen,
        diffViewMode: state.diffViewMode,
      }),
    }
  )
);

// Analysis store for real-time updates
interface AnalysisState {
  analyses: Map<string, Analysis>;
  updateAnalysis: (analysis: Analysis) => void;
  removeAnalysis: (id: string) => void;
  clearAnalyses: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  analyses: new Map(),
  updateAnalysis: (analysis) =>
    set((state) => {
      const newMap = new Map(state.analyses);
      newMap.set(analysis.id, analysis);
      return { analyses: newMap };
    }),
  removeAnalysis: (id) =>
    set((state) => {
      const newMap = new Map(state.analyses);
      newMap.delete(id);
      return { analyses: newMap };
    }),
  clearAnalyses: () => set({ analyses: new Map() }),
}));