/**
 * Global UI state only (CLAUDE.md Section 5: Zustand for modals,
 * active project, transient UI). Server state belongs in TanStack Query.
 */
import { create } from "zustand";

interface UiState {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeProjectId: null,
  setActiveProjectId: (id) => set({ activeProjectId: id }),
}));
