import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  TrendingUp,
  Zap,
  Info,
  ShieldAlert,
  Calculator,
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Billing() {
  /* ── Consommation du mois courant (somme des deltas) ── */
  const { data: currentBilling, isLoading: loadingCurrent } = useQuery({
    queryKey: ["billing-current"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/telemetry/billing-current`);
      if (!res.ok) throw new Error("Erreur réseau");
      return res.json();
    },
    refetchInterval: 15000,
  });

  /* ── Grille tarifaire ── */
  const { data: tariffs, isLoading: loadingTariffs } = useQuery({
    queryKey: ["tariffs"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/tariffs`);
      return res.json();
    },
  });

  /* ── Historique mensuel ── */
  const { data: reportData, isLoading: loadingReport } = useQuery({
    queryKey: ["billing-report"],
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/telemetry/billing-report?granularity=month`,
      );
      return res.json();
    },
  });

  /* ── Simulateur de facturation (saisie d'un index kWh) ── */
  const [simKwh, setSimKwh] = useState("280");
  const { data: simResult, refetch: runSim, isFetching: simLoading } = useQuery({
    queryKey: ["billing-simulate", simKwh],
    queryFn: async () => {
      const res = await fetch(
        `${API_URL}/api/billing/simulate?kwh=${encodeURIComponent(simKwh || 0)}`,
      );
      if (!res.ok) throw new Error("Erreur réseau");
      return res.json();
    },
    enabled: false,
  });

  /* ── Valeurs dérivées ── */
  const currentKwh = currentBilling?.kwh_month ?? 0;
  const totalFcfa =
    currentBilling?.total_fcfa ?? currentBilling?.cost_fcfa ?? 0;
  const fixedPremium = currentBilling?.fixed_premium ?? 0;
  const activeTariff = currentBilling?.active_tariff ?? "—";
  const socialMax = (tariffs && tariffs[0]?.max_kwh) || 20;
  const progress = Math.min((currentKwh / socialMax) * 100, 100);
  const remaining = Math.max(0, socialMax - currentKwh);

  const getTariffColor = (name = "") => {
    if (name.includes("Sociale"))
      return "bg-green-100 text-green-700 border-green-200";
    if (name.includes("1")) return "bg-blue-100 text-blue-700 border-blue-200";
    return "bg-orange-100 text-orange-700 border-orange-200";
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* ── SECTION 1 : FACTURE MENSUELLE EN COURS ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Carte Facture */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                Facture du mois en cours
              </span>
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
            {loadingCurrent ? (
              <div className="h-14 bg-slate-100 animate-pulse rounded-md" />
            ) : null}
            {currentKwh > 0 ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-extrabold text-slate-900 tracking-tight">
                  {totalFcfa.toLocaleString("fr-FR")}
                </span>
                <span className="text-xl font-bold text-slate-600">FCFA</span>
              </div>
            ) : (
              <div className="text-2xl font-bold text-slate-500 py-2">
                En attente de consommation…
              </div>
            )}
            <p className="text-base text-slate-600 mt-2">
              Consommation du mois :{" "}
              <span className="font-bold text-slate-800">
                {currentKwh.toFixed(3)} kWh
              </span>
            </p>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="border border-slate-200 rounded px-3 py-2 bg-slate-50">
                <p className="text-sm text-slate-600 uppercase tracking-wider">
                  Coût énergie (paliers)
                </p>
                <p className="font-bold text-slate-800">
                  {totalFcfa.toLocaleString("fr-FR")} FCFA
                </p>
              </div>
              <div className="border border-slate-200 rounded px-3 py-2 bg-slate-50">
                <p className="text-sm text-slate-600 uppercase tracking-wider">
                  Prime fixe SBEE
                </p>
                <p className="font-bold text-slate-800">
                  {fixedPremium.toLocaleString("fr-FR")} FCFA
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-600 leading-snug">
              Prime fixe = 500 FCFA/kVA souscrit (redevance SBEE), affichée à part
              — non incluse dans le coût énergie.
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">Tranche active :</span>
              <span
                className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase border ${getTariffColor(activeTariff)}`}
              >
                {activeTariff}
              </span>
            </div>
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
                className={`h-full rounded-full transition-all duration-700 ${progress >= 100 ? "bg-orange-500" : "bg-green-500"}`}
                style={{ width: `${Math.max(progress, 0.5)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-slate-600 mb-4">
              <span>0 kWh</span>
              <span>{socialMax} kWh</span>
            </div>

            <p className="text-sm text-slate-500 leading-relaxed">
              {progress >= 100 ? (
                <span className="text-orange-600 font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  Seuil subventionné dépassé. Le tarif passe à 125 FCFA/kWh
                  (Tranche 1).
                </span>
              ) : (
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-500 shrink-0" />
                  Il vous reste{" "}
                  <strong className="text-slate-800 mx-1">
                    {remaining.toFixed(3)} kWh
                  </strong>
                  avant de basculer en Tranche 1 (125 FCFA/kWh).
                </span>
              )}
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-600">
            <Zap className="w-3.5 h-3.5 text-yellow-500" />
            Consommation calculée sur les relevés du mois en cours (somme des
            incréments). Réinitialisation le 1er de chaque mois.
          </div>
        </div>
      </section>

      {/* ── SIMULATEUR DE FACTURATION (saisie kWh) ── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-700">
            Simulateur de facturation SBEE
          </h3>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-slate-500 leading-relaxed">
            Saisissez un index de consommation mensuel (kWh). Le moteur applique
            les paliers progressifs de la SBEE et affiche le détail par tranche.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider text-slate-500 mb-1">
                Consommation (kWh)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={simKwh}
                onChange={(e) => setSimKwh(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSim()}
                className="w-40 px-3 py-2 border-2 border-slate-300 rounded font-mono text-lg font-bold text-slate-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              onClick={() => runSim()}
              disabled={simLoading}
              className="px-5 py-2.5 bg-[#1a2e4a] text-white hover:bg-[#112035] rounded font-sans font-bold text-sm transition-all disabled:opacity-60"
            >
              {simLoading ? "Calcul…" : "Calculer la facture"}
            </button>
          </div>

          {simResult && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-sm uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2 text-left font-semibold">
                        Tranche
                      </th>
                      <th className="px-4 py-2 text-right font-semibold">kWh</th>
                      <th className="px-4 py-2 text-right font-semibold">
                        Tarif
                      </th>
                      <th className="px-4 py-2 text-right font-semibold">
                        Sous-total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResult.breakdown?.map((b) => (
                      <tr key={b.name} className="border-b border-slate-100">
                        <td className="px-4 py-2 font-semibold text-slate-700">
                          {b.name}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">
                          {b.kwh}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-slate-600">
                          {b.price_per_kwh} F
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-slate-800">
                          {b.subtotal.toLocaleString("fr-FR")} F
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200">
                      <td
                        colSpan="3"
                        className="px-4 py-3 font-bold text-slate-700 text-right"
                      >
                        Coût énergie total
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-blue-700 text-lg">
                        {simResult.total_fcfa?.toLocaleString("fr-FR")} FCFA
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="px-4 py-2 text-sm text-slate-600 bg-white border-t border-slate-100">
                + Prime fixe SBEE : {simResult.fixed_premium?.toLocaleString("fr-FR")}{" "}
                FCFA (500 FCFA/kVA souscrit, hors coût énergie).
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ── SECTION 2 : GRILLE TARIFAIRE ── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-700">
            Grille Tarifaire SBEE de Référence
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold text-left">Tranche</th>
                <th className="px-6 py-3 font-semibold text-left">
                  Plage de Consommation
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingTariffs ? (
                <tr>
                  <td
                    colSpan="4"
                    className="px-6 py-6 text-center text-slate-600 animate-pulse text-xs"
                  >
                    Chargement…
                  </td>
                </tr>
              ) : (
                tariffs?.map((t, idx) => (
                  <tr
                    key={t.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx === 0 ? "bg-green-50/30" : ""}`}
                  >
                    <td className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wide">
                      <span
                        className={`px-2.5 py-1 rounded border ${getTariffColor(t.name)}`}
                      >
                        {t.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600">
                      {t.min_kwh === 0
                        ? `Jusqu'à ${t.max_kwh} kWh`
                        : t.max_kwh
                          ? `De ${t.min_kwh} à ${t.max_kwh} kWh`
                          : `Au-delà de ${t.min_kwh} kWh`}
                    </td>
                    <td className="px-6 py-4 font-extrabold text-slate-800 text-right text-base">
                      {t.price_per_kwh}{" "}
                      <span className="text-xs font-normal text-slate-600">
                        FCFA
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-xs font-semibold">
                      <span className="text-slate-500 font-bold">
                        500 F/kVA
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── SECTION 3 : HISTORIQUE MENSUEL ── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          <h3 className="font-bold text-sm text-slate-700">
            Historique Mensuel de Consommation & Facturation
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-semibold text-left">Période</th>
                <th className="px-6 py-3 font-semibold text-blue-600 text-left">
                  Global (Master)
                </th>
                {reportData?.node_names?.map((name) => (
                  <th
                    key={name}
                    className="px-6 py-3 font-semibold text-emerald-600 text-left"
                  >
                    {name}
                  </th>
                ))}
                <th className="px-6 py-3 font-semibold text-rose-600 text-left">
                  Inconnu (Pertes / Veilles)
                </th>
                <th className="px-6 py-3 font-semibold text-slate-700 text-right">
                  Coût Total Estimé
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingReport ? (
                <tr>
                  <td
                    colSpan={5 + (reportData?.node_names?.length || 0)}
                    className="px-6 py-8 text-center text-slate-600 animate-pulse text-xs"
                  >
                    Analyse des relevés historiques…
                  </td>
                </tr>
              ) : !reportData?.data || reportData.data.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + (reportData?.node_names?.length || 0)}
                    className="px-6 py-8 text-center text-slate-600 text-xs"
                  >
                    Aucun historique mensuel disponible.
                  </td>
                </tr>
              ) : (
                reportData.data.map((row) => {
                  const [year, month] = row.period.split("-");
                  const label = new Date(
                    year,
                    parseInt(month) - 1,
                  ).toLocaleDateString("fr-FR", {
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <tr
                      key={row.period}
                      className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-semibold text-slate-700 capitalize">
                        {label}
                      </td>
                      <td className="px-6 py-4 font-bold text-blue-700">
                        {row.master.toFixed(3)}{" "}
                        <span className="text-xs text-slate-600 font-normal">
                          kWh
                        </span>
                      </td>
                      {reportData.node_names.map((name) => (
                        <td
                          key={name}
                          className="px-6 py-4 font-medium text-slate-600"
                        >
                          {(row.nodes[name] || 0).toFixed(3)}{" "}
                          <span className="text-xs text-slate-600">kWh</span>
                        </td>
                      ))}
                      <td className="px-6 py-4 font-medium text-rose-600">
                        {row.unknown.toFixed(3)}{" "}
                        <span className="text-xs text-rose-400 font-normal">
                          kWh
                        </span>
                      </td>
                      <td className="px-6 py-4 font-extrabold text-slate-900 text-right text-base">
                        {row.cost_fcfa.toLocaleString("fr-FR")}{" "}
                        <span className="text-xs text-slate-600 font-normal">
                          FCFA
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
