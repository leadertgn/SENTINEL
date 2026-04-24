import React, { useMemo } from 'react'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { Activity, Info, Zap, ShieldAlert } from 'lucide-react'

// --- COMPOSANT : CARTE APPAREIL (Device Card) ---
const DeviceCard = ({ device }) => {
  const isMaster = device.role === 'MASTER'
  const isOnline = device.status === 'ONLINE'
  
  // Couleurs conditionnelles
  const themeColor = isMaster ? 'blue' : 'emerald'
  const bgGradient = isMaster ? 'from-blue-900/20 to-slate-900/40' : 'from-emerald-900/10 to-slate-900/40'
  const borderColor = isMaster ? 'border-blue-500/20' : 'border-slate-800/50'

  return (
    <div className={`p-6 rounded-3xl border bg-gradient-to-br ${bgGradient} ${borderColor} shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-${themeColor}-500/40 transition-colors duration-300`}>
      
      {/* --- En-tête de la carte --- */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-black text-white tracking-tight">{device.name}</h3>
            {isMaster && (
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-${themeColor}-500/20 text-${themeColor}-400 border border-${themeColor}-500/30`}>
                Général
              </span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 font-mono bg-slate-950/50 px-2 py-0.5 rounded border border-slate-800">
            {device.mac}
          </span>
        </div>

        {/* Indicateur de statut */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800">
          <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? `bg-${themeColor}-500 shadow-[0_0_8px_currentColor] text-${themeColor}-500` : 'bg-rose-500'}`}></div>
          <span className={`text-[9px] font-bold uppercase tracking-widest ${isOnline ? `text-${themeColor}-400` : 'text-rose-500'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* --- Mesure Principale : PUISSANCE (W) --- */}
      <div className="mb-6 flex items-end gap-2">
        <p className={`text-5xl font-black leading-none ${isMaster ? 'text-blue-400' : 'text-emerald-400'}`}>
          {(device.power || 0).toFixed(0)}
        </p>
        <p className="text-sm font-bold text-slate-400 uppercase mb-1">Watts</p>
      </div>

      {/* --- Grille des sous-métriques --- */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-slate-950/40 rounded-2xl border border-slate-800/50 flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Tension</span>
          <span className="text-sm font-black text-white">{(device.voltage || 0).toFixed(1)} <small className="text-[10px] text-slate-500 font-bold">V</small></span>
        </div>
        <div className="p-3 bg-slate-950/40 rounded-2xl border border-slate-800/50 flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Courant</span>
          <span className="text-sm font-black text-white">{(device.current || 0).toFixed(2)} <small className="text-[10px] text-slate-500 font-bold">A</small></span>
        </div>
        <div className="p-3 bg-slate-950/40 rounded-2xl border border-slate-800/50 flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Cos φ</span>
          <span className="text-sm font-black text-white">{(device.power_factor || 0).toFixed(2)}</span>
        </div>
        <div className="p-3 bg-slate-950/40 rounded-2xl border border-slate-800/50 flex flex-col justify-between">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Fréquence</span>
          <span className="text-sm font-black text-white">{(device.frequency_hz || 0).toFixed(1)} <small className="text-[10px] text-slate-500 font-bold">Hz</small></span>
        </div>
      </div>

      {/* --- Pied de carte : Énergie --- */}
      <div className="mt-4 pt-4 border-t border-slate-800/50 flex justify-between items-center">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
          <Zap className="w-3 h-3" /> Énergie Cumulée
        </span>
        <span className="text-xs font-black text-white">{((device.kwh_total || 0) * 1000).toFixed(1)} Wh</span>
      </div>

      {/* Halo de fond */}
      <div className={`absolute -bottom-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-10 bg-${themeColor}-500 pointer-events-none`}></div>
    </div>
  )
}

export default function Dashboard() {
  const { telemetry, liveHistory } = useTelemetryStore()
  
  const auditData = useMemo(() => [
    { name: 'Nodes Monitorés', value: telemetry.nodes.reduce((acc, n) => acc + (n.power || 0), 0), color: '#10b981' }, // emerald-500
    { name: 'Charge Inconnue', value: Math.max(0, telemetry.audit.unknown_w), color: '#f43f5e' } // rose-500
  ], [telemetry])

  if (!telemetry.timestamp) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4 text-slate-500">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-black text-xl tracking-tighter animate-pulse uppercase">Synchronisation des relevés...</p>
      </div>
    )
  }

  // Liste unifiée : Master en premier, suivi des Nodes
  const allDevices = [telemetry.master, ...telemetry.nodes]

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-0 space-y-8">
      
      {/* --- SECTION 1 : RELEVÉS INDIVIDUELS (Device Cards) --- */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-500" /> Relevés en Temps Réel
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {allDevices.map(device => (
            <DeviceCard key={device.mac} device={device} />
          ))}
        </div>
      </div>

      {/* --- SECTION 2 : CONSOLIDATION (Graphique & Audit) --- */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 mt-4">
          <ShieldAlert className="w-4 h-4 text-slate-500" /> Consolidation & Audit
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* GRAPHIQUE LIVE (Master) */}
          <div className="lg:col-span-2 p-6 bg-slate-900/60 border border-slate-800 rounded-3xl relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em]">
                Profil de Charge Global (Master)
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-blue-400">{(telemetry.master.power || 0).toFixed(0)} W</span>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={liveHistory}>
                  <defs>
                    <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={[0, 'dataMax + 500']} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }}
                    itemStyle={{ color: '#3b82f6', fontSize: '14px', fontWeight: '900' }}
                    labelStyle={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase' }}
                    formatter={(value) => [`${Math.round(value)} Watts`, 'Puissance']}
                  />
                  <Area 
                    type="monotone" dataKey="power" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorPower)" 
                    isAnimationActive={true} animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AUDIT DIFFERENTIEL */}
          <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-2 uppercase tracking-[0.2em] mb-2">
                <Info className="w-4 h-4 text-rose-500" /> Bilan Différentiel
              </h3>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Répartition instantanée de la puissance totale mesurée par le Master.
              </p>
            </div>
            
            <div className="h-44 w-full my-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={auditData} innerRadius={55} outerRadius={75} paddingAngle={8} dataKey="value" cornerRadius={4}>
                    {auditData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                    formatter={(value) => [`${Math.round(value)} W`, '']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="space-y-2">
              {auditData.map(item => (
                <div key={item.name} className="flex justify-between items-center px-4 py-2.5 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                  <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.name}</span>
                  </div>
                  <span className="text-sm font-black text-white">{item.value.toFixed(0)} W</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
