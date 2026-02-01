import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jackettApi, prowlarrApi, getInstancesStatus } from '../api'
import {
  CreateJackettInstance,
  UpdateJackettInstance,
  CreateProwlarrInstance,
  UpdateProwlarrInstance,
} from '../types'
import toast from 'react-hot-toast'

// Query keys - using base array to avoid temporal dead zone issues
const instancesBase = ['instances'] as const
const jackettBase = [...instancesBase, 'jackett'] as const
const prowlarrBase = [...instancesBase, 'prowlarr'] as const

export const instanceKeys = {
  all: instancesBase,
  status: () => [...instancesBase, 'status'] as const,
  jackett: {
    all: jackettBase,
    detail: (id: number) => [...jackettBase, id] as const,
  },
  prowlarr: {
    all: prowlarrBase,
    detail: (id: number) => [...prowlarrBase, id] as const,
  },
}

// Get all instances with status
export function useInstancesStatus() {
  return useQuery({
    queryKey: instanceKeys.status(),
    queryFn: getInstancesStatus,
    refetchInterval: 60000, // Refetch every 60 seconds
  })
}

// Jackett hooks
export function useJackettInstances() {
  return useQuery({
    queryKey: instanceKeys.jackett.all,
    queryFn: jackettApi.list,
  })
}

export function useCreateJackett() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateJackettInstance) => jackettApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all })
      toast.success('Jackett instance created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create Jackett instance')
    },
  })
}

export function useUpdateJackett() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateJackettInstance }) =>
      jackettApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all })
      toast.success('Jackett instance updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update Jackett instance')
    },
  })
}

export function useDeleteJackett() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => jackettApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all })
      toast.success('Jackett instance deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete Jackett instance')
    },
  })
}

export function useTestJackett() {
  return useMutation({
    mutationFn: (id: number) => jackettApi.test(id),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(data.message)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Connection test failed')
    },
  })
}

// Prowlarr hooks
export function useProwlarrInstances() {
  return useQuery({
    queryKey: instanceKeys.prowlarr.all,
    queryFn: prowlarrApi.list,
  })
}

export function useCreateProwlarr() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateProwlarrInstance) => prowlarrApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all })
      toast.success('Prowlarr instance created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create Prowlarr instance')
    },
  })
}

export function useUpdateProwlarr() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProwlarrInstance }) =>
      prowlarrApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all })
      toast.success('Prowlarr instance updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update Prowlarr instance')
    },
  })
}

export function useDeleteProwlarr() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => prowlarrApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: instanceKeys.all })
      toast.success('Prowlarr instance deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete Prowlarr instance')
    },
  })
}

export function useTestProwlarr() {
  return useMutation({
    mutationFn: (id: number) => prowlarrApi.test(id),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message)
      } else {
        toast.error(data.message)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Connection test failed')
    },
  })
}
