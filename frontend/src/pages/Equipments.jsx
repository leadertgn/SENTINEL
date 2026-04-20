import React, { useState } from 'react'
import { Power, AlertOctagon, CheckCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_URL = 'http://127.0.0.1:8000/api/devices'

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
      const res = await fetch(`${API_URL}/`)
      if (!res.ok) throw new Error('Erreur réseau')
      return res.json()
    }
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, role }) => {
      if (role === 'MASTER') throw new Error("⚠️ Refusé : Vous ne pouvez pas couper le Master via le panneau Relais.")
      
      const res = await fetch(`${API_URL}/${id}/toggle`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Erreur inconnue')
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

  if (isLoading) return <div className="text-slate-400">Chargement des équipements...</div>
  if (isError) return <div className="text-rose-500">Erreur API.</div>
  
  return (
    <div className="relative">
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {devices?.map(node => {
          const isMaster = node.role === 'MASTER'
          return (
            <div key={node.id} className={`border rounded-3xl p-6 transition-all duration-300 ${node.is_active ? 'bg-slate-900/80 shadow-lg' : 'bg-slate-900/30'} ${isMaster ? 'border-blue-900/50 cursor-not-allowed opacity-80' : 'border-slate-800'}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                       {node.name}
                       {isMaster && <span className="bg-blue-500/20 text-blue-400 text-[10px] px-2 py-0.5 rounded uppercase">Maître</span>}
                    </h3>
                    <span className="text-xs text-slate-500 font-mono mt-1">{node.mac_address}</span>
                </div>
                <button 
                    onClick={() => toggleMutation.mutate({ id: node.id, role: node.role })}
                    disabled={toggleMutation.isPending || isMaster}
                    className={`p-3 rounded-full transition-all duration-300 ${isMaster ? 'bg-slate-800 text-slate-600' : node.is_active ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}
                >
                    <Power className="w-6 h-6" />
                </button>
              </div>
              
              <div className="flex gap-4 items-center">
                <div className={`w-2 h-2 rounded-full ${isMaster ? 'bg-blue-500' : node.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                <span className="text-sm font-medium text-slate-300">
                  {isMaster ? 'Connecté en permanence' : node.is_active ? 'En Fonctionnement (ON)' : 'Hors Tension (OFF)'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
