import React, { useMemo } from 'react'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Activity, Zap, ShieldAlert } from 'lucide-react'

/* ── Carte appareil ── */
const DeviceCard = ({ device }) => {
  const isMaster = device.role === 'MASTER'
  const isOnline = device.status === 'ONLINE'

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden
      ${isMaster ? 'border-blue-300' : 'border-slate-200'}`}>

      {/* En-tête colorée */}
      <div className={`px-5 py-3 flex items-center justify-between
        ${isMaster ? 'bg-blue-800 text-white' : 'bg-slate-700 text-white'}`}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{device.name}</span>
          {isMaster && (
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded uppercase tracking-wider">
              Compteur général
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60
              ${isOnline ? 'bg-green-300' : 'bg-red-300'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2
              ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}></span>
          </span>
          <span className="text-[10px] font-medium">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
        </div>
      </div>

      {/* Corps */}
      <div className="p-5">
        {/* Puissance principale */}
        <div className="flex items-end gap-1 mb-4">
          <span className={`text-4xl font-bold ${isMaster ? 'text-blue-800' : 'text-slate-700'}`}>
            {(device.power || 0).toFixed(0)}
          </span>
          <span className="text-sm text-slate-500 mb-1">W</span>
        </div>

        {/* Métriques secondaires */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            { label: 'Tension', value: `${(device.voltage || 0).toFixed(1)} V` },
            { label: 'Courant', value: `${(device.current || 0).toFixed(2)} A` },
            { label: 'Cos φ', value: (device.power_factor || 0).toFixed(2) },
            { label: 'Fréquence', value: `${(device.frequency_hz || 0).toFixed(1)} Hz` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide">{label}</p>
              <p className="font-bold text-slate-800 text-sm">{value}</p>
            </div>
          ))}
        </div>

        {/* Énergie cumulée */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3" /> Énergie cumulée
          </span>
          <span className="font-bold text-slate-700">
            {((device.kwh_total || 0) * 1000).toFixed(1)} Wh
          </span>
        </div>

        {/* Adresse MAC */}
        <p className="mt-2 text-[10px] text-slate-300 font-mono">{device.mac}</p>
      </div>
    </div>
  )
}

/* ── Composant principal ── */
export default function Dashboard() {
  const { telemetry } = useTelemetryStore()

  const auditData = useMemo(() => [
    {
      name: 'Nœuds surveillés',
      value: telemetry.nodes.reduce((acc, n) => acc + (n.power || 0), 0),
      color: '#15803d',
    },
    {
      name: 'Charge non identifiée',
      value: Math.max(0, telemetry.audit.unknown_w),
      color: '#b91c1c',
    },
  ], [telemetry])

  if (!telemetry.timestamp) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-3 text-slate-400">
        <div className="w-8 h-8 border-4 border-blue-800 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">Synchronisation des relevés en cours…</p>
      </div>
    )
  }

  const allDevices = [telemetry.master, ...telemetry.nodes]

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── Section 1 : Relevés individuels ── */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-600 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          <Activity className="w-4 h-4" />
          Relevés en temps réel
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {allDevices.map(device => (
            <DeviceCard key={device.mac} device={device} />
          ))}
        </div>
      </section>

      {/* ── Section 2 : Audit différentiel ── */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-600 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200">
          <ShieldAlert className="w-4 h-4" />
          Bilan différentiel
        </h3>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-lg mx-auto">
          <p className="text-xs text-slate-500 mb-4">
            Répartition instantanée de la puissance totale mesurée par le compteur général entre
            les nœuds surveillés et la charge non identifiée (fuites potentielles).
          </p>

          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={auditData}
                  innerRadius={50}
                  outerRadius={72}
                  paddingAngle={6}
                  dataKey="value"
                  cornerRadius={3}
                >
                  {auditData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                  formatter={(v) => [`${Math.round(v)} W`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Légende */}
          <div className="mt-3 space-y-2">
            {auditData.map(item => (
              <div key={item.name}
                className="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-lg border border-slate-100 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full inline-block"
                    style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 text-xs">{item.name}</span>
                </div>
                <span className="font-bold text-slate-800">{item.value.toFixed(0)} W</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}