import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Toast } from './ui'

interface ToastState {
  message: string
  error?: boolean
}

const ToastContext = createContext<(message: string, error?: boolean) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const show = useCallback((message: string, error?: boolean) => {
    setToast({ message, error })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <Toast message={toast.message} error={toast.error} />}
    </ToastContext.Provider>
  )
}
