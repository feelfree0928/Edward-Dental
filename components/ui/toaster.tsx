"use client";

import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-card text-card-foreground border border-border rounded-lg shadow-lg p-4 min-w-[300px] animate-in slide-in-from-bottom-4 fade-in"
          onClick={() => dismiss(toast.id)}
        >
          <h4 className="font-semibold text-sm">{toast.title}</h4>
          {toast.description && (
            <p className="text-xs text-muted-foreground mt-1">{toast.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}
