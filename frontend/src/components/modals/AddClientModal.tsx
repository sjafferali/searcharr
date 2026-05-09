import { useForm } from 'react-hook-form'
import { Plus, Eye, EyeOff, Star } from 'lucide-react'
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
      title="Add Download Client"
      titleIcon={<Plus className="h-5 w-5 text-violet-400" />}
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
            Add Client
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Display Name</label>
          <input
            type="text"
            placeholder="My qBittorrent"
            {...register('name', { required: 'Name is required' })}
            className="input"
          />
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
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Username</label>
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
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter password"
              {...register('password', { required: 'Password is required' })}
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
          {errors.password && (
            <p className="mt-1 text-xs text-red-400">{errors.password.message}</p>
          )}
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

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700/50 bg-slate-800/40 p-3 transition-colors hover:border-amber-500/30 hover:bg-slate-800/60">
          <input
            type="checkbox"
            {...register('is_default')}
            className="mt-0.5 h-4 w-4 cursor-pointer rounded border-slate-600 bg-slate-900 text-amber-500 focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-0"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
              <Star className="h-4 w-4 text-amber-400" />
              Set as default client
            </div>
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
