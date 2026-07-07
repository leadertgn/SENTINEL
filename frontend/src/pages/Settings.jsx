import React, { useState } from "react";
import {
  Zap,
  RotateCcw,
  Database,
  ShieldAlert,
  CheckCircle,
  Info,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const triggerSim = async (type, val = null) => {
    setLoading(true);
    setMessage(null);
    try {
      let res;
      if (type === "voltage") {
        res = await fetch(`${API_URL}/api/sim/voltage?voltage=${val}`, {
          method: "POST",
        });
      } else if (type === "reset") {
        res = await fetch(`${API_URL}/api/sim/reset`, { method: "POST" });
      } else if (type === "seed") {
        res = await fetch(`${API_URL}/api/sim/seed-history`, {
          method: "POST",
        });
      } else if (type === "clear") {
        res = await fetch(`${API_URL}/api/sim/clear-history`, {
          method: "POST",
        });
      }

      if (!res.ok) throw new Error("Erreur lors de la requête");
      await res.json();

      if (type === "voltage") {
        setMessage({
          type: "success",
          text: `Tension de ${val}V simulée avec succès ! (Protection active armée)`,
        });
      } else if (type === "reset") {
        setMessage({
          type: "success",
          text: "Simulation arrêtée. Retour aux données réelles de l'ESP32.",
        });
      } else if (type === "seed") {
        setMessage({
          type: "success",
          text: "Historique de démo (avril, mai, juin 2026) injecté en base.",
        });
      } else if (type === "clear") {
        setMessage({
          type: "success",
          text: "Historique de démo supprimé. Les mesures réelles du mois courant sont intactes.",
        });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e.message || "Une erreur est survenue.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto space-y-8">
      {/* Notification Toast ou Inline */}
      {message && (
        <div
          className={`p-4 rounded border flex items-center gap-3 text-sm font-sans
          ${message.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}
        >
          {message.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
          ) : (
            <ShieldAlert className="w-5 h-5 text-red-500 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* ── SECTION 1 : SIMULATIONS DE TENSION ── */}
      <section className="bg-white rounded-lg border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[#1a2e4a] text-white flex items-center gap-2 border-b border-slate-200">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h3 className="font-bold text-lg font-sans">
            Simulation des anomalies réseau (PZEM Master)
          </h3>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-600 leading-relaxed">
            Utilisez ces commandes pour forcer des conditions de tension
            anormales sur le compteur principal. Le système FastAPI appliquera
            la barrière de protection en coupant les relais des Nodes si la
            tension sort de la plage de sécurité <strong>[180V - 250V]</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <button
              onClick={() => triggerSim("voltage", 175.0)}
              disabled={loading}
              className="px-4 py-3 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded font-sans font-bold transition-all"
            >
              Simuler Sous-tension (175 V)
            </button>
            <button
              onClick={() => triggerSim("voltage", 254.0)}
              disabled={loading}
              className="px-4 py-3 bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 rounded font-sans font-bold transition-all"
            >
              Simuler Surtension (254 V)
            </button>
            <button
              onClick={() => triggerSim("voltage", 220.0)}
              disabled={loading}
              className="px-4 py-3 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 rounded font-sans font-bold transition-all"
            >
              Tension Normale (220 V)
            </button>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => triggerSim("reset")}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded font-sans font-bold transition-all text-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Réinitialiser (Retour au Hardware réel)
            </button>
          </div>
        </div>
      </section>

      {/* ── SECTION 2 : SEEDING DE L'HISTORIQUE ── */}
      <section className="bg-white rounded-lg border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[#1a2e4a] text-white flex items-center gap-2 border-b border-slate-200">
          <Database className="w-5 h-5 text-blue-300" />
          <h3 className="font-bold text-lg font-sans">
            Jeux de données pour la Facturation
          </h3>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-sm text-slate-600 leading-relaxed">
            Pour la soutenance, l'historique de consommation de la page{" "}
            <strong>Facturation</strong> sera vide si l'application vient d'être
            démarrée. Ce bouton insère 3 mois de données cohérentes en DB
            (Avril, Mai, Juin 2026) avec une consommation progressive pour
            chaque tranche de la SBEE.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded p-4 flex gap-3 text-xs text-slate-500">
            <Info className="w-4 h-4 text-[#1a2e4a] shrink-0 mt-0.5" />
            <div>
              Les données de simulation sont insérées avec des dates passées
              (ex: 15 mai 2026). Elles n'interfèrent pas avec le calcul du mois
              courant de votre démonstration réelle.
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-3 justify-start">
            <button
              onClick={() => triggerSim("seed")}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-3 bg-[#1a2e4a] text-white hover:bg-[#112035] rounded font-sans font-bold transition-all"
            >
              <Database className="w-5 h-5" />
              Charger l'historique de démonstration (3 mois)
            </button>
            <button
              onClick={() => triggerSim("clear")}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-3 border-2 border-[#1a2e4a] text-[#1a2e4a] hover:bg-slate-100 rounded font-sans font-bold transition-all"
            >
              <Database className="w-5 h-5" />
              Supprimer l'historique de démonstration
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
