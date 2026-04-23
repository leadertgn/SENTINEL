import React from 'react'
import { useTelemetryStore } from '../store/useTelemetryStore'
import { useQuery } from '@tanstack/react-query'
import { CreditCard, TrendingUp, HelpCircle, ArrowRight } from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export default function Billing() {
  const { telemetry } = useTelemetryStore()
  
  // Récupération des tarifs SBEE réels
  const { data: tariffs, isLoading: loadingTariffs } = useQuery({
    queryKey: ['tariffs'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/tariffs`)
      return res.json()
    }
  })

  // Mock pour l'historique (en attendant une API historique backend)
  const historyData = [
    { day: 'Lun', cost: 450 },
    { day: 'Mar', cost: 620 },
    { day: 'Mer', cost: 380 },
    { day: 'Jeu', cost: 510 },
    { day: 'Ven', cost: 890 },
    { day: 'Sam', cost: 420 },
    { day: 'Dim', cost: 310 },
  ]

  const currentKwh = telemetry.master.kwh_total || 0
  const socialThreshold = (tariffs && tariffs[0]?.max_kwh) || 50
  const progress = Math.min((currentKwh / socialThreshold) * 100, 100)

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 space-y-8">
      <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Budget & Facturation</h1>
          <p className="text-slate-500 text-sm italic">Comprenez votre facture SBEE et optimisez vos dépenses.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- CARTE PRINCIPALE : MONTANT DU MOIS --- */}
        <div className="lg:col-span-2 space-y-8">
            <div className="p-8 bg-gradient-to-br from-blue-600 to-blue-800 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-12">
                        <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/20">
                            <CreditCard className="w-8 h-8 text-white" />
                        </div>
                        <div className="text-right">
                            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1">Tranche Active</p>
                            <p className="text-white font-black text-lg">{telemetry.billing.active_tariff}</p>
                        </div>
                    </div>
                    
                    <p className="text-white/60 text-sm font-bold uppercase tracking-widest mb-2">Estimation Facture Mensuelle</p>
                    <div className="flex items-baseline gap-4">
                        <h2 className="text-7xl font-black text-white leading-none">
                            {telemetry.billing.total_fcfa.toLocaleString()}
                        </h2>
                        <span className="text-2xl font-bold text-white/50">FCFA</span>
                    </div>
                </div>
                
                {/* Décoration fond */}
                <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
            </div>

            {/* --- VISUALISATION DES TRANCHES --- */}
            <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] space-y-8">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" /> Analyse des Tranches
                    </h3>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-950 px-3 py-1 rounded-full border border-slate-800 uppercase">
                        {currentKwh.toFixed(1)} kWh consommés
                    </span>
                </div>

                <div className="space-y-6">
                    <div className="relative pt-8">
                        <div className="absolute top-0 left-0 text-[10px] font-black text-slate-500 uppercase">Tranche Sociale (79 FCFA)</div>
                        <div className="absolute top-0 right-0 text-[10px] font-black text-slate-500 uppercase">Tranche Normale (130 FCFA)</div>
                        
                        <div className="h-4 bg-slate-800 rounded-full overflow-hidden border-4 border-slate-900">
                            <div 
                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all duration-1000"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                        
                        {/* Indicateur de seuil (50 kWh) */}
                        <div className="absolute top-6 left-[50%] -translate-x-1/2 flex flex-col items-center">
                            <div className="w-px h-8 bg-slate-700"></div>
                            <span className="text-[9px] font-bold text-slate-500 mt-2">SEUIL {socialThreshold} kWh</span>
                        </div>
                    </div>

                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-6 rounded-3xl">
                        <div className="flex gap-4">
                            <HelpCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                            <p className="text-sm text-slate-400 leading-relaxed">
                                {currentKwh < socialThreshold 
                                  ? `Votre consommation est maîtrisée. Vous bénéficiez du tarif réduit à 79 FCFA/kWh. Il vous reste ${ (socialThreshold - currentKwh).toFixed(1) } kWh avant de passer au tarif normal.`
                                  : `Vous avez dépassé le seuil social de ${socialThreshold} kWh. Chaque kWh supplémentaire vous coûte désormais 130 FCFA.`}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* --- SIDEBAR : GRILLE TARIFAIRE & HISTORIQUE --- */}
        <div className="space-y-8">
            <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-[2rem]">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Grille Tarifaire SBEE</h3>
                <div className="space-y-4">
                    {loadingTariffs ? (
                        <div className="text-slate-600 text-xs animate-pulse">Chargement des tarifs...</div>
                    ) : tariffs?.map(t => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-slate-950 rounded-2xl border border-slate-900 hover:border-slate-800 transition-colors">
                            <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase">{t.name}</p>
                                <p className="text-sm font-black text-white">{t.price_per_kwh} <small className="text-[10px] text-slate-500">FCFA/kWh</small></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">Seuil</p>
                                <p className="text-sm font-black text-slate-400">{t.max_kwh ? `< ${t.max_kwh} kWh` : 'Sans limite'}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-[2rem]">
                <h3 className="text-xs font-bold text-white uppercase tracking-widest mb-6">Dépenses 7 derniers jours</h3>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historyData}>
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 10}} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#020617', border: 'none', borderRadius: '10px'}} />
                            <Bar dataKey="cost" radius={[4, 4, 4, 4]}>
                                {historyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 4 ? '#3b82f6' : '#1e293b'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Moyenne journalière</span>
                    <span className="text-sm font-black text-white">490 FCFA</span>
                </div>
            </div>
        </div>

      </div>
    </div>
  )
}
