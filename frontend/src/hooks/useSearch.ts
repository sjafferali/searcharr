import { useMutation, useQuery } from '@tanstack/react-query'
import { searchApi } from '../api'
import { SearchParams } from '../types'
import toast from 'react-hot-toast'

// Query keys
export const searchKeys = {
  all: ['search'] as const,
  results: (params: SearchParams) => [...searchKeys.all, 'results', params] as const,
  categories: () => [...searchKeys.all, 'categories'] as const,
}

// Get categories
export function useCategories() {
  return useQuery({
    queryKey: searchKeys.categories(),
    queryFn: searchApi.getCategories,
    staleTime: Infinity, // Categories don't change often
  })
}

// Search mutation (use mutation for manual triggering)
export function useSearch() {
  return useMutation({
    mutationFn: (params: SearchParams) => searchApi.search(params),
    onError: (error: Error) => {
      toast.error(error.message || 'Search failed')
    },
  })
}
