import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'rgb(var(--color-slate-900))',
              color: 'rgb(var(--color-slate-200))',
              border: '1px solid rgb(var(--color-slate-800))',
            },
            success: {
              iconTheme: {
                primary: 'rgb(var(--color-emerald-500))',
                secondary: 'rgb(var(--color-slate-900))',
              },
            },
            error: {
              iconTheme: {
                primary: 'rgb(var(--color-red-500))',
                secondary: 'rgb(var(--color-slate-900))',
              },
            },
          }}
        />
        <ReactQueryDevtools initialIsOpen={false} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
