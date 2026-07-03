import React, { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useTelemetryStore } from './store/useTelemetryStore'

import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import Equipments from './pages/Equipments'
import Billing from './pages/Billing'
import Settings from './pages/Settings'

// Initialisation de React Query
const queryClient = new QueryClient()

function RootApp() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const connectTelemetry = useTelemetryStore(state => state.connect)

  // Connexion de Zustand au WebSocket au démarrage
  useEffect(() => {
    connectTelemetry()
  }, [connectTelemetry])

  return (
    <MainLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'dashboard' && <Dashboard />}
      {activeTab === 'equipments' && <Equipments />}
      {activeTab === 'billing' && <Billing />}
      {activeTab === 'settings' && <Settings />}
    </MainLayout>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RootApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
