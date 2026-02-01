import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '../api'
import { CreateDownloadClient, UpdateDownloadClient } from '../types'
import toast from 'react-hot-toast'

// Query keys
export const clientKeys = {
  all: ['clients'] as const,
  list: () => [...clientKeys.all, 'list'] as const,
  status: () => [...clientKeys.all, 'status'] as const,
  detail: (id: number) => [...clientKeys.all, id] as const,
}

// Get all clients
export function useClients() {
  return useQuery({
    queryKey: clientKeys.list(),
    queryFn: clientsApi.list,
  })
}

// Get all clients with status
export function useClientsStatus() {
  return useQuery({
    queryKey: clientKeys.status(),
    queryFn: clientsApi.listWithStatus,
    refetchInterval: 60000, // Refetch every 60 seconds
  })
}

// Create client
export function useCreateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateDownloadClient) => clientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success('Download client created')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create download client')
    },
  })
}

// Update client
export function useUpdateClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateDownloadClient }) =>
      clientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success('Download client updated')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update download client')
    },
  })
}

// Delete client
export function useDeleteClient() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.all })
      toast.success('Download client deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete download client')
    },
  })
}

// Test client connection
export function useTestClient() {
  return useMutation({
    mutationFn: (id: number) => clientsApi.test(id),
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
