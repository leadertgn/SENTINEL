import React, { useMemo } from "react";
import { useTelemetryStore } from "../store/useTelemetryStore";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import {
  Activity,
  Zap,
  ShieldAlert,
  Cpu,
  Network,
  Database,
  Layers,
} from "lucide-react";

const DEFAULT_SYS_STATUS = { mqtt: false, db: false, backend: false };

/* ── Carte appareil ── */
const DeviceCard = ({ device }) => {
  const isMaster = device.role === "MASTER";
  const isOnline = device.status === "ONLINE";

  return (
    <div
      className={`bg-white rounded-xl border transition-all duration-300 hover:shadow-md overflow-hidden
      ${isMaster ? "border-blue-200 ring-1 ring-blue-50" : "border-slate-200"}`}
    >
      {/* En-tête de carte épurée */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex flex-col">
          <span className="font-bold text-slate-800 text-base">
            {device.name}
          </span>
          <span className="text-sm text-slate-600 font-mono mt-0.5">
            {device.mac}
          </span>
        </div>
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-bold uppercase tracking-wider
          ${
            isOnline
              ? "bg-green-100 text-green-700 border border-green-200"
              : "bg-red-100 text-red-700 border border-red-200"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`}
          />
          {isOnline ? "En ligne" : "Hors ligne"}
        </div>
      </div>

      {/* Corps */}
      <div className="p-5">
        {/* Label et puissance principale */}
        <p className="text-sm text-slate-600 uppercase tracking-widest font-semibold mb-1">
          Puissance Active
        </p>
        <div className="flex items-baseline gap-1 mb-5">
          <span
            className={`text-5xl font-extrabold tracking-tight ${isMaster ? "text-blue-600" : "text-slate-800"}`}
          >
            {(device.power || 0).toFixed(0)}
          </span>
          <span className="text-lg font-bold text-slate-600">W</span>
        </div>

        {/* Métriques secondaires */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            {
              label: "Tension",
              value: `${(device.voltage || 0).toFixed(1)} V`,
            },
            {
              label: "Courant",
              value: `${(device.current || 0).toFixed(2)} A`,
            },
            {
              label: "Facteur de Puiss.",
              value: (device.power_factor || 0).toFixed(2),
            },
            {
              label: "Fréquence",
              value: `${(device.frequency_hz || 0).toFixed(1)} Hz`,
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2"
            >
              <p className="text-sm text-slate-600 uppercase tracking-wider font-semibold">
                {label}
              </p>
              <p className="font-bold text-slate-700 text-base mt-0.5">
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* Énergie cumulée */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span className="flex items-center gap-1 font-medium text-slate-600">
            <Zap className="w-3.5 h-3.5 text-yellow-500" /> Énergie cumulée
          </span>
          <span className="font-bold text-slate-700">
            {(device.kwh_total || 0).toFixed(3)} kWh
          </span>
        </div>
      </div>
    </div>
  );
};

/* ── Composant principal ── */
export default function Dashboard() {
  const { telemetry, isConnected } = useTelemetryStore();
  const sysStatus = telemetry.system_status || DEFAULT_SYS_STATUS;
  const allDevices = [telemetry.master, ...telemetry.nodes];
  const isMasterOnline = telemetry.master.status === "ONLINE";

  const auditData = useMemo(
    () => [
      {
        name: "Nœuds surveillés",
        value: telemetry.nodes.reduce((acc, n) => acc + (n.power || 0), 0),
        color: "#22c55e", // vert propre
      },
      {
        name: "Charge non identifiée",
        value: Math.max(0, telemetry.audit.unknown_w),
        color: "#ef4444", // rouge propre
      },
    ],
    [telemetry],
  );

  const systemStates = useMemo(() => {
    if (!isConnected) {
      return [
        {
          label: "Compteur Principal",
          status: "unknown",
          text: "Inconnu",
          icon: Cpu,
        },
        {
          label: "Broker MQTT",
          status: "unknown",
          text: "Inconnu",
          icon: Network,
        },
        {
          label: "Serveur Backend",
          status: "unknown",
          text: "Inconnu",
          icon: Layers,
        },
        {
          label: "Base de données",
          status: "unknown",
          text: "Inconnu",
          icon: Database,
        },
      ];
    }

    return [
      {
        label: "Compteur Principal",
        status: isMasterOnline ? "online" : "offline",
        text: isMasterOnline ? "Opérationnel" : "Hors ligne",
        icon: Cpu,
      },
      {
        label: "Broker MQTT",
        status: sysStatus.mqtt ? "online" : "offline",
        text: sysStatus.mqtt ? "Opérationnel" : "Hors ligne",
        icon: Network,
      },
      {
        label: "Serveur Backend",
        status: "online",
        text: "Opérationnel",
        icon: Layers,
      },
      {
        label: "Base de données",
        status: sysStatus.db ? "online" : "offline",
        text: sysStatus.db ? "Opérationnel" : "Hors ligne",
        icon: Database,
      },
    ];
  }, [isConnected, isMasterOnline, sysStatus]);

  if (!telemetry.timestamp) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3 text-slate-600">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium">
          Synchronisation des flux temps réel…
        </p>
      </div>
    );
  }

  const getStatusClasses = (status) => {
    if (status === "online")
      return "bg-green-100 text-green-800 border-green-300";
    if (status === "offline") return "bg-red-100 text-red-700 border-red-300";
    return "bg-slate-100 text-slate-600 border-slate-300";
  };

  const getIndicatorDot = (status) => {
    if (status === "online") return "bg-green-500";
    if (status === "offline") return "bg-red-500";
    return "bg-slate-300";
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      {/* ── BARRE D'ÉTAT DES INFRASTRUCTURES ── */}
      <section className="bg-white rounded-lg border-2 border-slate-200 shadow-sm p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        {systemStates.map((sys, idx) => {
          const Icon = sys.icon;
          return (
            <div
              key={idx}
              className="flex items-center gap-3 px-4 py-3 bg-slate-50/50 rounded border border-slate-200"
            >
              <div
                className={`p-2 rounded border ${getStatusClasses(sys.status)}`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-slate-600 font-bold uppercase tracking-wider font-sans">
                  {sys.label}
                </span>
                <span className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={`h-3.5 w-3.5 rounded-full ${getIndicatorDot(sys.status)}`}
                  />
                  <span className="text-base font-bold text-slate-900 font-sans">
                    {sys.text}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── INDICATEURS ARRIVÉE GÉNÉRALE (Tension / Puissance / Intensité) ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
            Arrivée Générale — Compteur Principal
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              label: "Tension",
              value: (telemetry.master.voltage || 0).toFixed(1),
              unit: "V",
            },
            {
              label: "Puissance Active",
              value: (telemetry.master.power || 0).toFixed(0),
              unit: "W",
            },
            {
              label: "Intensité",
              value: (telemetry.master.current || 0).toFixed(2),
              unit: "A",
            },
          ].map(({ label, value, unit }) => (
            <div
              key={label}
              className="bg-white rounded-xl border-2 border-slate-200 shadow-sm px-6 py-5 flex flex-col items-center text-center"
            >
              <p className="text-sm text-slate-600 uppercase tracking-widest font-bold mb-2">
                {label}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-5xl font-extrabold text-[#1a2e4a] tracking-tight tabular-nums">
                  {value}
                </span>
                <span className="text-2xl font-bold text-slate-600">
                  {unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 1 : RELEVÉS INDIVIDUELS ── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">
            Mesures Métrologiques Actives
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {allDevices.map((device) => (
            <DeviceCard key={device.mac} device={device} />
          ))}
        </div>
      </section>

      {/* ── SECTION 2 : AUDIT DIFFÉRENTIEL ── */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-700">
                Comprendre l'Audit Différentiel
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Le système compare en permanence la puissance appelée à l'arrivée
              générale de la maison (Master) et la somme des puissances
              consommées par vos prises intelligentes (Nodes). La différence
              révèle la part de <strong>puissance non identifiée</strong>{" "}
              (fuites, veilles d'appareils ou charges non surveillées).
            </p>
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg text-xs font-mono text-slate-600">
              <span className="text-blue-600">P_Inconnue</span> = P_Master (
              {telemetry.master.power.toFixed(0)} W) - Σ P_Nodes (
              {telemetry.nodes
                .reduce((acc, n) => acc + (n.power || 0), 0)
                .toFixed(0)}{" "}
              W)
              <br />
              <span className="text-red-500 font-bold">
                P_Inconnue = {Math.max(0, telemetry.audit.unknown_w).toFixed(0)}{" "}
                W
              </span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-sm text-slate-600">
            <Zap className="w-3.5 h-3.5 text-yellow-500" /> Idéal pour repérer
            instantanément un oubli d'éclairage ou un court-circuit.
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700">
              Répartition des charges
            </span>
            <span className="text-sm text-slate-600 font-semibold uppercase">
              Bilan instantané
            </span>
          </div>

          <div className="h-56 my-3">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={auditData}
                  innerRadius={68}
                  outerRadius={95}
                  paddingAngle={5}
                  dataKey="value"
                  cornerRadius={4}
                >
                  {auditData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    fontSize: "15px",
                  }}
                  formatter={(v) => [`${Math.round(v)} W`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Légende */}
          <div className="space-y-2">
            {auditData.map((item) => (
              <div
                key={item.name}
                className="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-lg border border-slate-100 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-slate-500 text-sm">
                    {item.name}
                  </span>
                </div>
                <span className="font-extrabold text-slate-800">
                  {item.value.toFixed(0)} W
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
