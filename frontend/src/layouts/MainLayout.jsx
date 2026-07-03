import React, { useState } from 'react'
import { Activity, Zap, Server, Settings, MonitorPlay, Menu, X } from 'lucide-react'
import { useTelemetryStore } from '../store/useTelemetryStore'

const tabs = [
  { id: 'dashboard', icon: Activity, label: 'Tableau de bord' },
  { id: 'equipments', icon: Server, label: 'Équipements' },
  { id: 'billing', icon: MonitorPlay, label: 'Facturation' },
  { id: 'settings', icon: Settings, label: 'Paramètres' },
]

const subtitles = {
  dashboard: 'Supervision énergétique en temps réel',
  equipments: 'Contrôle à distance des relais',
  billing: 'Bilan tarifaire SBEE',
  settings: 'Configuration du système',
}

const NavItem = ({ tab, activeTab, setActiveTab, setSidebarOpen }) => {
  const Icon = tab.icon
  const isActive = activeTab === tab.id

  return (
    <button
      onClick={() => {
        setActiveTab(tab.id)
        setSidebarOpen(false)
      }}
      className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 text-left text-sm
        ${isActive
          ? 'bg-blue-800 text-white font-semibold shadow-sm'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{tab.label}</span>
    </button>
  )
}

const StatusBadge = ({ isConnected }) => (
  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium
    ${isConnected
      ? 'bg-green-50 border-green-200 text-green-700'
      : 'bg-red-50 border-red-200 text-red-600'
    }`}>
    <span className="relative flex h-2 w-2">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
      <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-green-600' : 'bg-red-600'}`}></span>
    </span>
    {isConnected ? 'Connecté' : 'Déconnecté'}
  </div>
)

const SidebarContent = ({ activeTab, setActiveTab, setSidebarOpen, isConnected }) => (
  <>
    <div className="px-4 pb-5 mb-2 border-b border-slate-200">
      <div className="flex items-center gap-3 mb-1">
        <div className="bg-blue-800 p-1.5 rounded-lg">
          <Zap className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-slate-900 tracking-wide">SENTINEL</h1>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest">Smart Energy Monitor</p>
        </div>
      </div>
    </div>

    <nav className="flex flex-col gap-1 flex-1 px-2">
      {tabs.map(tab => (
        <NavItem
          key={tab.id}
          tab={tab}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setSidebarOpen={setSidebarOpen}
        />
      ))}
    </nav>

    <div className="px-2 pt-4 border-t border-slate-200">
      <StatusBadge isConnected={isConnected} />
    </div>
  </>
)

export default function MainLayout({ children, activeTab, setActiveTab }) {
  const isConnected = useTelemetryStore(state => state.isConnected)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col bg-white border-r border-slate-200 pt-6 pb-5 gap-5 z-30 shadow-sm">
        <SidebarContent
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setSidebarOpen={setSidebarOpen}
          isConnected={isConnected}
        />
      </aside>

      {/* ── SIDEBAR MOBILE (overlay) ── */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-64 bg-white border-r border-slate-200 flex flex-col pt-6 pb-5 gap-5 z-50 shadow-lg">
            <div className="flex items-center justify-between px-4 mb-1">
              <span className="font-bold text-slate-900">Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              setSidebarOpen={setSidebarOpen}
              isConnected={isConnected}
            />
          </aside>
        </div>
      )}

      {/* ── CONTENU PRINCIPAL ── */}
      <div className="md:ml-60 flex flex-col min-h-screen">

        {/* Header Mobile */}
        <header className="md:hidden sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100">
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-slate-800 text-sm">SENTINEL</span>
          <StatusBadge isConnected={isConnected} />
        </header>

        {/* Header Desktop */}
        <header className="hidden md:block px-8 pt-7 pb-4 bg-white border-b border-slate-200 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">
            {tabs.find(t => t.id === activeTab)?.label}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">{subtitles[activeTab]}</p>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 md:px-8 py-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="hidden md:block px-8 py-3 border-t border-slate-200 bg-white text-center text-xs text-slate-400">
          SENTINEL — Système de supervision énergétique intelligente
        </footer>

        {/* Nav bas mobile */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-slate-200 flex shadow-md">
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors
                  ${isActive ? 'text-blue-800' : 'text-slate-400'}`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-medium">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="md:hidden h-16" />
      </div>
    </div>
  )
}