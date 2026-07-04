import React, { useState } from "react";
import { Power, AlertOctagon, CheckCircle, ShieldAlert } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTelemetryStore } from "../store/useTelemetryStore";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Plage de sécurité de la barrière de tension (identique au backend)
const VOLTAGE_MIN = 180;
const VOLTAGE_MAX = 250;

/* ── Toast notification ── */
function Toast({ message, type, onClose }) {
  if (!message) return null;
  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3
      px-6 py-4 rounded-lg shadow-xl border-2 text-base font-semibold max-w-2xl
      ${
        type === "error"
          ? "bg-red-100 border-red-300 text-red-800"
          : "bg-green-100 border-green-300 text-green-800"
      }`}
    >
      {type === "error" ? (
        <AlertOctagon className="w-6 h-6 text-red-600 shrink-0" />
      ) : (
        <CheckCircle className="w-6 h-6 text-green-700 shrink-0" />
      )}
      <span>{message}</span>
      <button
        onClick={onClose}
        className="ml-3 text-slate-600 hover:text-slate-700 text-base leading-none"
      >
        ✕
      </button>
    </div>
  );
}

export default function Equipments() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);

  // Tension effective de l'arrivée générale (réelle ou simulée) issue du flux
  // temps réel. Sert à verrouiller/griser les commandes hors plage de sécurité.
  const { telemetry } = useTelemetryStore();
  const masterVoltage = telemetry?.master?.voltage ?? null;
  const voltageLocked =
    masterVoltage !== null &&
    masterVoltage > 0 &&
    (masterVoltage < VOLTAGE_MIN || masterVoltage > VOLTAGE_MAX);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 7000);
  };

  const {
    data: devices,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/devices/`);
      if (!res.ok) throw new Error("Erreur réseau");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ mac, role }) => {
      if (role === "MASTER")
        throw new Error(
          "Le compteur général ne peut pas être commandé via ce panneau.",
        );
      const res = await fetch(`${API_URL}/api/devices/${mac}/toggle`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Erreur technique");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
      showToast(
        `${data.name} : relais ${data.is_active ? "activé" : "désactivé"} avec succès.`,
        "success",
      );
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  if (isLoading) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
        <div className="w-5 h-5 border-4 border-blue-800 border-t-transparent rounded-full animate-spin mr-3" />
        Récupération des terminaux…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
        ⚠️ Impossible de joindre le serveur. Vérifiez votre connexion réseau.
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <Toast
        message={toast?.message}
        type={toast?.type}
        onClose={() => setToast(null)}
      />

      {/* Tableau des équipements */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-blue-800 text-white text-center">
          <h3 className="font-bold text-2xl ">
            Liste des équipements connectés
          </h3>
          <p className="text-blue-200 text-xl mt-0.5">
            Cliquez sur le bouton de commande pour activer ou désactiver un
            relais.
          </p>
        </div>

        {voltageLocked && (
          <div className="px-6 py-3 bg-red-50 border-b border-red-200 flex items-center gap-2 text-sm font-semibold text-red-700">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            Tension hors plage de sécurité ({masterVoltage?.toFixed(0)} V). Barrière
            de protection active : l'allumage des relais est verrouillé (180–250 V).
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 text-left font-semibold">Nom</th>
                <th className="px-5 py-3 text-left font-semibold">
                  Adresse MAC
                </th>
                <th className="px-5 py-3 text-left font-semibold">Rôle</th>
                <th className="px-5 py-3 text-left font-semibold">Connexion</th>
                <th className="px-5 py-3 text-left font-semibold">
                  État relais
                </th>
                <th className="px-5 py-3 text-center font-semibold">
                  Commande
                </th>
              </tr>
            </thead>
            <tbody>
              {devices?.map((node, idx) => {
                const isMaster = node.role === "MASTER";
                const isOnline = node.status === "ONLINE";
                return (
                  <tr
                    key={node.mac_address}
                    className={`border-b border-slate-100 transition-colors hover:bg-slate-50
                      ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}
                  >
                    {/* Nom */}
                    <td className="px-5 py-3 font-semibold text-slate-800">
                      {node.name}
                      {isMaster && (
                        <span className="ml-2 text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded uppercase tracking-wide font-bold">
                          Maître
                        </span>
                      )}
                    </td>

                    {/* MAC */}
                    <td className="px-5 py-3 font-mono text-slate-600 text-sm">
                      {node.mac_address}
                    </td>

                    {/* Rôle */}
                    <td className="px-5 py-3 text-slate-600">
                      {isMaster ? "Compteur général" : "Nœud"}
                    </td>

                    {/* Statut connexion */}
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold
                        ${isOnline ? "bg-green-100 text-green-800 border border-green-300" : "bg-red-100 text-red-700 border border-red-300"}`}
                      >
                        <span className="relative flex h-2.5 w-2.5">
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60
                            ${isOnline ? "bg-green-500" : "bg-red-500"}`}
                          ></span>
                          <span
                            className={`relative inline-flex rounded-full h-2.5 w-2.5
                            ${isOnline ? "bg-green-600" : "bg-red-600"}`}
                          ></span>
                        </span>
                        {isOnline ? "En ligne" : "Hors ligne"}
                      </span>
                    </td>

                    {/* État relais */}
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block px-3 py-1.5 rounded text-sm font-semibold
                        ${
                          node.is_active
                            ? "bg-green-100 text-green-800 border border-green-300"
                            : "bg-slate-100 text-slate-600 border border-slate-300"
                        }`}
                      >
                        {node.is_active ? "Activé (ON)" : "Coupé (OFF)"}
                      </span>
                    </td>

                    {/* Bouton commande */}
                    <td className="px-5 py-3 text-center">
                      {isMaster ? (
                        <span className="text-xs text-slate-600 italic">
                          Protégé
                        </span>
                      ) : (
                        (() => {
                          // On peut toujours ÉTEINDRE ; on ne verrouille que
                          // l'ALLUMAGE quand la tension est hors plage (comme le backend).
                          const blockOn = voltageLocked && !node.is_active;
                          const disabled =
                            toggleMutation.isPending || !isOnline || blockOn;
                          const title = !isOnline
                            ? "Équipement hors ligne"
                            : blockOn
                              ? `Tension hors plage (${masterVoltage?.toFixed(0)} V) — commande verrouillée`
                              : node.is_active
                                ? "Désactiver"
                                : "Activer";
                          return (
                            <button
                              onClick={() =>
                                toggleMutation.mutate({
                                  mac: node.mac_address,
                                  role: node.role,
                                })
                              }
                              disabled={disabled}
                              title={title}
                              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-semibold border transition-all
                            ${
                              !isOnline || blockOn
                                ? "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                                : node.is_active
                                  ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                                  : "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            }`}
                            >
                              {blockOn ? (
                                <ShieldAlert className="w-3.5 h-3.5" />
                              ) : (
                                <Power className="w-3.5 h-3.5" />
                              )}
                              {blockOn
                                ? "Verrouillé"
                                : node.is_active
                                  ? "Désactiver"
                                  : "Activer"}
                            </button>
                          );
                        })()
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Note de bas de tableau */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 text-sm">
          ℹ️ Le compteur général (rôle Maître) est protégé contre toute coupure
          via ce panneau. Les nœuds hors ligne ne peuvent pas être commandés à
          distance.
        </div>
      </div>
    </div>
  );
}
