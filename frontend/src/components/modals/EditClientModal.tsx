import { useForm } from 'react-hook-form'
import { Settings, Eye, EyeOff } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import { DownloadClientWithStatus, UpdateDownloadClient, ClientType } from '../../types'
import { useUpdateClient } from '../../hooks'

interface EditClientModalProps {
  isOpen: boolean
  onClose: () => void
  client: DownloadClientWithStatus | null
}

const clientTypes: { value: ClientType; label: string }[] = [
  { value: 'qbittorrent', label: 'qBittorrent' },
]

export function EditClientModal({ isOpen, onClose, client }: EditClientModalProps) {
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateDownloadClient>()

  const updateClient = useUpdateClient()

  // Reset form when client changes
  useEffect(() => {
    if (client) {
      reset({
        name: client.name,
        url: client.url,
        client_type: client.client_type,
        username: '',
        password: '',
        category: client.category ?? '',
      })
    }
  }, [client, reset])

  const onSubmit = async (data: UpdateDownloadClient) => {
    if (!client) return

    // Only include non-empty fields
    const updateData: UpdateDownloadClient = {}
    if (data.name && data.name !== client.name) updateData.name = data.name
    if (data.url && data.url !== client.url) updateData.url = data.url
    if (data.client_type && data.client_type !== client.client_type)
      updateData.client_type = data.client_type
    if (data.username) updateData.username = data.username
    if (data.password) updateData.password = data.password
    // Handle category: allow setting to empty string (to clear) or new value
    const newCategory = data.category || null
    const currentCategory = client.category || null
    if (newCategory !== currentCategory) updateData.category = newCategory

    // Skip if no changes
    if (Object.keys(updateData).length === 0) {
      onClose()
      return
    }

    try {
      await updateClient.mutateAsync({ id: client.id, data: updateData })
      reset()
      onClose()
    } catch {
      // Error handled by mutation
    }
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Download Client"
      titleIcon={<Settings className="h-5 w-5 text-violet-400" />}
      footer={
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="btn-secondary flex-1"
            disabled={updateClient.isPending}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={updateClient.isPending}
            className="btn-primary flex flex-1 items-center justify-center gap-2"
          >
            {updateClient.isPending && <LoadingSpinner size="sm" />}
            Save Changes
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Display Name</label>
          <input type="text" placeholder="My qBittorrent" {...register('name')} className="input" />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Client Type</label>
          <select {...register('client_type')} className="input cursor-pointer">
            {clientTypes.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">URL</label>
          <input
            type="text"
            placeholder="http://192.168.1.100:8080"
            {...register('url', {
              pattern: {
                value: /^https?:\/\/.+/,
                message: 'Must be a valid HTTP(S) URL',
              },
            })}
            className="input-mono"
          />
          {errors.url && <p className="mt-1 text-xs text-red-400">{errors.url.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            Username <span className="text-xs text-slate-500">(leave empty to keep current)</span>
          </label>
          <input
            type="text"
            placeholder="Enter new username"
            {...register('username')}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            Password <span className="text-xs text-slate-500">(leave empty to keep current)</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter new password"
              {...register('password')}
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">
            Category <span className="text-xs text-slate-500">(optional)</span>
          </label>
          <input
            type="text"
            placeholder="e.g., Movies, TV Shows"
            {...register('category')}
            className="input"
          />
          <p className="mt-1 text-xs text-slate-500">
            All torrents sent to this client will be assigned this category
          </p>
        </div>
      </form>
    </Modal>
  )
}
