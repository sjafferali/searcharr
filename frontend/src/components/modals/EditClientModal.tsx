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
        is_default: client.is_default,
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
    if (typeof data.is_default === 'boolean' && data.is_default !== client.is_default) {
      updateData.is_default = data.is_default
    }

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
      title="Edit download client"
      titleIcon={<Settings className="h-4 w-4 text-slate-500" />}
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
            Save changes
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Display name</label>
          <input type="text" placeholder="My qBittorrent" {...register('name')} className="input" />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Client type</label>
          <select {...register('client_type')} className="input cursor-pointer">
            {clientTypes.map((ct) => (
              <option key={ct.value} value={ct.value}>
                {ct.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">URL</label>
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
          <label className="mb-1 block text-xs text-slate-400">
            Username <span className="text-slate-500">(leave empty to keep current)</span>
          </label>
          <input
            type="text"
            placeholder="New username"
            {...register('username')}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">
            Password <span className="text-slate-500">(leave empty to keep current)</span>
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="New password"
              {...register('password')}
              className="input pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">
            Category <span className="text-slate-500">(optional)</span>
          </label>
          <input type="text" placeholder="Movies" {...register('category')} className="input" />
          <p className="mt-1 text-xs text-slate-500">
            All torrents sent to this client will be assigned this category
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 p-3 transition-colors hover:border-slate-600">
          <input
            type="checkbox"
            {...register('is_default')}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-900 accent-cyan-500"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-200">Default client</div>
            <p className="mt-1 text-xs text-slate-500">
              Torrents will send straight here, skipping the picker. Only one client can be the
              default; enabling this will unset any other.
            </p>
          </div>
        </label>
      </form>
    </Modal>
  )
}
