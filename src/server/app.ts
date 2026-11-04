import express from 'express';
import dotenv from 'dotenv';
import gatewayV1Router from './routes/gateway-v1.ts';
import dashboardApiRouter from './routes/dashboard-api.ts';

dotenv.config();

export function createGatewayApp() {
  const app = express();

  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-api-key, anthropic-version, x-msroute-client, x-nexus-client'
    );
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use('/v1', gatewayV1Router);
  app.use('/api', dashboardApiRouter);

  return app;
}

const app = createGatewayApp();
export default app;
