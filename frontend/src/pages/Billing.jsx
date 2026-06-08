import React from 'react'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { useQuery } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function Billing() {
  const { telemetry } = useTelemetryStore()

  const { data: tariffs, isLoading: loadingTariffs } = useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/tariffs`)
      return res.json()
    },
  })

  const { data: reportData, isLoading: loadingReport } = useQuery({
    queryKey: ['billing-report'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/telemetry/billing-report?granularity=month`)
      return res.json()
    },
  })

  const currentKwh = telemetry.master.kwh_total || 0

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── Encadré résumé consommation courante ── */}
      <div className="bg-blue-800 text-white rounded-xl px-6 py-5 shadow-sm">
        <p className="text-blue-200 text-xs uppercase tracking-widest mb-1">Énergie cumulée (session)</p>
        <p className="text-3xl font-bold">{currentKwh.toFixed(3)} <span className="text-xl font-normal text-blue-300">kWh</span></p>
      </div>

      {/* ── Grille tarifaire SBEE ── */}
      <section>
        <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest pb-2 border-b border-slate-200 mb-4">
          Grille tarifaire SBEE
        </h3>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>Tranche</th>
                <th>Seuil (kWh)</th>
                <th className="text-right">Prix unitaire (FCFA / kWh)</th>
              </tr>
            </thead>
            <tbody>
              {loadingTariffs ? (
                <tr>
                  <td colSpan="3" className="px-5 py-6 text-center text-slate-400 text-xs animate-pulse">
                    Chargement de la grille tarifaire…
                  </td>
                </tr>
              ) : (
                tariffs?.map((t, idx) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 font-semibold text-slate-700">{t.name}</td>
                    <td className="px-5 py-3 text-slate-600">
                      {t.min_kwh === 0
                        ? `≤ ${t.max_kwh}`
                        : t.max_kwh
                          ? `${t.min_kwh} – ${t.max_kwh}`
                          : `> ${t.min_kwh}`}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-blue-800">{t.price_per_kwh}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            Source : Société Béninoise d'Énergie Électrique (SBEE) — Barème en vigueur.
          </div>
        </div>
      </section>

      {/* ── Historique de consommation ── */}
      <section>
        <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest pb-2 border-b border-slate-200 mb-4">
          Historique périodique de consommation et de facturation
        </h3>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr>
                  <th>Période</th>
                  <th>Compteur général (kWh)</th>
                  {reportData?.node_names?.map(name => (
                    <th key={name}>{name} (kWh)</th>
                  ))}
                  <th>Charge inconnue (kWh)</th>
                  <th className="text-right">Coût estimé (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                {loadingReport ? (
                  <tr>
                    <td colSpan="10" className="px-5 py-8 text-center text-slate-400 text-xs animate-pulse">
                      Analyse de la base de données en cours…
                    </td>
                  </tr>
                ) : !reportData?.data || reportData.data.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-5 py-8 text-center text-slate-400 text-xs">
                      Aucune donnée historique disponible pour la période sélectionnée.
                    </td>
                  </tr>
                ) : (
                  reportData.data.map((row, idx) => {
                    const [year, month] = row.period.split('-')
                    const formattedPeriod = new Date(year, parseInt(month) - 1)
                      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                    return (
                      <tr key={row.period}>
                        <td className="px-5 py-3 font-semibold text-slate-700 capitalize">{formattedPeriod}</td>
                        <td className="px-5 py-3 text-slate-700">{row.master.toFixed(3)}</td>
                        {reportData.node_names.map(name => (
                          <td key={name} className="px-5 py-3 text-slate-600">
                            {(row.nodes[name] || 0).toFixed(3)}
                          </td>
                        ))}
                        <td className="px-5 py-3 text-red-600 font-medium">{row.unknown.toFixed(3)}</td>
                        <td className="px-5 py-3 text-right font-bold text-blue-800">
                          {row.cost_fcfa.toLocaleString('fr-FR')}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
            ℹ️ La « charge inconnue » représente l'écart entre la puissance totale du compteur général
            et la somme des nœuds surveillés. Elle peut indiquer des équipements non connectés ou des fuites.
          </div>
        </div>
      </section>
    </div>
  )
}