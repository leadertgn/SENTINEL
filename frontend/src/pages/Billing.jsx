import React from 'react'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, TrendingUp, HelpCircle, AlertTriangle, Zap, Info } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell } from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function Billing() {
  const { telemetry } = useTelemetryStore()
  
  const { data: tariffs, isLoading: loadingTariffs } = useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/tariffs`)
      return res.json()
    }
  })

  const { data: reportData, isLoading: loadingReport } = useQuery({
    queryKey: ['billing-report'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/telemetry/billing-report?granularity=month`)
      return res.json()
    }
  })

  const currentKwh = telemetry.master.kwh_total || 0
  
  // Seuil social SBEE (20 kWh)
  const socialThreshold = (tariffs && tariffs[0]?.max_kwh) || 20
  const progress = Math.min((currentKwh / socialThreshold) * 100, 100)

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-0 space-y-8">
      
      {/* HEADER PAGE */}
      <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Bilan & Historique</h1>
          <p className="text-slate-500 text-sm italic">Consultez la grille tarifaire et l'historique périodique des consommations.</p>
      </div>

      {/* --- GRILLE TARIFAIRE (TABLEAU) --- */}
      <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] shadow-2xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-500" /> Grille Tarifaire SBEE
          </h3>
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                  <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                          <th className="p-4 font-black">Tranche</th>
                          <th className="p-4 font-black">Seuil (kWh)</th>
                          <th className="p-4 font-black text-right text-blue-400">Prix unitaire (FCFA)</th>
                      </tr>
                  </thead>
                  <tbody className="text-sm">
                      {loadingTariffs ? (
                          <tr><td colSpan="3" className="p-4 text-center text-slate-600 animate-pulse">Chargement...</td></tr>
                      ) : tariffs?.map((t, idx) => (
                          <tr key={t.id} className={`border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors ${idx % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                              <td className="p-4 font-bold text-slate-300 uppercase tracking-widest text-[10px]">{t.name}</td>
                              <td className="p-4 font-black text-slate-400">
                                  {t.min_kwh === 0 ? `≤ ${t.max_kwh}` : t.max_kwh ? `${t.min_kwh} - ${t.max_kwh}` : `> ${t.min_kwh}`}
                              </td>
                              <td className="p-4 font-black text-blue-100 text-right">{t.price_per_kwh}</td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

      {/* --- TABLEAU HISTORIQUE DYNAMIQUE (PLEINE LARGEUR) --- */}
      <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] shadow-2xl">
          <h3 className="text-sm font-bold text-white uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" /> Historique de Consommation & Facturation
          </h3>
          
          <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                          <th className="p-4 font-black">Période</th>
                          <th className="p-4 font-black text-blue-400">Master (Total)</th>
                          {reportData?.node_names?.map(name => (
                              <th key={name} className="p-4 font-black text-emerald-400">{name}</th>
                          ))}
                          <th className="p-4 font-black text-rose-400">Fuites (Inconnu)</th>
                          <th className="p-4 font-black text-yellow-400 text-right">Coût Total</th>
                      </tr>
                  </thead>
                  <tbody className="text-sm">
                      {loadingReport ? (
                          <tr><td colSpan="10" className="p-8 text-center text-slate-600 animate-pulse font-bold tracking-widest uppercase text-xs">Analyse de la base de données...</td></tr>
                      ) : !reportData?.data || reportData.data.length === 0 ? (
                          <tr><td colSpan="10" className="p-8 text-center text-slate-600 font-bold tracking-widest uppercase text-xs">Aucune donnée historique disponible pour l'instant.</td></tr>
                      ) : (
                          reportData.data.map((row, idx) => {
                              const [year, month] = row.period.split('-');
                              const formattedPeriod = new Date(year, parseInt(month) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
                              return (
                                  <tr key={row.period} className={`border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors ${idx % 2 === 0 ? 'bg-slate-900/20' : ''}`}>
                                      <td className="p-4 font-bold text-slate-300 capitalize">{formattedPeriod}</td>
                                      <td className="p-4 font-black text-blue-100">{row.master.toFixed(2)} <span className="text-[10px] text-blue-500/50">kWh</span></td>
                                      {reportData.node_names.map(name => (
                                          <td key={name} className="p-4 font-bold text-emerald-100">
                                              {(row.nodes[name] || 0).toFixed(2)} <span className="text-[10px] text-emerald-500/50">kWh</span>
                                          </td>
                                      ))}
                                      <td className="p-4 font-bold text-rose-100">{row.unknown.toFixed(2)} <span className="text-[10px] text-rose-500/50">kWh</span></td>
                                      <td className="p-4 font-black text-yellow-100 text-right">{row.cost_fcfa.toLocaleString()} <span className="text-[10px] text-yellow-500/50">FCFA</span></td>
                                  </tr>
                              );
                          })
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  )
}
