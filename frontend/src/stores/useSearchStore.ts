import { create } from 'zustand'
import { SearchCategory, SortBy, SortOrder, SearchResult } from '../types'

interface SearchFilters {
  category: SearchCategory
  minSeeders: number
  maxSize: string
  sortBy: SortBy
  sortOrder: SortOrder
  selectedJackettIds: number[]
  selectedProwlarrIds: number[]
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
  resetFilters: () => void

  // Results
  results: SearchResult[]
  setResults: (results: SearchResult[]) => void
  totalResults: number
  setTotalResults: (total: number) => void

  // Bookmarks (client-side only)
  bookmarkedIds: Set<string>
  toggleBookmark: (id: string) => void
  isBookmarked: (id: string) => boolean

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
}

export const useSearchStore = create<SearchState>((set, get) => ({
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
      return { filters: { ...state.filters, selectedJackettIds: newIds } }
    }),
  toggleProwlarrId: (id) =>
    set((state) => {
      const ids = state.filters.selectedProwlarrIds
      const newIds = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]
      return { filters: { ...state.filters, selectedProwlarrIds: newIds } }
    }),
  resetFilters: () => set({ filters: { ...defaultFilters } }),

  // Results
  results: [],
  setResults: (results) => set({ results }),
  totalResults: 0,
  setTotalResults: (total) => set({ totalResults: total }),

  // Bookmarks
  bookmarkedIds: new Set(),
  toggleBookmark: (id) =>
    set((state) => {
      const newBookmarks = new Set(state.bookmarkedIds)
      if (newBookmarks.has(id)) {
        newBookmarks.delete(id)
      } else {
        newBookmarks.add(id)
      }
      return { bookmarkedIds: newBookmarks }
    }),
  isBookmarked: (id) => get().bookmarkedIds.has(id),

  // UI State
  isFiltersExpanded: true,
  toggleFilters: () => set((state) => ({ isFiltersExpanded: !state.isFiltersExpanded })),
  isSearching: false,
  setIsSearching: (isSearching) => set({ isSearching }),
}))
