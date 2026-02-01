import { useForm } from 'react-hook-form'
import { Settings, Eye, EyeOff } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Modal } from '../Modal'
import { LoadingSpinner } from '../LoadingSpinner'
import {
  InstanceType,
  JackettInstanceWithStatus,
  ProwlarrInstanceWithStatus,
  UpdateJackettInstance,
  UpdateProwlarrInstance,
} from '../../types'
import { useUpdateJackett, useUpdateProwlarr } from '../../hooks'

interface EditInstanceModalProps {
  isOpen: boolean
  onClose: () => void
  type: InstanceType
  instance: JackettInstanceWithStatus | ProwlarrInstanceWithStatus | null
}

type FormData = UpdateJackettInstance | UpdateProwlarrInstance

export function EditInstanceModal({ isOpen, onClose, type, instance }: EditInstanceModalProps) {
  const [showApiKey, setShowApiKey] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>()

  const updateJackett = useUpdateJackett()
  const updateProwlarr = useUpdateProwlarr()

  const isLoading = updateJackett.isPending || updateProwlarr.isPending

  // Reset form when instance changes
  useEffect(() => {
    if (instance) {
      reset({
        name: instance.name,
        url: instance.url,
        api_key: '',
      })
    }
  }, [instance, reset])

  const onSubmit = async (data: FormData) => {
    if (!instance) return

    // Only include non-empty fields
    const updateData: FormData = {}
    if (data.name && data.name !== instance.name) updateData.name = data.name
    if (data.url && data.url !== instance.url) updateData.url = data.url
    if (data.api_key) updateData.api_key = data.api_key

    // Skip if no changes
    if (Object.keys(updateData).length === 0) {
      onClose()
      return
    }

    try {
      if (type === 'jackett') {
        await updateJackett.mutateAsync({ id: instance.id, data: updateData })
      } else {
        await updateProwlarr.mutateAsync({ id: instance.id, data: updateData })
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
      title={`Edit ${typeLabel} Instance`}
      titleIcon={<Settings className="h-5 w-5 text-cyan-400" />}
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
            Save Changes
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Display Name</label>
          <input
            type="text"
            placeholder={`My ${typeLabel}`}
            {...register('name')}
            className="input"
          />
          {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">URL</label>
          <input
            type="text"
            placeholder={
              type === 'jackett' ? 'http://192.168.1.100:9117' : 'http://192.168.1.100:9696'
            }
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
            API Key <span className="text-xs text-slate-500">(leave empty to keep current)</span>
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              placeholder="Enter new API key"
              {...register('api_key')}
              className="input-mono pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
