const SAMPLE_PROBLEM = {
  title: 'Two Sum',
  statement:
    'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume each input has exactly one solution, and you may not use the same element twice.',
  constraints: [
    '2 <= nums.length <= 10^4',
    '-10^9 <= nums[i] <= 10^9',
    '-10^9 <= target <= 10^9',
    'Only one valid answer exists.',
  ],
  example: {
    input: 'nums = [2,7,11,15]\ntarget = 9',
    output: '[0,1]',
  },
}

export default function ProblemPanel() {
  return (
    <section className="panel overflow-hidden">
      <div className="mb-4 border-b border-slate-700 pb-3">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Problem</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">{SAMPLE_PROBLEM.title}</h2>
      </div>

      <div className="space-y-5 overflow-y-auto pr-1 text-sm leading-6 text-slate-200">
        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-cyan-300">Problem Statement</h3>
          <p>{SAMPLE_PROBLEM.statement}</p>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-cyan-300">Constraints</h3>
          <ul className="list-disc space-y-1 pl-5">
            {SAMPLE_PROBLEM.constraints.map((constraint) => (
              <li key={constraint}>{constraint}</li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-cyan-300">Example</h3>
          <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-3 font-mono text-sm">
            <p className="text-slate-300">Input:</p>
            <pre className="mt-1 whitespace-pre-wrap text-slate-100">{SAMPLE_PROBLEM.example.input}</pre>
            <p className="mt-3 text-slate-300">Output:</p>
            <pre className="mt-1 whitespace-pre-wrap text-slate-100">{SAMPLE_PROBLEM.example.output}</pre>
          </div>
        </div>
      </div>
    </section>
  )
}
