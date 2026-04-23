import React, { useState, useEffect, useMemo } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  AreaChart, Area, CartesianGrid, XAxis, YAxis,
} from 'recharts'
import { Zap, Activity, ShieldCheck, Wallet, Info, Power } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTelemetryStore } from '../store/useTelemetryStore'

const API_URL = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/telemetry`

// --- Sous-composant : Jauge de Puissance ---
function PowerGauge({ value, max = 5000, label = "Puissance Totale" }) {
  const percentage = Math.min((value / max) * 100, 100)
  const color = value > 4000 ? '#ef4444' : value > 2000 ? '#f59e0b' : '#10b981'

  return (
    <div className="relative flex flex-col items-center justify-center p-6 bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
      <div className="absolute inset-0 opacity-10 bg-radial-gradient from-blue-500/20 to-transparent" />
      <svg className="w-48 h-48 transform -rotate-90">
        <circle cx="96" cy="96" r="80" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-slate-800" />
        <circle cx="96" cy="96" r="80" stroke={color} strokeWidth="12" fill="transparent"
          strokeDasharray={502} strokeDashoffset={502 - (502 * percentage) / 100}
          className="transition-all duration-1000 ease-out" strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-4xl font-black text-white">{value.toLocaleString()}</span>
        <span className="text-slate-500 font-bold text-xs tracking-widest uppercase">Watts</span>
      </div>
      <h3 className="mt-4 text-slate-400 font-semibold text-sm flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-400" /> {label}
      </h3>
    </div>
  )
}

// --- Sous-composant : Barre SBEE ---
function BillingProgress({ currentKwh, totalFcfa, tariffName }) {
  // Seuil social SBEE typique : 50kWh
  const threshold = 50
  const progress = Math.min((currentKwh / threshold) * 100, 100)
  
  return (
    <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/20 rounded-xl"><Wallet className="text-emerald-400 w-5 h-5" /></div>
          <div>
            <h3 className="text-white font-bold">Budget Énergie</h3>
            <p className="text-slate-500 text-xs">{tariffName}</p>
          </div>
        </div>
        <span className="text-2xl font-black text-emerald-400">{totalFcfa.toLocaleString()} <small className="text-[10px]">FCFA</small></span>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter text-slate-500">
          <span>Tranche Sociale</span>
          <span>{currentKwh.toFixed(1)} / {threshold} kWh</span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}

// --- Sous-composant : Carte Node ---
function NodeCard({ node }) {
  const isOff = !node.is_active || node.status === 'OFFLINE'
  
  const toggle = async () => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/devices/${node.mac}/toggle`, {
        method: 'POST'
      })
    } catch (e) { console.error("Toggle error", e) }
  }

  return (
    <div className={`p-4 rounded-2xl border transition-all duration-300 ${isOff ? 'bg-slate-950/40 border-slate-900 opacity-60' : 'bg-slate-900/80 border-slate-700 shadow-lg shadow-blue-500/5'}`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${node.status === 'ONLINE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {node.status}
        </span>
        <button onClick={toggle} className={`p-2 rounded-xl transition-colors ${node.is_active ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
          <Power className="w-4 h-4" />
        </button>
      </div>
      <h4 className="text-slate-300 font-bold text-sm mb-1 truncate">{node.name}</h4>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-black text-white">{node.power}</span>
        <span className="text-slate-500 text-xs font-bold uppercase">W</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { telemetry, liveHistory } = useTelemetryStore()
  
  const auditData = useMemo(() => [
    ...telemetry.nodes.map((n, i) => ({ name: n.name, value: n.power, color: i % 2 === 0 ? '#3b82f6' : '#10b981' })),
    { name: 'Inconnu', value: telemetry.audit.unknown_w, color: '#64748b' }
  ].filter(d => d.value > 0), [telemetry])

  if (!telemetry.timestamp) {
    return <div className="h-screen flex items-center justify-center text-slate-500 animate-pulse font-black text-2xl">SENTINEL INITIALIZATION...</div>
  }

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 space-y-6">
      
      {/* --- HEADER : VUE D'ENSEMBLE --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PowerGauge value={telemetry.master.power} />
        
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Tension</p>
              <p className="text-xl font-black text-white">{telemetry.master.voltage.toFixed(1)} <small className="text-xs text-slate-500">V</small></p>
            </div>
            <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Courant</p>
              <p className="text-xl font-black text-white">{telemetry.master.current.toFixed(2)} <small className="text-xs text-slate-500">A</small></p>
            </div>
            <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Cos φ</p>
              <p className="text-xl font-black text-white">{telemetry.master.pf.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-slate-900/40 border border-slate-800/50 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Fréquence</p>
              <p className="text-xl font-black text-white">{telemetry.master.hz.toFixed(1)} <small className="text-xs text-slate-500">Hz</small></p>
            </div>
          </div>

          <BillingProgress 
            currentKwh={telemetry.master.kwh_total} 
            totalFcfa={telemetry.billing.total_fcfa}
            tariffName={telemetry.billing.active_tariff}
          />
        </div>
      </div>

      {/* --- MILIEU : GRAPHIQUE & AUDIT --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" /> Flux de Puissance Live</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={liveHistory}>
                <defs>
                  <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis hide domain={[0, 'auto']} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                <Area type="monotone" dataKey="power" stroke="#3b82f6" fillOpacity={1} fill="url(#colorPower)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-3xl">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400" /> Audit Différentiel</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={auditData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {auditData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b' }} />
                <Legend iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* --- BAS : NODES --- */}
      <div className="space-y-4">
        <h3 className="text-white font-black text-xl uppercase tracking-widest flex items-center gap-3">
          <span className="w-8 h-1 bg-blue-500 rounded-full" /> Équipements Connectés
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {telemetry.nodes.map(node => <NodeCard key={node.mac} node={node} />)}
          {telemetry.nodes.length === 0 && <div className="col-span-full py-12 text-center text-slate-600 font-bold border-2 border-dashed border-slate-800 rounded-3xl italic">Aucun Node détecté. Branchez un ESP8266 pour commencer l'audit.</div>}
        </div>
      </div>

    </div>
  )
}
