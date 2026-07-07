import { memo } from 'react'
import type { WorkingStatusInfo } from './workingStatus'

interface WorkingStatusBarProps {
  status: WorkingStatusInfo
}

const TONE_CLASS: Record<WorkingStatusInfo['tone'], string> = {
  working: 'border-accent-main-100/35 text-accent-main-100',
  permission: 'border-warning-100/40 text-warning-100',
  retry: 'border-warning-100/40 text-warning-100',
}

export const WorkingStatusBar = memo(function WorkingStatusBar({ status }: WorkingStatusBarProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`glass relative overflow-hidden rounded-xl border px-3 py-2 shadow-lg ${TONE_CLASS[status.tone]}`}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 animate-[slideRight_1.8s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-current/10 to-transparent" />
      <div className="relative flex min-w-0 items-center gap-2.5">
        <span className="flex h-4 items-center gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map(index => (
            <span
              key={index}
              className="h-2.5 w-1 rounded-full bg-current opacity-40 animate-pulse"
              style={{ animationDelay: `${index * 120}ms` }}
            />
          ))}
        </span>
        <span className="shrink-0 text-[length:var(--fs-sm)] font-semibold text-text-100">{status.title}</span>
        {status.detail && <span className="min-w-0 truncate text-[length:var(--fs-sm)] text-text-300">{status.detail}</span>}
        <span className="ml-auto font-mono text-current animate-pulse" aria-hidden="true">
          ▌
        </span>
      </div>
    </div>
  )
})
