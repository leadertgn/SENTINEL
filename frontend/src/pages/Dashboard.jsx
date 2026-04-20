import React, { useState } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, CartesianGrid, XAxis, YAxis,
  LineChart, Line,
} from 'recharts'
import { Zap, Activity } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTelemetryStore } from '../store/useTelemetryStore'

const API_URL = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/telemetry`

const FILTERS = [
  { label: '24H', granularity: 'hour', days: 1 },
  { label: '7J',  granularity: 'day',  days: 7 },
  { label: '30J', granularity: 'day',  days: 30 },
]

function Metric({ label, value, unit }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-0.5">{label}</span>
      <span className="font-mono font-bold text-slate-200 text-sm">
        {value ?? '—'} <span className="text-slate-500 text-xs">{unit}</span>
      </span>
    </div>
  )
}

function DeviceCard({ name, power, voltage_v, current_a, energy_kwh, power_factor, isMaster = false }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 border h-full
      ${isMaster ? 'bg-gradient-to-br from-blue-950/60 to-slate-900 border-blue-800/40'
                 : 'bg-slate-900/50 border-slate-800/50'}`}>
      {isMaster && <div className="absolute top-0 right-0 p-4 opacity-[0.07]"><Zap className="w-20 h-20 text-blue-400" /></div>}
      <h3 className={`font-semibold text-sm mb-1 ${isMaster ? 'text-blue-400' : 'text-slate-400'}`}>{name}</h3>
      <div className="flex items-baseline gap-1 mb-4">
        <span className={`text-3xl font-black tracking-tight ${isMaster ? 'text-white' : 'text-slate-200'}`}>{power ?? 0}</span>
        <span className="text-slate-500 font-semibold text-base">W</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Metric label="Tension"   value={voltage_v}    unit="V" />
        <Metric label="Courant"   value={current_a}    unit="A" />
        <Metric label="Cosφ (PF)" value={power_factor} unit="" />
        <Metric label="Énergie"   value={energy_kwh}   unit="kWh" />
      </div>
    </div>
  )
}

const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (!percent || percent < 0.04) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + r * Math.cos(-midAngle * Math.PI / 180)
  const y = cy + r * Math.sin(-midAngle * Math.PI / 180)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 700 }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

function ChartBox({ height = 240, children }) {
  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
    </div>
  )
}

export default function Dashboard() {
  const { telemetry, liveHistory } = useTelemetryStore()
  const [filter, setFilter] = useState(FILTERS[1])

  const safeNodes = Array.isArray(telemetry?.nodes) ? telemetry.nodes : []
  const totalPower = telemetry?.master_power || 1

  const { data: historyData = [], isLoading: histLoading } = useQuery({
    queryKey: ['history', filter.granularity, filter.days],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/history?granularity=${filter.granularity}&days=${filter.days}`)
      if (!res.ok) throw new Error('Erreur historique')
      const d = await res.json()
      return Array.isArray(d) ? d : []
    },
    refetchInterval: 60_000,
    initialData: [],
  })

  const pieData = [
    ...safeNodes.map((node, i) => ({
      name: node.name,
      value: node.power ?? 0,
      color: i === 0 ? '#3b82f6' : '#10b981',
    })),
    { name: 'Inconnu', value: telemetry?.unknown_power ?? 0, color: '#64748b' },
  ].filter(d => d.value > 0)

  if (!telemetry?.master_power && safeNodes.length === 0) {
    return (
      <div className="flex flex-col gap-5 animate-pulse">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="rounded-2xl bg-slate-900/40 border border-slate-800/50 h-44" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/50 h-64" />
          <div className="rounded-2xl bg-slate-900/40 border border-slate-800/50 h-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Cartes Appareils ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 min-w-0">
          <DeviceCard isMaster
            name="Compteur Central SBEE"
            power={telemetry?.master_power?.toLocaleString('fr-FR')}
            voltage_v={telemetry?.voltage?.toFixed(1)}
            current_a={telemetry?.current?.toFixed(3)}
            energy_kwh={telemetry?.billing?.month_kwh?.toFixed(3)}
            power_factor={telemetry?.power_factor?.toFixed(2)}
          />
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          {safeNodes.map(node => (
            <div key={node.mac} className="min-w-0">
              <DeviceCard
                name={node.name}
                power={node.power}
                voltage_v={node.voltage_v?.toFixed(1)}
                current_a={node.current_a?.toFixed(3)}
                energy_kwh={node.energy_kwh?.toFixed(3)}
                power_factor={node.power_factor?.toFixed(2)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Graphique Live Temps Réel ── */}
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-white font-bold">Puissance en Temps Réel</h3>
        </div>
        <p className="text-slate-500 text-xs mb-4">
          Dernières {liveHistory.length} mesures — mise à jour toutes les 2s
        </p>
        <ChartBox height={200}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={liveHistory} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" stroke="#475569" fontSize={10} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#475569" fontSize={10} tickFormatter={v => `${v}W`} width={48} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12 }}
                itemStyle={{ color: '#60a5fa' }}
                formatter={v => [`${v} W`, 'Puissance']}
              />
              <Line
                type="monotone" dataKey="power" name="Puissance"
                stroke="#3b82f6" strokeWidth={2.5} dot={false}
                activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      {/* ── Audit + Historique ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 min-w-0">
          <h3 className="text-white font-bold mb-0.5">Répartition de la Charge</h3>
          <p className="text-slate-500 text-xs mb-4">Audit différentiel en temps réel</p>
          <ChartBox height={240}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                  paddingAngle={4} dataKey="value" stroke="none"
                  labelLine={false} label={<PieLabel />} animationDuration={400}>
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12 }}
                  itemStyle={{ color: '#fff' }} formatter={v => `${v} W`} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-white font-bold">Statistiques Historiques</h3>
              <p className="text-slate-500 text-xs">Consommation (kWh) &amp; Coût (FCFA)</p>
            </div>
            <div className="flex bg-slate-800/60 rounded-xl p-1 border border-slate-700/40 gap-0.5">
              {FILTERS.map(f => (
                <button key={f.label} onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all
                    ${filter.label === f.label ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <ChartBox height={240}>
            {histLoading ? (
              <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">Chargement…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={historyData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="label" stroke="#475569" fontSize={10} tickLine={false} />
                  <YAxis yAxisId="l" stroke="#3b82f6" fontSize={10} tickFormatter={v => `${v}`} width={38} />
                  <YAxis yAxisId="r" orientation="right" stroke="#10b981" fontSize={10}
                    tickFormatter={v => `${(v/1000).toFixed(0)}k`} width={38} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12 }}
                    labelStyle={{ color: '#94a3b8', marginBottom: 4, fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="kwh"       name="Énergie (kWh)" fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={28} />
                  <Bar yAxisId="r" dataKey="cost_fcfa" name="Coût (FCFA)"   fill="#10b981" radius={[4,4,0,0]} opacity={0.8} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartBox>
        </div>

      </div>
    </div>
  )
}
