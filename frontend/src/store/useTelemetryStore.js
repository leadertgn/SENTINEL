import { create } from 'zustand'

const WS_URL = `${import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000'}/api/telemetry/ws/telemetry`
const MAX_LIVE_POINTS = 30

export const useTelemetryStore = create((set, get) => ({
  telemetry: {
    master_power: 0,
    voltage: 220,
    current: 0,
    power_factor: 0.95,
    frequency_hz: 50,
    nodes: [],
    unknown_power: 0,
    total_kwh: 0,
    billing: {
      month_kwh: 0,
      estimated_cost_fcfa: 0,
      active_tariff: null,
    },
  },
  // Historique live (N derniers points WebSocket)
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
          power: payload.master_power,
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
