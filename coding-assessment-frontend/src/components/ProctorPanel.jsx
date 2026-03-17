import { useEffect, useRef, useState } from 'react'

const STATUS_ITEMS = [
  { key: 'faceDetected', label: 'Face Detected', alertWhenTrue: false },
  { key: 'multipleFaces', label: 'Multiple Faces', alertWhenTrue: true },
  { key: 'lookingAway', label: 'Looking Away', alertWhenTrue: true },
  { key: 'phoneDetected', label: 'Phone Detected', alertWhenTrue: true },
]

export default function ProctorPanel({ stream, status, alerts, highlight, rawStatus, fetchError, onFrameCapture }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Capture a frame from the <video> every 500 ms and hand it to ExamPage for analysis
  useEffect(() => {
    if (!stream || !onFrameCapture) return
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')

    const capture = () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      ctx.drawImage(video, 0, 0, 320, 240)
      const frameB64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
      onFrameCapture(frameB64)
    }

    const id = setInterval(capture, 500)
    return () => clearInterval(id)
  }, [stream, onFrameCapture])

  return (
    <section
      className={`panel flex min-h-0 flex-col transition ${
        highlight ? 'ring-2 ring-amber-400/80' : 'ring-1 ring-transparent'
      }`}
    >
      <div className="mb-3 border-b border-slate-700 pb-2">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-400">AI Proctoring</p>
      </div>

      <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
        <video ref={videoRef} autoPlay playsInline muted className="h-44 w-full object-cover" />
        {!stream && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Webcam not started
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        {STATUS_ITEMS.map((item) => {
          const value = Boolean(status[item.key])
          const isAlert = item.alertWhenTrue ? value : !value
          return (
            <div key={item.key} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    isAlert
                      ? 'bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.8)]'
                      : 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]'
                  }`}
                  title={isAlert ? 'Alert Active' : 'Normal'}
                />
                <span className="text-slate-200">{item.label}</span>
              </div>
              <span className={`text-xs ${isAlert ? 'text-rose-300' : 'text-emerald-300'}`}>
                {item.key === 'faceDetected'
                  ? value
                    ? 'Detected'
                    : 'Missing'
                  : value
                    ? 'Alert'
                    : 'Normal'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 min-h-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-400">Alert Logs</p>
        <div className="h-full overflow-y-auto pr-1 text-sm text-slate-200">
          {alerts.length === 0 ? (
            <p className="text-slate-400">No alerts yet.</p>
          ) : (
            alerts.map((alert) => (
              <div key={alert.id} className="mb-2 rounded border border-amber-700/50 bg-amber-950/30 px-2 py-1">
                <p>
                  [WARNING] {alert.message} at {alert.timestamp}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Debug overlay — shows raw detector payload so you can verify connection */}
      <div className="mt-2 rounded border border-slate-600 bg-slate-900/80 p-2 font-mono text-xs text-slate-400">
        <span className="mr-2 text-slate-500">Detector:</span>
        {fetchError
          ? <span className="text-rose-400">⚠ {fetchError}</span>
          : rawStatus
            ? <span className="text-emerald-300">
                faces={rawStatus.faces ?? '?'} multi={String(rawStatus.multiple_faces)} phone={String(rawStatus.phone_detected)} look={String(rawStatus.looking_away)}
              </span>
            : <span className="text-slate-500">waiting…</span>
        }
      </div>
    </section>
  )
}

