export default function ConsolePanel({ customInput, onInputChange, outputLines }) {
  return (
    <section className="panel flex h-full flex-col">
      <div className="mb-3 border-b border-slate-700 pb-2">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Console Output / Test Cases</p>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Custom Input</label>
          <textarea
            value={customInput}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Enter custom input here"
            className="h-full min-h-[120px] w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 outline-none transition focus:border-cyan-500"
          />
        </div>

        <div className="min-h-0 md:col-span-2">
          <label className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-400">Output Console</label>
          <div className="h-full min-h-[120px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm text-slate-200">
            {outputLines.length === 0 ? (
              <p className="text-slate-500">Console ready.</p>
            ) : (
              outputLines.map((line) => (
                <p key={line.id} className="mb-1 whitespace-pre-wrap">
                  {line.text}
                </p>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
