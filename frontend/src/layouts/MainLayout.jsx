import React, { useState } from 'react'
import { Activity, Zap, Server, Settings, MonitorPlay, Menu, X } from 'lucide-react'
import { useTelemetryStore } from '../store/useTelemetryStore'

const tabs = [
  { id: 'dashboard', icon: Activity, label: 'Dashboard' },
  { id: 'equipments', icon: Server, label: 'Équipements' },
  { id: 'billing', icon: MonitorPlay, label: 'Facturation' },
  { id: 'settings', icon: Settings, label: 'Paramètres' },
]

export default function MainLayout({ children, activeTab, setActiveTab }) {
  const isConnected = useTelemetryStore(state => state.isConnected)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const NavItem = ({ tab }) => {
    const Icon = tab.icon
    const isActive = activeTab === tab.id
    return (
      <button
        key={tab.id}
        onClick={() => { setActiveTab(tab.id); setSidebarOpen(false) }}
        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 text-left
          ${isActive
            ? 'bg-blue-600/15 text-blue-400 font-semibold'
            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span>{tab.label}</span>
      </button>
    )
  }

  const StatusBadge = () => (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium
      ${isConnected ? 'bg-emerald-950/40 border-emerald-900/50 text-emerald-400' : 'bg-rose-950/40 border-rose-900/50 text-rose-400'}`}>
      <span className={`relative flex h-2 w-2`}>
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
      </span>
      {isConnected ? 'En ligne' : 'Hors ligne'}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* ===== SIDEBAR DESKTOP ===== */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col bg-slate-900/60 backdrop-blur-xl border-r border-slate-800/50 p-6 gap-8 z-30">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/30">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">SENTINEL</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">Smart Energy</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {tabs.map(tab => <NavItem key={tab.id} tab={tab} />)}
        </nav>

        <StatusBadge />
      </aside>

      {/* ===== OVERLAY SIDEBAR MOBILE ===== */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 bg-slate-900 border-r border-slate-800 flex flex-col p-6 gap-8 z-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-xl"><Zap className="w-5 h-5 text-white" /></div>
                <span className="text-lg font-bold text-white">SENTINEL</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
              {tabs.map(tab => <NavItem key={tab.id} tab={tab} />)}
            </nav>
            <StatusBadge />
          </aside>
        </div>
      )}

      {/* ===== CONTENU PRINCIPAL ===== */}
      <div className="md:ml-64 flex flex-col min-h-screen">
        {/* Header Mobile */}
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800/50">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg"><Zap className="w-4 h-4 text-white" /></div>
            <span className="font-bold text-white">SENTINEL</span>
          </div>
          <StatusBadge />
        </header>

        {/* Header Desktop */}
        <header className="hidden md:flex items-center justify-between px-8 pt-8 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-white">
              {tabs.find(t => t.id === activeTab)?.label || 'Dashboard'}
            </h2>
            <p className="text-slate-400 text-sm mt-0.5">
              {activeTab === 'dashboard' && 'Audit énergétique en temps réel'}
              {activeTab === 'equipments' && 'Contrôle à distance des relais'}
              {activeTab === 'billing' && 'Bilan tarifaire SBEE'}
              {activeTab === 'settings' && 'Configuration du système'}
            </p>
          </div>
          <StatusBadge />
        </header>

        {/* CONTENU PAGE */}
        <main className="flex-1 px-4 md:px-8 py-4 md:py-6">
          {children}
        </main>

        {/* ===== NAVIGATION BAS MOBILE ===== */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800/50 flex">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 transition-colors
                  ${isActive ? 'text-blue-400' : 'text-slate-500'}`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* Espace pour nav mobile */}
        <div className="md:hidden h-16" />
      </div>
    </div>
  )
}
