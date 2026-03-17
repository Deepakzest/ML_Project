export function createSocketClient(url, { onOpen, onClose, onError, onMessage } = {}) {
  let socket = null
  let reconnectTimer = null
  let manuallyClosed = false

  const connect = () => {
    socket = new WebSocket(url)

    socket.onopen = (event) => {
      onOpen?.(event)
    }

    socket.onclose = (event) => {
      onClose?.(event)
      if (!manuallyClosed) {
        reconnectTimer = setTimeout(connect, 2500)
      }
    }

    socket.onerror = (event) => {
      onError?.(event)
    }

    socket.onmessage = (event) => {
      onMessage?.(event.data)
    }
  }

  connect()

  return {
    send(payload) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false
      }
      const message = typeof payload === 'string' ? payload : JSON.stringify(payload)
      socket.send(message)
      return true
    },
    disconnect() {
      manuallyClosed = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      if (socket) {
        socket.close()
      }
    },
  }
}
