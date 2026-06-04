import { useState, useCallback } from "react";

interface Toast {
  id: string;
  title: string;
  description?: string;
}

interface UseToastReturn {
  toast: (options: { title: string; description?: string }) => void;
  toasts: Toast[];
  dismiss: (id: string) => void;
}

let toastId = 0;

export function useToast(): UseToastReturn {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((options: { title: string; description?: string }) => {
    const id = `toast-${++toastId}`;
    setToasts((prev) => [...prev, { id, ...options }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toast, toasts, dismiss };
}
