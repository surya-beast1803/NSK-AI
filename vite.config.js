import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { createConvaiHandler } from './server/convaiHandler.js';

// Mounts the same server-side Convai proxy into the dev server, so
// `npm run dev` works on its own. Env vars here are not exposed to the client
// (only VITE_-prefixed vars are), so the API key stays on the server.
function convaiProxy(env) {
  const handler = createConvaiHandler(env);
  const mount = (server) => {
    server.middlewares.use((req, res, next) => {
      handler(req, res, next).catch(next);
    });
  };
  return { name: 'convai-proxy', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // `npm run dev:https` serves over HTTPS with a self-signed certificate, so
  // phones on the same Wi-Fi are allowed to use the microphone.
  const https = mode === 'https';
  return {
    plugins: [react(), convaiProxy(env), https && basicSsl()].filter(Boolean),
    server: { host: true },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('node_modules/@react-three') || id.includes('node_modules/postprocessing')) return 'r3f';
          },
        },
      },
    },
  };
});
