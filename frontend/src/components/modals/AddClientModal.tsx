import { useForm } from 'react-hook-form'
import { Plus, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import { CreateDownloadClient, ClientType } from '../../types'
import { useCreateClient } from '../../hooks'

interface AddClientModalProps {
  isOpen: boolean
  onClose: () => void
}

const clientTypes: { value: ClientType; label: string }[] = [
  { value: 'qbittorrent', label: 'qBittorrent' },
]

export function AddClientModal({ isOpen, onClose }: AddClientModalProps) {
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateDownloadClient>({
    defaultValues: {
      client_type: 'qbittorrent',
      is_default: false,
    },
  })

  const createClient = useCreateClient()

  const onSubmit = async (data: CreateDownloadClient) => {
    try {
      await createClient.mutateAsync(data)
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
      title="Add download client"
      titleIcon={<Plus className="h-4 w-4 text-slate-500" />}
      footer={
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="btn-secondary flex-1"
            disabled={createClient.isPending}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={createClient.isPending}
            className="btn-primary flex flex-1 items-center justify-center gap-2"
          >
            {createClient.isPending && <LoadingSpinner size="sm" />}
            Add client
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Display name</label>
          <input
            type="text"
            placeholder="My qBittorrent"
            {...register('name', { required: 'Name is required' })}
            className="input"
          />
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
              required: 'URL is required',
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
          <label className="mb-1 block text-xs text-slate-400">Username</label>
          <input
            type="text"
            placeholder="admin"
            {...register('username', { required: 'Username is required' })}
            className="input"
          />
          {errors.username && (
            <p className="mt-1 text-xs text-red-400">{errors.username.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              {...register('password', { required: 'Password is required' })}
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
          {errors.password && (
            <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
          )}
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
            <div className="text-sm font-medium text-slate-200">Set as default client</div>
            <p className="mt-1 text-xs text-slate-500">
              Torrents will send straight here, skipping the picker. Only one client can be the
              default; setting this will unset any other.
            </p>
          </div>
        </label>
      </form>
    </Modal>
  )
}
