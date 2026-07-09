// ================================================================
//  SENTINEL — Configuration des URLs API / WebSocket
// ================================================================
// Détection DYNAMIQUE de l'hôte : le navigateur (que ce soit le PC ou le
// téléphone d'un membre du jury) utilise la MÊME adresse que celle par
// laquelle il a chargé la page. Ainsi, si un téléphone ouvre
// http://192.168.1.42:5173, il parlera automatiquement au backend du PC
// sur http://192.168.1.42:8000 — sans configuration manuelle.
//
// Les variables d'environnement VITE_API_URL / VITE_WS_URL, si définies,
// forcent une adresse précise (utile en dev). Sinon → détection auto.
const host = (typeof window !== "undefined" && window.location.hostname)
  ? window.location.hostname
  : "127.0.0.1";

export const API_URL = import.meta.env.VITE_API_URL || `http://${host}:8000`;
export const WS_URL  = import.meta.env.VITE_WS_URL  || `ws://${host}:8000`;
