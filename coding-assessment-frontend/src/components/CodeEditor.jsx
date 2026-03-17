import Editor from '@monaco-editor/react'
import { useRef } from 'react'

export default function CodeEditor({ code, onCodeChange, onRunCode, onSubmitCode, disabled }) {
  const editorRef = useRef(null)

  const handleMount = (editor) => {
    editorRef.current = editor

    const domNode = editor.getDomNode()
    if (domNode) {
      const preventClipboard = (event) => event.preventDefault()
      domNode.addEventListener('copy', preventClipboard)
      domNode.addEventListener('cut', preventClipboard)
      domNode.addEventListener('paste', preventClipboard)
    }
  }

  return (
    <section className="panel flex min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between border-b border-slate-700 pb-2">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Code Editor</p>
        {disabled && <span className="rounded bg-rose-900/70 px-2 py-1 text-xs text-rose-200">Read Only</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-700">
        <Editor
          height="100%"
          defaultLanguage="cpp"
          value={code}
          onMount={handleMount}
          onChange={(nextValue) => onCodeChange(nextValue ?? '')}
          theme="vs-dark"
          options={{
            readOnly: disabled,
            minimap: { enabled: false },
            contextmenu: false,
            fontSize: 14,
            fontFamily: 'JetBrains Mono, monospace',
            lineNumbers: 'on',
            automaticLayout: true,
            autoIndent: 'advanced',
            bracketPairColorization: { enabled: true },
            wordWrap: 'on',
          }}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onRunCode}
          disabled={disabled}
          className="rounded-md border border-blue-500/70 bg-blue-900/40 px-4 py-2 text-sm font-medium text-blue-100 transition hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Run Code
        </button>

        <button
          type="button"
          onClick={onSubmitCode}
          disabled={disabled}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          Submit Code
        </button>
      </div>
    </section>
  )
}
