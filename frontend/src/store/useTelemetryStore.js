import { create } from 'zustand'

const WS_URL = `${import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000'}/api/telemetry/ws/telemetry`
const MAX_LIVE_POINTS = 30

export const useTelemetryStore = create((set, get) => ({
  // État initial conforme à la nouvelle vision
  telemetry: {
    master: { power: 0, voltage: 0, current: 0, kwh_total: 0, pf: 0, hz: 0 },
    nodes: [],
    audit: { unknown_w: 0, nodes_total_w: 0 },
    billing: { total_fcfa: 0, active_tariff: "Attente...", price_per_kwh: 0 },
    timestamp: null
  },
  liveHistory: [],
  isConnected: false,

  connect: () => {
    if (get().isConnected) return

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => set({ isConnected: true })

    ws.onclose = () => {
      set({ isConnected: false })
      setTimeout(() => get().connect(), 3000)
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type !== 'TELEMETRY_UPDATE') return

        const newPoint = {
          time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          power: payload.master?.power || 0,
        }

        set((state) => ({
          telemetry: payload,
          liveHistory: [...state.liveHistory, newPoint].slice(-MAX_LIVE_POINTS),
        }))
      } catch (e) {
        console.error('WS parse error:', e)
      }
    }
  },
}))
