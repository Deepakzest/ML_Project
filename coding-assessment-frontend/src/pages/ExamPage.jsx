import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Navbar from '../components/Navbar'
import ProblemPanel from '../components/ProblemPanel'
import CodeEditor from '../components/CodeEditor'
import ProctorPanel from '../components/ProctorPanel'
import ConsolePanel from '../components/ConsolePanel'
import { createSocketClient } from '../services/socket'

const EXAM_DURATION_SECONDS = 60 * 60

const DEFAULT_CODE = `#include <bits/stdc++.h>
using namespace std;

int main() {

    return 0;
}`

const ALERT_MESSAGES = {
  MULTIPLE_FACE: 'Multiple face detected',
  LOOKING_AWAY: 'Looking away detected',
  NO_FACE: 'No face detected',
  PHONE_DETECTED: 'Phone detected',
  TAB_SWITCH: 'Tab switching detected',
  FULLSCREEN_EXIT: 'Fullscreen mode required for exam',
}

function nowTime() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false })
}

function normalizeLiveStatus(status) {
  const persons = Number(status.persons ?? 0)

  return {
    face_present:
      typeof status.face_present === 'boolean'
        ? status.face_present
        : persons > 0,
    multiple_faces:
      typeof status.multiple_faces === 'boolean'
        ? status.multiple_faces
        : persons > 1,
    phone_detected: Boolean(status.phone_detected),
    looking_away: Boolean(status.looking_away),
  }
}

async function fetchLiveStatus() {
  const response = await fetch(`/live-status?ts=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) throw new Error('HTTP ' + response.status)
  return response.json()
}

export default function ExamPage() {
  const [timeLeft, setTimeLeft] = useState(EXAM_DURATION_SECONDS)
  const [isStarted, setIsStarted] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement))
  const [stream, setStream] = useState(null)
  const [startError, setStartError] = useState('')

  const [code, setCode] = useState(DEFAULT_CODE)
  const [customInput, setCustomInput] = useState('')
  const [outputLines, setOutputLines] = useState([])
  const [alerts, setAlerts] = useState([])
  const [proctorStatus, setProctorStatus] = useState({
    faceDetected: true,
    multipleFaces: false,
    lookingAway: false,
    phoneDetected: false,
  })
  const [rawLiveStatus, setRawLiveStatus] = useState(null)
  const [liveStatusError, setLiveStatusError] = useState(null)

  const [splitOne, setSplitOne] = useState(34)
  const [splitTwo, setSplitTwo] = useState(74)
  const [dragging, setDragging] = useState(null)
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024)
  const mainGridRef = useRef(null)
  const socketRef = useRef(null)
  const alertIdRef = useRef(0)
  const lastLiveStatusRef = useRef({
    multiple_faces: false,
    phone_detected: false,
    looking_away: false,
    face_present: true,
  })

  const editorDisabled = !isStarted || isSubmitted || timeLeft <= 0

  const pushConsoleLine = useCallback((text) => {
    setOutputLines((previous) => [...previous, { id: crypto.randomUUID(), text }])
  }, [])

  const pushAlert = useCallback(
    (type) => {
      const message = ALERT_MESSAGES[type] || type
      const timestamp = nowTime()
      alertIdRef.current += 1
      const alert = { id: alertIdRef.current, type, message, timestamp, createdAt: Date.now() }

      setAlerts((previous) => [alert, ...previous])
      pushConsoleLine(`[ALERT] ${message} at ${timestamp}`)
      console.warn({ type, timestamp })
      socketRef.current?.send({ type: 'ALERT_LOG', payload: { type, timestamp } })

      setProctorStatus((previous) => ({
        ...previous,
        faceDetected: type !== 'NO_FACE',
        multipleFaces: type === 'MULTIPLE_FACE',
        lookingAway: type === 'LOOKING_AWAY',
        phoneDetected: type === 'PHONE_DETECTED',
      }))
    },
    [pushConsoleLine],
  )

  const submitExam = useCallback(
    (reason = 'Manual submit') => {
      if (isSubmitted) {
        return
      }
      setIsSubmitted(true)
      pushConsoleLine(`Exam submitted (${reason}) at ${nowTime()}`)
    },
    [isSubmitted, pushConsoleLine],
  )

  const requestFullscreen = async () => {
    if (document.fullscreenElement) {
      return
    }
    await document.documentElement.requestFullscreen()
  }

  const handleStartExam = async () => {
    setStartError('')

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      })
      setStream(mediaStream)
    } catch {
      setStartError('Camera access is required to start the exam.')
      return
    }

    try {
      await requestFullscreen()
    } catch {
      setStartError('Fullscreen mode is required to start the exam.')
      return
    }

    setIsStarted(true)
    pushConsoleLine('Exam started. Demo execution mode active.')
  }

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await requestFullscreen()
      }
    } catch {
      pushAlert('FULLSCREEN_EXIT')
    }
  }

  const handleRunCode = () => {
    pushConsoleLine('Demo execution mode')
    pushConsoleLine('Test Case 1: Passed')
    pushConsoleLine('Test Case 2: Failed')
  }

  useEffect(() => {
    if (!isStarted || isSubmitted) {
      return
    }

    if (timeLeft <= 0) {
      submitExam('Time completed (auto-submit)')
      return
    }

    const timer = setInterval(() => {
      setTimeLeft((previous) => previous - 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [isStarted, isSubmitted, submitExam, timeLeft])

  useEffect(() => {
    const onContextMenu = (event) => event.preventDefault()
    const onVisibilityChange = () => {
      if (document.hidden && isStarted && !isSubmitted) {
        pushAlert('TAB_SWITCH')
      }
    }
    const onFullscreenChange = () => {
      const active = Boolean(document.fullscreenElement)
      setIsFullscreen(active)
      if (!active && isStarted && !isSubmitted) {
        pushAlert('FULLSCREEN_EXIT')
      }
    }

    document.addEventListener('contextmenu', onContextMenu)
    document.addEventListener('visibilitychange', onVisibilityChange)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      document.removeEventListener('contextmenu', onContextMenu)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  }, [isStarted, isSubmitted, pushAlert])

  useEffect(() => {
    socketRef.current = createSocketClient('ws://localhost:5000', {
      onOpen: () => {},
      onClose: () => {},
      onError: () => {},
      onMessage: (payload) => {
        let eventType = payload
        try {
          const parsed = JSON.parse(payload)
          eventType = parsed.type || parsed.event || payload
        } catch {
          eventType = payload
        }

        if (ALERT_MESSAGES[eventType]) {
          pushAlert(eventType)
        }
      },
    })

    return () => {
      socketRef.current?.disconnect()
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [pushAlert, pushConsoleLine, stream])

  const handleDetectionResult = useCallback(
    (rawStatus) => {
      setRawLiveStatus(rawStatus)
      setLiveStatusError(null)
      const status = normalizeLiveStatus(rawStatus)
      const previous = lastLiveStatusRef.current

      setProctorStatus({
        faceDetected: status.face_present !== false,
        multipleFaces: Boolean(status.multiple_faces),
        lookingAway: Boolean(status.looking_away),
        phoneDetected: Boolean(status.phone_detected),
      })

      if (status.multiple_faces && !previous.multiple_faces) pushAlert('MULTIPLE_FACE')
      if (status.looking_away && !previous.looking_away) pushAlert('LOOKING_AWAY')
      if (status.phone_detected && !previous.phone_detected) pushAlert('PHONE_DETECTED')
      if (status.face_present === false && previous.face_present !== false) pushAlert('NO_FACE')

      lastLiveStatusRef.current = {
        multiple_faces: Boolean(status.multiple_faces),
        phone_detected: Boolean(status.phone_detected),
        looking_away: Boolean(status.looking_away),
        face_present: status.face_present !== false,
      }
    },
    [pushAlert],
  )

  // analyzeFrame is called by ProctorPanel every 500 ms with a base64 JPEG frame.
  // It POSTs the frame to Python which does YOLO + MediaPipe on the server side,
  // sidestepping the camera-sharing conflict that caused the old webcam loop to exit.
  const analyzeFrame = useCallback(
    async (frameB64) => {
      try {
        const res = await fetch('/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frame: frameB64 }),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        handleDetectionResult(await res.json())
      } catch (err) {
        setLiveStatusError(err.message ?? 'POST failed')
      }
    },
    [handleDetectionResult],
  )

  useEffect(() => {
    if (!isStarted || isSubmitted) {
      return
    }

    let isActive = true

    const syncLiveStatus = async () => {
      try {
        const rawStatus = await fetchLiveStatus()
        if (!isActive) {
          return
        }
        handleDetectionResult(rawStatus)
      } catch (err) {
        if (!isActive) {
          return
        }
        setLiveStatusError(err.message ?? 'GET failed')
      }
    }

    syncLiveStatus()
    const timer = setInterval(syncLiveStatus, 1500)

    return () => {
      isActive = false
      clearInterval(timer)
    }
  }, [handleDetectionResult, isStarted, isSubmitted])

  useEffect(() => {
    if (!dragging) {
      return
    }

    const onMouseMove = (event) => {
      if (!mainGridRef.current) {
        return
      }

      const bounds = mainGridRef.current.getBoundingClientRect()
      const pointerPercent = ((event.clientX - bounds.left) / bounds.width) * 100

      if (dragging === 'first') {
        const next = Math.min(Math.max(pointerPercent, 20), splitTwo - 20)
        setSplitOne(next)
      }

      if (dragging === 'second') {
        const next = Math.max(Math.min(pointerPercent, 80), splitOne + 20)
        setSplitTwo(next)
      }
    }

    const onMouseUp = () => setDragging(null)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [dragging, splitOne, splitTwo])

  const alertPulse = useMemo(() => {
    if (!alerts[0]) {
      return false
    }
    return Date.now() - alerts[0].createdAt < 4000
  }, [alerts])

  const desktopGridStyle = useMemo(
    () => ({
      gridTemplateColumns: `${splitOne}fr 6px ${splitTwo - splitOne}fr 6px ${100 - splitTwo}fr`,
    }),
    [splitOne, splitTwo],
  )

  return (
    <div className="h-screen bg-slate-950 text-slate-100">
      {!isStarted && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/95 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold">Start Secure Coding Exam</h2>
            <p className="mt-2 text-sm text-slate-300">
              Camera permission and fullscreen mode are required before the assessment begins.
            </p>
            {startError && <p className="mt-3 rounded bg-rose-950/60 p-2 text-sm text-rose-200">{startError}</p>}
            <button
              type="button"
              onClick={handleStartExam}
              className="mt-4 w-full rounded-md bg-cyan-600 py-2 font-semibold text-white transition hover:bg-cyan-500"
            >
              Start Exam
            </button>
          </div>
        </div>
      )}

      <div className="grid h-full grid-rows-[auto_1fr_28%] gap-2 p-2">
        <Navbar
          examTitle="DSA Final Coding Assessment"
          timeLeft={timeLeft}
          onSubmit={() => submitExam('Manual submit')}
          onToggleFullscreen={handleToggleFullscreen}
          isSubmitted={isSubmitted}
          isFullscreen={isFullscreen}
        />

        <main
          ref={mainGridRef}
          className="grid min-h-0 gap-2 max-lg:grid-cols-1 lg:grid-cols-[1fr_6px_1fr_6px_1fr]"
          style={isDesktop ? desktopGridStyle : undefined}
        >
          <ProblemPanel />

          <div
            className="hidden cursor-col-resize rounded bg-slate-700/60 transition hover:bg-cyan-500/60 lg:block"
            onMouseDown={() => setDragging('first')}
          />

          <CodeEditor
            code={code}
            onCodeChange={setCode}
            onRunCode={handleRunCode}
            onSubmitCode={() => submitExam('Submitted from editor panel')}
            disabled={editorDisabled}
          />

          <div
            className="hidden cursor-col-resize rounded bg-slate-700/60 transition hover:bg-cyan-500/60 lg:block"
            onMouseDown={() => setDragging('second')}
          />

          <ProctorPanel
            stream={stream}
            status={proctorStatus}
            alerts={alerts}
            highlight={alertPulse}
            rawStatus={rawLiveStatus}
            fetchError={liveStatusError}
            onFrameCapture={isStarted && !isSubmitted ? analyzeFrame : null}
          />
        </main>

        <ConsolePanel customInput={customInput} onInputChange={setCustomInput} outputLines={outputLines} />
      </div>
    </div>
  )
}
