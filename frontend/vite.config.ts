import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Node's process, without needing @types/node.
const { env } = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process;
const usePolling = env.VITE_USE_POLLING === "true";

// https://vite.dev/config/
export default defineConfig({
  base: "/",
  plugins: [react()],
  preview: {
    port: 8080,
    strictPort: true,
  },
  server: {
    port: 8080,
    strictPort: true,
    host: true,
    origin: "http://localhost:8080",
    // File change events don't reach a container through a bind mount from
    // Windows or macOS, so the Docker setup polls for changes instead.
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
  },
});
