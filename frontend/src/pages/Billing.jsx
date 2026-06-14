import React from 'react'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, TrendingUp, Zap, Info, ShieldAlert } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid } from 'recharts'

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

  // Couleurs pour les tranches
  const getTariffColor = (name) => {
    if (name.includes("Sociale")) return "bg-green-100 text-green-700 border-green-200"
    if (name.includes("1")) return "bg-blue-100 text-blue-700 border-blue-200"
    return "bg-orange-100 text-orange-700 border-orange-200"
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      
      {/* --- SECTION 1: SIMULATEUR DE PALIER ET CONSOMMATION DU MOIS --- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Carte Solde / Coût mensuel */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Facture en cours</span>
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-extrabold text-slate-900 tracking-tight">
                {telemetry.billing.total_fcfa.toLocaleString()}
              </span>
              <span className="text-sm font-bold text-slate-500">FCFA</span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5">
              Calculé sur le cumul de <span className="font-semibold text-slate-600">{currentKwh.toFixed(2)} kWh</span>
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Tranche active :</span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getTariffColor(telemetry.billing.active_tariff)}`}>
              {telemetry.billing.active_tariff}
            </span>
          </div>
        </div>

        {/* Jauge de la tranche sociale */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Suivi de la Tranche Sociale (SBEE)</span>
              <span className="text-xs font-bold text-blue-600">{currentKwh.toFixed(1)} / {socialThreshold} kWh</span>
            </div>
            
            {/* Barre de progression */}
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden mb-3">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${progress >= 100 ? 'bg-orange-500' : 'bg-green-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed">
              {progress >= 100 ? (
                <span className="text-orange-600 font-semibold flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
                  Vous avez dépassé le seuil subventionné de la tranche sociale. Le tarif unitaire passe de 88 FCFA à 125 FCFA/kWh.
                </span>
              ) : (
                <span className="text-slate-500 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  Il vous reste {(socialThreshold - currentKwh).toFixed(1)} kWh avant de basculer dans la tranche normale 1.
                </span>
              )}
            </p>
          </div>
          
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-[10px] text-slate-400">
            <Zap className="w-3.5 h-3.5 text-yellow-500" /> Tarifs modélisés selon la grille de facturation officielle de la SBEE.
          </div>
        </div>

      </section>

      {/* --- SECTION 2: GRILLE TARIFAIRE (TABLEAU) --- */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-700">Grille Tarifaire SBEE de Référence</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold text-left">Nom de la Tranche</th>
                <th className="px-6 py-3 font-semibold text-left">Plage de Consommation</th>
                <th className="px-6 py-3 font-semibold text-right text-blue-600">Tarif Unitaire (FCFA / kWh)</th>
              </tr>
            </thead>
            <tbody>
              {loadingTariffs ? (
                <tr>
                  <td colSpan="3" className="px-6 py-4 text-center text-slate-400 animate-pulse text-xs">
                    Chargement de la grille tarifaire…
                  </td>
                </tr>
              ) : tariffs?.map((t, idx) => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 font-bold text-slate-700 text-xs uppercase tracking-wide">
                    {t.name}
                  </td>
                  <td className="px-6 py-3 font-medium text-slate-500">
                    {t.min_kwh === 0 ? `Jusqu'à ${t.max_kwh} kWh` : t.max_kwh ? `De ${t.min_kwh} à ${t.max_kwh} kWh` : `Au-delà de ${t.min_kwh} kWh`}
                  </td>
                  <td className="px-6 py-3 font-bold text-slate-800 text-right">
                    {t.price_per_kwh} FCFA
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- SECTION 3: TABLEAU HISTORIQUE DYNAMIQUE --- */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-700">Historique Mensuel de Consommation & Facturation</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold text-left">Période</th>
                <th className="px-6 py-3 font-semibold text-blue-600 text-left">Global (Master)</th>
                {reportData?.node_names?.map(name => (
                  <th key={name} className="px-6 py-3 font-semibold text-emerald-600 text-left">{name}</th>
                ))}
                <th className="px-6 py-3 font-semibold text-rose-600 text-left">Inconnu (Pertes / Veilles)</th>
                <th className="px-6 py-3 font-semibold text-slate-700 text-right">Coût Total Estimé</th>
              </tr>
            </thead>
            <tbody>
              {loadingReport ? (
                <tr>
                  <td colSpan={5 + (reportData?.node_names?.length || 0)} className="px-6 py-8 text-center text-slate-400 animate-pulse text-xs">
                    Analyse des relevés historiques de la base de données…
                  </td>
                </tr>
              ) : !reportData?.data || reportData.data.length === 0 ? (
                <tr>
                  <td colSpan={5 + (reportData?.node_names?.length || 0)} className="px-6 py-8 text-center text-slate-400 text-xs">
                    Aucun historique de facturation mensuel disponible pour le moment.
                  </td>
                </tr>
              ) : (
                reportData.data.map((row, idx) => {
                  const [year, month] = row.period.split('-')
                  const formattedPeriod = new Date(year, parseInt(month) - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                  return (
                    <tr key={row.period} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-semibold text-slate-700 capitalize">{formattedPeriod}</td>
                      <td className="px-6 py-3 font-bold text-blue-700">
                        {row.master.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">kWh</span>
                      </td>
                      {reportData.node_names.map(name => (
                        <td key={name} className="px-6 py-3 font-medium text-slate-600">
                          {(row.nodes[name] || 0).toFixed(1)} <span className="text-[10px] text-slate-400">kWh</span>
                        </td>
                      ))}
                      <td className="px-6 py-3 font-medium text-rose-600">
                        {row.unknown.toFixed(1)} <span className="text-[10px] text-rose-400 font-normal">kWh</span>
                      </td>
                      <td className="px-6 py-3 font-extrabold text-slate-900 text-right">
                        {row.cost_fcfa.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">FCFA</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}
