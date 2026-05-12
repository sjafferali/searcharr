import { create } from 'zustand'
import { IndexerError, SearchCategory, SortBy, SortOrder, SearchResult } from '../types'

interface SearchFilters {
  category: SearchCategory
  minSeeders: number
  maxSize: string
  sortBy: SortBy
  sortOrder: SortOrder
  selectedJackettIds: number[]
  selectedProwlarrIds: number[]
  // Per-instance indexer restrictions, keyed by instance id.
  // Missing or empty entry => search all of that instance's indexers.
  jackettIndexerSelections: Record<number, string[]>
  prowlarrIndexerSelections: Record<number, string[]>
}

interface SearchState {
  // Search query
  query: string
  setQuery: (query: string) => void

  // Filters
  filters: SearchFilters
  setCategory: (category: SearchCategory) => void
  setMinSeeders: (minSeeders: number) => void
  setMaxSize: (maxSize: string) => void
  setSortBy: (sortBy: SortBy) => void
  setSortOrder: (sortOrder: SortOrder) => void
  setSelectedJackettIds: (ids: number[]) => void
  setSelectedProwlarrIds: (ids: number[]) => void
  toggleJackettId: (id: number) => void
  toggleProwlarrId: (id: number) => void
  setJackettIndexerSelection: (instanceId: number, indexerIds: string[]) => void
  setProwlarrIndexerSelection: (instanceId: number, indexerIds: string[]) => void
  toggleJackettIndexer: (instanceId: number, indexerId: string) => void
  toggleProwlarrIndexer: (instanceId: number, indexerId: string) => void
  clearJackettIndexerSelection: (instanceId: number) => void
  clearProwlarrIndexerSelection: (instanceId: number) => void
  resetFilters: () => void

  // Results
  results: SearchResult[]
  setResults: (results: SearchResult[]) => void
  totalResults: number
  setTotalResults: (total: number) => void
  searchErrors: IndexerError[]
  setSearchErrors: (errors: IndexerError[]) => void

  // UI State
  isFiltersExpanded: boolean
  toggleFilters: () => void
  isSearching: boolean
  setIsSearching: (isSearching: boolean) => void
}

const defaultFilters: SearchFilters = {
  category: 'All',
  minSeeders: 0,
  maxSize: '',
  sortBy: 'seeders',
  sortOrder: 'desc',
  selectedJackettIds: [],
  selectedProwlarrIds: [],
  jackettIndexerSelections: {},
  prowlarrIndexerSelections: {},
}

export const useSearchStore = create<SearchState>((set) => ({
  // Query
  query: '',
  setQuery: (query) => set({ query }),

  // Filters
  filters: { ...defaultFilters },
  setCategory: (category) => set((state) => ({ filters: { ...state.filters, category } })),
  setMinSeeders: (minSeeders) => set((state) => ({ filters: { ...state.filters, minSeeders } })),
  setMaxSize: (maxSize) => set((state) => ({ filters: { ...state.filters, maxSize } })),
  setSortBy: (sortBy) => set((state) => ({ filters: { ...state.filters, sortBy } })),
  setSortOrder: (sortOrder) => set((state) => ({ filters: { ...state.filters, sortOrder } })),
  setSelectedJackettIds: (ids) =>
    set((state) => ({ filters: { ...state.filters, selectedJackettIds: ids } })),
  setSelectedProwlarrIds: (ids) =>
    set((state) => ({ filters: { ...state.filters, selectedProwlarrIds: ids } })),
  toggleJackettId: (id) =>
    set((state) => {
      const ids = state.filters.selectedJackettIds
      const newIds = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
      // Drop indexer selections for instances that are being deselected
      const indexerSelections = { ...state.filters.jackettIndexerSelections }
      if (!newIds.includes(id)) {
        delete indexerSelections[id]
      }
      return {
        filters: {
          ...state.filters,
          selectedJackettIds: newIds,
          jackettIndexerSelections: indexerSelections,
        },
      }
    }),
  toggleProwlarrId: (id) =>
    set((state) => {
      const ids = state.filters.selectedProwlarrIds
      const newIds = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
      const indexerSelections = { ...state.filters.prowlarrIndexerSelections }
      if (!newIds.includes(id)) {
        delete indexerSelections[id]
      }
      return {
        filters: {
          ...state.filters,
          selectedProwlarrIds: newIds,
          prowlarrIndexerSelections: indexerSelections,
        },
      }
    }),
  setJackettIndexerSelection: (instanceId, indexerIds) =>
    set((state) => ({
      filters: {
        ...state.filters,
        jackettIndexerSelections: {
          ...state.filters.jackettIndexerSelections,
          [instanceId]: indexerIds,
        },
      },
    })),
  setProwlarrIndexerSelection: (instanceId, indexerIds) =>
    set((state) => ({
      filters: {
        ...state.filters,
        prowlarrIndexerSelections: {
          ...state.filters.prowlarrIndexerSelections,
          [instanceId]: indexerIds,
        },
      },
    })),
  toggleJackettIndexer: (instanceId, indexerId) =>
    set((state) => {
      const current = state.filters.jackettIndexerSelections[instanceId] ?? []
      const next = current.includes(indexerId)
        ? current.filter((i) => i !== indexerId)
        : [...current, indexerId]
      return {
        filters: {
          ...state.filters,
          jackettIndexerSelections: {
            ...state.filters.jackettIndexerSelections,
            [instanceId]: next,
          },
        },
      }
    }),
  toggleProwlarrIndexer: (instanceId, indexerId) =>
    set((state) => {
      const current = state.filters.prowlarrIndexerSelections[instanceId] ?? []
      const next = current.includes(indexerId)
        ? current.filter((i) => i !== indexerId)
        : [...current, indexerId]
      return {
        filters: {
          ...state.filters,
          prowlarrIndexerSelections: {
            ...state.filters.prowlarrIndexerSelections,
            [instanceId]: next,
          },
        },
      }
    }),
  clearJackettIndexerSelection: (instanceId) =>
    set((state) => {
      const next = { ...state.filters.jackettIndexerSelections }
      delete next[instanceId]
      return { filters: { ...state.filters, jackettIndexerSelections: next } }
    }),
  clearProwlarrIndexerSelection: (instanceId) =>
    set((state) => {
      const next = { ...state.filters.prowlarrIndexerSelections }
      delete next[instanceId]
      return { filters: { ...state.filters, prowlarrIndexerSelections: next } }
    }),
  resetFilters: () => set({ filters: { ...defaultFilters } }),

  // Results
  results: [],
  setResults: (results) => set({ results }),
  totalResults: 0,
  setTotalResults: (total) => set({ totalResults: total }),
  searchErrors: [],
  setSearchErrors: (errors) => set({ searchErrors: errors }),

  // UI State
  isFiltersExpanded: true,
  toggleFilters: () => set((state) => ({ isFiltersExpanded: !state.isFiltersExpanded })),
  isSearching: false,
  setIsSearching: (isSearching) => set({ isSearching }),
}))
