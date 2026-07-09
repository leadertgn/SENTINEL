import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // host: true → écoute sur 0.0.0.0 : accessible depuis les téléphones du
    // jury sur le réseau WiFi local (http://<IP-du-PC>:5173).
    host: true,
    port: 5173,
  },
})
