import React from 'react'
import { MonitorPlay } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTelemetryStore } from '../store/useTelemetryStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function Billing() {
  const { telemetry } = useTelemetryStore()
  const billing = telemetry?.billing || {}

  // Récupération des tranches SBEE depuis la DB (scalable)
  const { data: tariffs = [] } = useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/tariffs`)
      if (!res.ok) throw new Error('Erreur tariffs')
      return res.json()
    },
  })

  const activeTariff = billing?.active_tariff
  const monthKwh    = billing?.month_kwh ?? 0
  const costFcfa    = billing?.estimated_cost_fcfa ?? 0

  return (
    <div className="max-w-2xl mx-auto">

      {/* ─── Bilan SBEE ─────────────────────────────────────── */}
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-8 flex flex-col gap-6">
        <div>
          <h3 className="text-white font-bold text-xl flex items-center gap-2">
            <MonitorPlay className="w-6 h-6 text-emerald-400" />
            Bilan Mensuel SBEE
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Calcul sur la consommation du mois courant ({new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}).
          </p>
        </div>

        {/* Tranche active */}
        <div className="bg-slate-950/50 rounded-2xl p-5 border border-slate-800">
          <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Tranche Active</p>
          <h4 className={`text-2xl font-bold ${activeTariff?.price_per_kwh <= 86 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {activeTariff?.name ?? '—'}
          </h4>
          <p className="text-xs text-slate-400 mt-1">
            {activeTariff
              ? `Tarif appliqué : ${activeTariff.price_per_kwh} FCFA/kWh sur ${monthKwh.toFixed(2)} kWh`
              : 'En attente de données…'}
          </p>
        </div>

        {/* Tableau des tranches (depuis la DB) */}
        {tariffs.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/60 text-slate-400 text-xs uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Tranche</th>
                  <th className="px-4 py-2 text-right">Plage (kWh)</th>
                  <th className="px-4 py-2 text-right">Prix/kWh</th>
                </tr>
              </thead>
              <tbody>
                {tariffs.map((t) => (
                  <tr key={t.id} className={`border-t border-slate-800/50 ${activeTariff?.name === t.name ? 'bg-blue-900/20' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-200">{t.name}</td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {t.min_kwh}–{t.max_kwh ?? '∞'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">
                      {t.price_per_kwh} F
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Coût estimé */}
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">Coût Estimé du Mois</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-white">{costFcfa.toLocaleString('fr-FR')}</span>
            <span className="text-slate-500 font-semibold">FCFA</span>
          </div>
        </div>
      </div>

      {/*
       * ═══════════════════════════════════════════════════════════════
       * 🚧 FONCTIONNALITÉ EN PERSPECTIVE — Alerte Budgétaire (V2)
       * ═══════════════════════════════════════════════════════════════
       *
       * Vision produit :
       * L'utilisateur définit une période (date début → date fin) et
       * un plafond de dépense en FCFA. Un algorithme de tracking suit
       * le rythme de consommation journalier et déclenche des
       * notifications Push Web à des seuils paramétrables (ex: 50%, 80%, 100%).
       *
       * Travaux requis pour implémenter cette fonctionnalité :
       *
       * Backend :
       *   - Nouvelle table DB : BudgetPlan { id, start_date, end_date, amount_fcfa, created_at }
       *   - Endpoint POST /api/budget — Enregistrement d'un plan budgétaire
       *   - Endpoint GET  /api/budget/current — Récupération du plan actif
       *   - Tâche périodique (APScheduler) : calcul de la consommation
       *     sur la période du plan et comparaison au seuil défini
       *   - Service Web Push (VAPID keys + endpoint /api/push/subscribe)
       *
       * Frontend :
       *   - Service Worker (sw.js) pour réception des notifications en arrière-plan
       *   - Formulaire de saisie du plan : période + montant
       *   - Barre de progression basée sur la PROJECTION de fin de période
       *     (formule : coût_actuel / jours_écoulés × jours_totaux_période)
       *     et non sur le coût absolu (évite le bug "100% immédiatement")
       *   - Gestion des permissions Push (requestPermission)
       *
       * Note technique :
       *   Le calcul doit être basé sur une PROJECTION et non sur le coût
       *   absolu accumulé, pour éviter que la barre soit immédiatement
       *   rouge dès que le coût dépasse le budget (même en début de période).
       *
       * ───────────────────────────────────────────────────────────────
       * Code de la maquette initiale ci-dessous, conservé pour référence.
       * ───────────────────────────────────────────────────────────────

      import { useState } from 'react'
      import { Save, AlertCircle, CheckCircle } from 'lucide-react'

      function FieldError({ msg }) {
        if (!msg) return null
        return (
          <p className="flex items-center gap-1 text-rose-400 text-xs mt-1">
            <AlertCircle className="w-3 h-3" /> {msg}
          </p>
        )
      }

      // Dans le composant Billing() :
      const [budget, setBudget]       = useState('')
      const [startDate, setStartDate] = useState('')
      const [endDate, setEndDate]     = useState('')
      const [errors, setErrors]       = useState({})
      const [saved, setSaved]         = useState(false)

      const budgetNum   = parseFloat(budget) || 0
      const budgetRatio = budgetNum > 0 ? Math.min((costFcfa / budgetNum) * 100, 100) : 0

      function validate() {
        const e = {}
        if (!startDate) e.startDate = 'La date de début est obligatoire.'
        if (!endDate) e.endDate = 'La date de fin est obligatoire.'
        else if (startDate && endDate <= startDate) e.endDate = 'La date de fin doit être postérieure au début.'
        if (!budget) e.budget = 'Veuillez saisir un budget mensuel.'
        else if (isNaN(parseFloat(budget)) || parseFloat(budget) <= 0) e.budget = 'Le budget doit être un nombre positif.'
        else if (parseFloat(budget) < 500) e.budget = 'Montant minimal : 500 FCFA.'
        return e
      }

      function handleSubmit(e) {
        e.preventDefault()
        const errs = validate()
        setErrors(errs)
        if (Object.keys(errs).length > 0) return
        if ('Notification' in window) {
          Notification.requestPermission().then(perm => {
            if (perm === 'granted') {
              new Notification('SENTINEL — Budget enregistré', {
                body: `Budget ${parseFloat(budget).toLocaleString('fr-FR')} FCFA activé.`,
              })
            }
          })
        }
        setSaved(true)
        setTimeout(() => setSaved(false), 4000)
      }

      // JSX du formulaire :
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-8 flex flex-col gap-6">
        <div className="border-b border-slate-800/50 pb-4">
          <h3 className="text-white font-bold text-xl">Alerte Budgétaire</h3>
          <p className="text-slate-400 text-sm mt-1">Définissez votre enveloppe et activez les notifications Push.</p>
        </div>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Début de cycle</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-slate-300 focus:outline-none focus:border-blue-500 transition-colors ${errors.startDate ? 'border-rose-600' : 'border-slate-800'}`} />
              <FieldError msg={errors.startDate} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Fin de cycle</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-slate-300 focus:outline-none focus:border-blue-500 transition-colors ${errors.endDate ? 'border-rose-600' : 'border-slate-800'}`} />
              <FieldError msg={errors.endDate} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Budget maximal</label>
            <div className="relative">
              <input type="number" min={500} step={100} value={budget} onChange={e => setBudget(e.target.value)}
                placeholder="Ex : 10000"
                className={`w-full bg-slate-950 border rounded-xl px-4 py-3 text-slate-300 font-mono text-lg focus:outline-none focus:border-blue-500 transition-colors ${errors.budget ? 'border-rose-600' : 'border-slate-800'}`} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">FCFA</span>
            </div>
            <FieldError msg={errors.budget} />
          </div>
          {budgetNum > 0 && (
            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Consommé ce mois</span>
                <span className={budgetRatio >= 90 ? 'text-rose-400 font-bold' : ''}>{budgetRatio.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div className={`h-2 rounded-full transition-all duration-1000 ${budgetRatio < 70 ? 'bg-emerald-400' : budgetRatio < 90 ? 'bg-amber-400' : 'bg-rose-500 animate-pulse'}`}
                  style={{ width: `${budgetRatio}%` }} />
              </div>
            </div>
          )}
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold rounded-xl py-4 flex items-center justify-center gap-2 transition-all">
            <Save className="w-5 h-5" /> Enregistrer & Activer Notifications
          </button>
          {saved && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm justify-center">
              <CheckCircle className="w-4 h-4" /> Budget enregistré avec succès !
            </div>
          )}
        </form>
      </div>

      * ═══════════════════════════════════════════════════════════════ */}

    </div>
  )
}
