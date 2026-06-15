import React from 'react'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, TrendingUp, Zap, Info, ShieldAlert } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function Billing() {
  const { telemetry } = useTelemetryStore()

  /* ── Consommation du mois courant (somme des deltas) ── */
  const { data: currentBilling, isLoading: loadingCurrent } = useQuery({
    queryKey: ['billing-current'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/telemetry/billing-current`)
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    },
    refetchInterval: 15000,
  })

  /* ── Grille tarifaire ── */
  const { data: tariffs, isLoading: loadingTariffs } = useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/tariffs`)
      return res.json()
    }
  })

  /* ── Historique mensuel ── */
  const { data: reportData, isLoading: loadingReport } = useQuery({
    queryKey: ['billing-report'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/telemetry/billing-report?granularity=month`)
      return res.json()
    }
  })

  /* ── Valeurs dérivées ── */
  const currentKwh   = currentBilling?.kwh_month    ?? 0
  const costFcfa     = currentBilling?.cost_fcfa     ?? 0
  const activeTariff = currentBilling?.active_tariff ?? '—'
  const socialMax    = (tariffs && tariffs[0]?.max_kwh) || 20
  const progress     = Math.min((currentKwh / socialMax) * 100, 100)
  const remaining    = Math.max(0, socialMax - currentKwh)

  const getTariffColor = (name = '') => {
    if (name.includes('Sociale')) return 'bg-green-100 text-green-700 border-green-200'
    if (name.includes('1'))       return 'bg-blue-100 text-blue-700 border-blue-200'
    return 'bg-orange-100 text-orange-700 border-orange-200'
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* ── SECTION 1 : FACTURE MENSUELLE EN COURS ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Carte Facture */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Facture du mois en cours
              </span>
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-5xl font-extrabold text-slate-900 tracking-tight">
                {costFcfa.toLocaleString('fr-FR')}
              </span>
              <span className="text-lg font-bold text-slate-500">FCFA</span>
            </div>
            <p className="text-sm text-slate-400 mt-2">
              Consommation du mois :{' '}
              <span className="font-bold text-slate-700">{currentKwh.toFixed(3)} kWh</span>
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-400">Tranche active :</span>
            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${getTariffColor(activeTariff)}`}>
              {activeTariff}
            </span>
          </div>
        </div>

        {/* Jauge Tranche Sociale */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-slate-600 uppercase tracking-wider">
                Suivi de la Tranche Sociale (SBEE)
              </span>
              <span className="text-sm font-bold text-blue-600">
                {currentKwh.toFixed(3)} / {socialMax} kWh
              </span>
            </div>

            <div className="w-full bg-slate-100 rounded-full h-5 overflow-hidden mb-1">
              <div
                className={`h-full rounded-full transition-all duration-700 ${progress >= 100 ? 'bg-orange-500' : 'bg-green-500'}`}
                style={{ width: `${Math.max(progress, 0.5)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mb-4">
              <span>0 kWh</span>
              <span>{socialMax} kWh</span>
            </div>

            <p className="text-sm text-slate-500 leading-relaxed">
              {progress >= 100 ? (
                <span className="text-orange-600 font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                  Seuil subventionné dépassé. Le tarif passe à 125 FCFA/kWh (Tranche 1) + TVA 18%.
                </span>
              ) : (
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  Il vous reste{' '}
                  <strong className="text-slate-800 mx-1">{remaining.toFixed(3)} kWh</strong>
                  avant de basculer en Tranche 1 (125 FCFA/kWh + TVA 18%).
                </span>
              )}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-400">
            <Zap className="w-3.5 h-3.5 text-yellow-500" />
            Consommation calculée sur les relevés du mois en cours (somme des incréments). Réinitialisation le 1er de chaque mois.
          </div>
        </div>
      </section>

      {/* ── SECTION 2 : GRILLE TARIFAIRE ── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-700">Grille Tarifaire SBEE de Référence</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold text-left">Tranche</th>
                <th className="px-6 py-3 font-semibold text-left">Plage de Consommation</th>
                <th className="px-6 py-3 font-semibold text-right text-blue-600">Tarif (FCFA / kWh)</th>
                <th className="px-6 py-3 font-semibold text-right text-slate-500">TVA</th>
              </tr>
            </thead>
            <tbody>
              {loadingTariffs ? (
                <tr>
                  <td colSpan="4" className="px-6 py-6 text-center text-slate-400 animate-pulse text-xs">Chargement…</td>
                </tr>
              ) : tariffs?.map((t, idx) => (
                <tr key={t.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx === 0 ? 'bg-green-50/30' : ''}`}>
                  <td className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wide">
                    <span className={`px-2.5 py-1 rounded border ${getTariffColor(t.name)}`}>{t.name}</span>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-600">
                    {t.min_kwh === 0
                      ? `Jusqu'à ${t.max_kwh} kWh`
                      : t.max_kwh
                        ? `De ${t.min_kwh} à ${t.max_kwh} kWh`
                        : `Au-delà de ${t.min_kwh} kWh`}
                  </td>
                  <td className="px-6 py-4 font-extrabold text-slate-800 text-right text-base">
                    {t.price_per_kwh} <span className="text-xs font-normal text-slate-400">FCFA</span>
                  </td>
                  <td className="px-6 py-4 text-right text-xs font-semibold">
                    {t.min_kwh >= 20
                      ? <span className="text-orange-600 font-bold">+18 %</span>
                      : <span className="text-green-600 font-bold">Exonérée</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── SECTION 3 : HISTORIQUE MENSUEL ── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-700">Historique Mensuel de Consommation & Facturation</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
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
                  <td colSpan={5 + (reportData?.node_names?.length || 0)}
                    className="px-6 py-8 text-center text-slate-400 animate-pulse text-xs">
                    Analyse des relevés historiques…
                  </td>
                </tr>
              ) : !reportData?.data || reportData.data.length === 0 ? (
                <tr>
                  <td colSpan={5 + (reportData?.node_names?.length || 0)}
                    className="px-6 py-8 text-center text-slate-400 text-xs">
                    Aucun historique mensuel disponible.
                  </td>
                </tr>
              ) : (
                reportData.data.map((row) => {
                  const [year, month] = row.period.split('-')
                  const label = new Date(year, parseInt(month) - 1)
                    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                  return (
                    <tr key={row.period} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-slate-700 capitalize">{label}</td>
                      <td className="px-6 py-4 font-bold text-blue-700">
                        {row.master.toFixed(3)} <span className="text-xs text-slate-400 font-normal">kWh</span>
                      </td>
                      {reportData.node_names.map(name => (
                        <td key={name} className="px-6 py-4 font-medium text-slate-600">
                          {(row.nodes[name] || 0).toFixed(3)} <span className="text-xs text-slate-400">kWh</span>
                        </td>
                      ))}
                      <td className="px-6 py-4 font-medium text-rose-600">
                        {row.unknown.toFixed(3)} <span className="text-xs text-rose-400 font-normal">kWh</span>
                      </td>
                      <td className="px-6 py-4 font-extrabold text-slate-900 text-right text-base">
                        {row.cost_fcfa.toLocaleString('fr-FR')} <span className="text-xs text-slate-400 font-normal">FCFA</span>
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
