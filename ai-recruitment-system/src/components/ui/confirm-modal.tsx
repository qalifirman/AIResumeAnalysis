import { useEffect } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="bg-surface-dark border border-border-dark rounded-2xl w-full max-w-sm shadow-card p-6 flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <div className={`size-10 rounded-xl flex items-center justify-center flex-shrink-0 ${confirmVariant === 'danger' ? 'bg-red-500/15' : 'bg-primary/15'}`}>
            <span className={`material-symbols-outlined ${confirmVariant === 'danger' ? 'text-red-400' : 'text-primary'}`}>
              {confirmVariant === 'danger' ? 'warning' : 'help'}
            </span>
          </div>
          <div>
            <h3 className="text-white font-bold text-base">{title}</h3>
            <p className="text-text-muted text-sm mt-1 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-surface-hover border border-border-dark text-text-muted text-sm font-medium hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-white text-sm font-bold transition-colors ${
              confirmVariant === 'danger'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
