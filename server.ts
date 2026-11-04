import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGatewayApp } from './src/server/app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createGatewayApp();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MSRoute AI Gateway running on http://0.0.0.0:${PORT}`);
    console.log(`Anthropic Messages Endpoint: http://localhost:${PORT}/v1/messages`);
    console.log(`OpenAI Chat Endpoint: http://localhost:${PORT}/v1/chat/completions`);
    console.log(`Dashboard Management UI: http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
  process.exit(1);
});
