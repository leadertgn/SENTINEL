import React, { useState } from 'react'
import { Power, AlertOctagon, CheckCircle, Wifi, WifiOff } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

function Toast({ message, type, onClose }) {
  if (!message) return null;
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl transition-all duration-500 animate-in slide-in-from-bottom-5 ${type === 'error' ? 'bg-rose-950/90 text-rose-200 border border-rose-900/50' : 'bg-emerald-950/90 text-emerald-200 border border-emerald-900/50'}`}>
      {type === 'error' ? <AlertOctagon className="w-5 h-5 text-rose-500" /> : <CheckCircle className="w-5 h-5 text-emerald-500" />}
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="ml-4 text-slate-400 hover:text-white">✕</button>
    </div>
  )
}

export default function Equipments() {
  const queryClient = useQueryClient()
  const [toast, setToast] = useState(null)

  const showToast = (message, type) => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  const { data: devices, isLoading, isError } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/devices/`)
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    }
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ mac, role }) => {
      if (role === 'MASTER') throw new Error("⚠️ Refusé : Vous ne pouvez pas couper le Master via le panneau Relais.")
      
      const res = await fetch(`${API_URL}/api/devices/${mac}/toggle`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Erreur technique')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      showToast(`${data.name} a été ${data.is_active ? 'ALLUMÉ' : 'ÉTEINT'} avec succès.`, 'success')
    },
    onError: (error) => {
      showToast(error.message, 'error')
    }
  })

  if (isLoading) return <div className="h-64 flex items-center justify-center text-slate-500 animate-pulse font-bold">Récupération des terminaux...</div>
  if (isError) return <div className="p-8 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-3xl">Impossible de joindre le Backend. Vérifiez votre connexion.</div>
  
  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8 space-y-8">
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      
      <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Gestion des Relais</h1>
          <p className="text-slate-500 text-sm italic">Pilotez et surveillez l'état de chaque node en temps réel.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {devices?.map(node => {
          const isMaster = node.role === 'MASTER'
          const isOnline = node.status === 'ONLINE'
          
          return (
            <div key={node.mac_address} className={`relative border rounded-3xl p-6 transition-all duration-300 group ${node.is_active ? 'bg-slate-900/80 shadow-xl' : 'bg-slate-900/30'} ${isMaster ? 'border-blue-500/20' : 'border-slate-800'}`}>
              
              {/* Badge de statut */}
              <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-950/50 border border-slate-800">
                <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></div>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isOnline ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {isOnline ? 'En ligne' : 'Hors ligne'}
                </span>
              </div>

              <div className="flex justify-between items-start mb-8 pt-4">
                <div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                       {node.name}
                       {isMaster && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-md border border-blue-500/30 uppercase font-bold">Maître</span>}
                    </h3>
                    <div className="flex items-center gap-2 mt-2">
                       <span className="text-[10px] text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded">{node.mac_address}</span>
                    </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">État du Relais</p>
                    <p className={`text-sm font-black ${node.is_active ? 'text-emerald-500' : 'text-slate-500'}`}>
                        {node.is_active ? 'ACTIF (ON)' : 'COUPÉ (OFF)'}
                    </p>
                </div>

                <button 
                    onClick={() => toggleMutation.mutate({ mac: node.mac_address, role: node.role })}
                    disabled={toggleMutation.isPending || isMaster || !isOnline}
                    className={`p-5 rounded-2xl transition-all duration-500 ${isMaster ? 'bg-slate-800 text-slate-600 opacity-50' : !isOnline ? 'bg-slate-800 text-slate-700 opacity-50 cursor-not-allowed' : node.is_active ? 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500 hover:text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-slate-800 text-slate-500 hover:bg-emerald-500/20 hover:text-emerald-500'}`}
                >
                    <Power className="w-8 h-8" />
                </button>
              </div>

              {/* Message de sécurité Master */}
              {isMaster && (
                <p className="mt-4 text-[10px] text-blue-500/50 italic text-center border-t border-blue-500/10 pt-3">
                  ⚠️ Protection : Pilotage centralisé interdit pour le Master.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
