import React from 'react';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

interface ToastCenterProps {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}

const kindClass: Record<ToastKind, string> = {
  info: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-100',
  success: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-400/40 bg-amber-500/10 text-amber-100',
  error: 'border-red-400/40 bg-red-500/10 text-red-100',
};

const ToastCenter: React.FC<ToastCenterProps> = ({ items, onDismiss }) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-4 right-4 z-50 flex w-[340px] max-w-[90vw] flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur ${kindClass[item.kind]}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="font-mono leading-relaxed">{item.message}</div>
            <button
              onClick={() => onDismiss(item.id)}
              className="shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-70 hover:opacity-100"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ToastCenter;