import React, { useState } from 'react'
import { Power, AlertOctagon, CheckCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/* ── Toast notification ── */
function Toast({ message, type, onClose }) {
  if (!message) return null
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
      px-5 py-3 rounded-lg shadow-lg border text-sm font-medium
      ${type === 'error'
        ? 'bg-red-50 border-red-200 text-red-700'
        : 'bg-green-50 border-green-200 text-green-700'
      }`}>
      {type === 'error'
        ? <AlertOctagon className="w-4 h-4 text-red-500 flex-shrink-0" />
        : <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />}
      <span>{message}</span>
      <button onClick={onClose} className="ml-3 text-slate-400 hover:text-slate-700 text-base leading-none">✕</button>
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
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ mac, role }) => {
      if (role === 'MASTER') throw new Error('Le compteur général ne peut pas être commandé via ce panneau.')
      const res = await fetch(`${API_URL}/api/devices/${mac}/toggle`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Erreur technique')
      }
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      showToast(`${data.name} : relais ${data.is_active ? 'activé' : 'désactivé'} avec succès.`, 'success')
    },
    onError: (error) => {
      showToast(error.message, 'error')
    },
  })

  if (isLoading) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
        <div className="w-5 h-5 border-4 border-blue-800 border-t-transparent rounded-full animate-spin mr-3" />
        Récupération des terminaux…
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
        ⚠️ Impossible de joindre le serveur. Vérifiez votre connexion réseau.
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />

      {/* Tableau des équipements */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-blue-800 text-white">
          <h3 className="font-bold text-sm">Liste des équipements connectés</h3>
          <p className="text-blue-200 text-xs mt-0.5">
            Cliquez sur le bouton de commande pour activer ou désactiver un relais.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 text-left font-semibold">Nom</th>
                <th className="px-5 py-3 text-left font-semibold">Adresse MAC</th>
                <th className="px-5 py-3 text-left font-semibold">Rôle</th>
                <th className="px-5 py-3 text-left font-semibold">Connexion</th>
                <th className="px-5 py-3 text-left font-semibold">État relais</th>
                <th className="px-5 py-3 text-center font-semibold">Commande</th>
              </tr>
            </thead>
            <tbody>
              {devices?.map((node, idx) => {
                const isMaster = node.role === 'MASTER'
                const isOnline = node.status === 'ONLINE'
                return (
                  <tr key={node.mac_address}
                    className={`border-b border-slate-100 transition-colors hover:bg-slate-50
                      ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>

                    {/* Nom */}
                    <td className="px-5 py-3 font-semibold text-slate-800">
                      {node.name}
                      {isMaster && (
                        <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase tracking-wide font-bold">
                          Maître
                        </span>
                      )}
                    </td>

                    {/* MAC */}
                    <td className="px-5 py-3 font-mono text-slate-400 text-xs">{node.mac_address}</td>

                    {/* Rôle */}
                    <td className="px-5 py-3 text-slate-600">{isMaster ? 'Compteur général' : 'Nœud'}</td>

                    {/* Statut connexion */}
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                        ${isOnline ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        <span className="relative flex h-1.5 w-1.5">
                          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60
                            ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          <span className={`relative inline-flex rounded-full h-1.5 w-1.5
                            ${isOnline ? 'bg-green-600' : 'bg-red-600'}`}></span>
                        </span>
                        {isOnline ? 'En ligne' : 'Hors ligne'}
                      </span>
                    </td>

                    {/* État relais */}
                    <td className="px-5 py-3">
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold
                        ${node.is_active
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                        {node.is_active ? 'Activé (ON)' : 'Coupé (OFF)'}
                      </span>
                    </td>

                    {/* Bouton commande */}
                    <td className="px-5 py-3 text-center">
                      {isMaster ? (
                        <span className="text-xs text-slate-400 italic">Protégé</span>
                      ) : (
                        <button
                          onClick={() => toggleMutation.mutate({ mac: node.mac_address, role: node.role })}
                          disabled={toggleMutation.isPending || !isOnline}
                          title={!isOnline ? 'Équipement hors ligne' : node.is_active ? 'Désactiver' : 'Activer'}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-all
                            ${!isOnline
                              ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed'
                              : node.is_active
                                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                            }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {node.is_active ? 'Désactiver' : 'Activer'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Note de bas de tableau */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-400">
          ℹ️ Le compteur général (rôle Maître) est protégé contre toute coupure via ce panneau.
          Les nœuds hors ligne ne peuvent pas être commandés à distance.
        </div>
      </div>
    </div>
  )
}