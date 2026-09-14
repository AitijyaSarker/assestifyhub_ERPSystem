'use client';

export function ConfirmDialog({
  open,
  title,
  onCancel,
  onConfirm,
  confirmLabel = 'Confirm',
}: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <p className="mb-6 text-slate-800">{title}</p>
        <div className="flex justify-end gap-2">
          <button className="rounded-md px-3 py-2 text-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="rounded-md bg-accent px-3 py-2 text-sm text-white" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
