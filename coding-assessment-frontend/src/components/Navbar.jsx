function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds)
  const mm = String(Math.floor(safeSeconds / 60)).padStart(2, '0')
  const ss = String(safeSeconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export default function Navbar({
  examTitle,
  timeLeft,
  onSubmit,
  onToggleFullscreen,
  isSubmitted,
  isFullscreen,
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-700 bg-slate-900/90 px-4 backdrop-blur">
      <h1 className="text-lg font-semibold tracking-wide text-slate-100 md:text-xl">{examTitle}</h1>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="rounded-md border border-cyan-600/70 bg-cyan-950/40 px-3 py-1 font-mono text-sm text-cyan-200 md:text-base">
          {formatTime(timeLeft)}
        </div>

        <button
          type="button"
          onClick={onToggleFullscreen}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 transition hover:border-slate-400"
        >
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>

        <button
          type="button"
          disabled={isSubmitted}
          onClick={onSubmit}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {isSubmitted ? 'Submitted' : 'Submit'}
        </button>
      </div>
    </header>
  )
}
