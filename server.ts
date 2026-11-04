import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import gatewayV1Router from './src/server/routes/gateway-v1.ts';
import dashboardApiRouter from './src/server/routes/dashboard-api.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Request parsing & CORS headers
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // CORS support for Claude Code and external AI clients
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version, x-nexus-client');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Mount API Gateway V1 endpoints (Claude Code & OpenAI compatible)
  app.use('/v1', gatewayV1Router);

  // Mount Dashboard Management APIs
  app.use('/api', dashboardApiRouter);

  // Frontend Serving: Vite Middleware in Dev, Static in Prod
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
    console.log(`🚀 NexusGate AI Gateway running on http://0.0.0.0:${PORT}`);
    console.log(`📡 Anthropic Messages Endpoint: http://localhost:${PORT}/v1/messages`);
    console.log(`🤖 OpenAI Chat Endpoint: http://localhost:${PORT}/v1/chat/completions`);
    console.log(`📊 Dashboard Management UI: http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
  process.exit(1);
});
