import { useMutation, useQueryClient } from '@tanstack/react-query'
import { downloadApi } from '../api'
import { DownloadRequest } from '../types'
import toast from 'react-hot-toast'
import { historyKeys } from './useHistory'

export function useSendToClient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: DownloadRequest) => downloadApi.sendToClient(request),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Sent to ${data.client_name}`)
      } else {
        toast.error(data.message)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send torrent')
    },
    onSettled: () => {
      // Both success and failure are recorded server-side; refresh history.
      queryClient.invalidateQueries({ queryKey: historyKeys.all })
    },
  })
}
