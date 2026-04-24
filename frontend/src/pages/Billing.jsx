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

  // Historique factice pour démo
  const historyData = [
    { day: 'Lun', cost: 450 }, { day: 'Mar', cost: 620 }, { day: 'Mer', cost: 380 },
    { day: 'Jeu', cost: 510 }, { day: 'Ven', cost: 890 }, { day: 'Sam', cost: 420 }, { day: 'Dim', cost: 310 },
  ]

  const currentKwh = telemetry.master.kwh_total || 0
  
  // Seuil social SBEE (20 kWh)
  const socialThreshold = (tariffs && tariffs[0]?.max_kwh) || 20
  const progress = Math.min((currentKwh / socialThreshold) * 100, 100)

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-0 space-y-8">
      
      {/* HEADER PAGE */}
      <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Bilan Tarifaire SBEE</h1>
          <p className="text-slate-500 text-sm italic">Simulation Postpayé Basse Tension (Étude de Cas)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* --- COLONNE PRINCIPALE --- */}
        <div className="lg:col-span-2 space-y-8">
            
            {/* CARTE TOTAL FACTURE */}
            <div className="p-8 bg-gradient-to-br from-blue-900 to-slate-900 border border-blue-500/20 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-8">
                        <div className="p-4 bg-blue-500/20 rounded-2xl border border-blue-500/30">
                            <CreditCard className="w-8 h-8 text-blue-400" />
                        </div>
                        <div className="text-right">
                            <p className="text-blue-200/60 text-[10px] font-bold uppercase tracking-widest mb-1">Type de Compteur</p>
                            <p className="text-blue-100 font-black text-sm uppercase tracking-widest">Postpayé BT</p>
                        </div>
                    </div>
                    
                    <p className="text-blue-200/60 text-xs font-bold uppercase tracking-widest mb-2">Estimation Facture Totale</p>
                    <div className="flex items-baseline gap-4 mb-8">
                        <h2 className="text-7xl font-black text-white leading-none tracking-tighter">
                            {telemetry.billing.total_fcfa.toLocaleString()}
                        </h2>
                        <span className="text-xl font-bold text-blue-400">FCFA</span>
                    </div>

                    {/* DÉTAIL DU COÛT */}
                    <div className="grid grid-cols-2 gap-4 border-t border-blue-500/20 pt-6 mt-4">
                        <div>
                            <p className="text-[10px] font-bold text-blue-200/60 uppercase tracking-widest mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> Énergie Consommée</p>
                            <p className="text-2xl font-black text-blue-100">{telemetry.billing.energy_cost.toLocaleString()} <span className="text-[10px] text-blue-400">FCFA</span></p>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-blue-200/60 uppercase tracking-widest mb-1 flex items-center gap-1"><Info className="w-3 h-3" /> Abonnement KVA</p>
                            <p className="text-2xl font-black text-blue-100">{telemetry.billing.fixed_premium.toLocaleString()} <span className="text-[10px] text-blue-400">FCFA</span></p>
                        </div>
                    </div>
                </div>
                
                <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000"></div>
            </div>

            {/* BARRE DE PROGRESSION (TRANCHE SOCIALE) */}
            <div className="p-8 bg-slate-900/60 border border-slate-800 rounded-[2.5rem] space-y-8">
                <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-500" /> Analyse de Tranche Sociale
                    </h3>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-xl border border-emerald-900/50 uppercase tracking-widest">
                        {(currentKwh * 1000).toFixed(1)} Wh consommés
                    </span>
                </div>

                <div className="space-y-6">
                    <div className="relative pt-8 pb-4">
                        <div className="absolute top-0 left-0 text-[10px] font-black text-emerald-500 uppercase tracking-widest">Tranche Sociale</div>
                        <div className="absolute top-0 right-0 text-[10px] font-black text-rose-500 uppercase tracking-widest">Tranche 1</div>
                        
                        <div className="h-4 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                            {/* Marqueur de seuil (20 kWh) */}
                            <div className="absolute top-0 bottom-0 left-[100%] w-0.5 bg-rose-500 z-10 shadow-[0_0_10px_rgba(244,63,94,1)]"></div>
                            
                            <div 
                                className={`h-full transition-all duration-1000 ${currentKwh <= socialThreshold ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500'}`}
                                style={{ width: `${Math.min((currentKwh / Math.max(socialThreshold * 2, currentKwh)) * 100, 100)}%` }} // Visualisation qui dépasse le seuil si besoin
                            />
                        </div>
                        
                        <div className="flex justify-between mt-3">
                            <span className="text-[9px] font-bold text-slate-500">0 kWh</span>
                            <span className="text-[9px] font-black text-white bg-slate-800 px-2 py-0.5 rounded">Seuil {socialThreshold} kWh</span>
                            <span className="text-[9px] font-bold text-slate-500">{socialThreshold * 2} kWh</span>
                        </div>
                    </div>

                    <div className={`p-5 rounded-2xl border ${currentKwh <= socialThreshold ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                        <div className="flex gap-4 items-start">
                            <HelpCircle className={`w-5 h-5 mt-0.5 ${currentKwh <= socialThreshold ? 'text-emerald-500' : 'text-rose-500'} shrink-0`} />
                            <p className="text-xs text-slate-400 leading-relaxed font-medium">
                                {currentKwh <= socialThreshold 
                                  ? `Votre consommation est maîtrisée. Vous bénéficiez du tarif réduit à 88 FCFA/kWh. Il vous reste ${(socialThreshold - currentKwh).toFixed(2)} kWh avant de passer à la Tranche 1 (125 FCFA/kWh).`
                                  : `Vous avez dépassé le seuil social de ${socialThreshold} kWh. L'énergie supplémentaire est désormais facturée au tarif de la Tranche 1 (125 FCFA/kWh).`}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* --- COLONNE SECONDAIRE --- */}
        <div className="space-y-8">
            
            {/* NOTE PÉDAGOGIQUE POUR LA SOUTENANCE */}
            <div className="p-6 bg-slate-800/40 border border-slate-700/50 rounded-[2rem]">
                <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <h3 className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Note d'Étude</h3>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                    Cette simulation utilise la grille tarifaire <strong>Postpayé Basse Tension</strong> de la SBEE. <br/><br/>
                    La Prime Fixe (Abonnement) affichée est calculée sur la base d'une puissance souscrite fixée à <strong>5 KVA</strong> (500 FCFA × 5) à des fins de démonstration.
                </p>
            </div>

            {/* GRILLE TARIFAIRE SBEE */}
            <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-[2rem]">
                <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] mb-6">Grille Tarifaire SBEE</h3>
                <div className="space-y-3">
                    {loadingTariffs ? (
                        <div className="text-slate-600 text-xs animate-pulse">Chargement des tarifs...</div>
                    ) : tariffs?.map((t, i) => (
                        <div key={t.id} className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50 hover:border-slate-700 transition-colors">
                            <div>
                                <p className="text-[10px] font-black text-white uppercase tracking-widest">{t.name}</p>
                                <p className="text-sm font-black text-blue-400">{t.price_per_kwh} <small className="text-[9px] text-slate-500 uppercase">FCFA/kWh</small></p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Seuil</p>
                                <p className="text-xs font-black text-slate-400">
                                    {t.min_kwh === 0 ? `≤ ${t.max_kwh} kWh` : t.max_kwh ? `${t.min_kwh} - ${t.max_kwh} kWh` : `> ${t.min_kwh} kWh`}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* HISTORIQUE (Mock) */}
            <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-[2rem]">
                <h3 className="text-xs font-bold text-white uppercase tracking-[0.2em] mb-6">Simulation 7 Jours</h3>
                <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historyData}>
                            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#475569', fontSize: 9, fontWeight: 'bold'}} />
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px'}} itemStyle={{color: '#fff', fontSize: '12px', fontWeight: 'bold'}} />
                            <Bar dataKey="cost" radius={[4, 4, 4, 4]}>
                                {historyData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 4 ? '#3b82f6' : '#1e293b'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>
      </div>
    </div>
  )
}
