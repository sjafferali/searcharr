import { useForm } from 'react-hook-form'
import { Plus, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import { InstanceType, CreateJackettInstance, CreateProwlarrInstance } from '../../types'
import { useCreateJackett, useCreateProwlarr } from '../../hooks'

interface AddInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  type: InstanceType
}

type FormData = CreateJackettInstance | CreateProwlarrInstance

export function AddInstanceModal({ isOpen, onClose, type }: AddInstanceModalProps) {
  const [showApiKey, setShowApiKey] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>()

  const createJackett = useCreateJackett()
  const createProwlarr = useCreateProwlarr()

  const isLoading = createJackett.isPending || createProwlarr.isPending

  const onSubmit = async (data: FormData) => {
    try {
      if (type === 'jackett') {
        await createJackett.mutateAsync(data)
      } else {
        await createProwlarr.mutateAsync(data)
      }
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

  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Add ${typeLabel} instance`}
      titleIcon={<Plus className="h-4 w-4 text-slate-500" />}
      footer={
        <div className="flex items-center gap-3">
          <button onClick={handleClose} className="btn-secondary flex-1" disabled={isLoading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit(onSubmit)}
            disabled={isLoading}
            className="btn-primary flex flex-1 items-center justify-center gap-2"
          >
            {isLoading && <LoadingSpinner size="sm" />}
            Add instance
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-slate-400">Display name</label>
          <input
            type="text"
            placeholder={`My ${typeLabel}`}
            {...register('name', { required: 'Name is required' })}
            className="input"
          />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-xs text-slate-400">URL</label>
          <input
            type="text"
            placeholder={
              type === 'jackett' ? 'http://192.168.1.100:9117' : 'http://192.168.1.100:9696'
            }
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
          <label className="mb-1 block text-xs text-slate-400">API key</label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="API key"
              {...register('api_key', { required: 'API key is required' })}
              className="input-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-100"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.api_key && <p className="mt-1 text-xs text-red-400">{errors.api_key.message}</p>}
        </div>
      </form>
    </Modal>
  )
}
