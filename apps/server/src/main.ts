import { buildApp } from './app.js';

const { app, config } = await buildApp();
await app.listen({ port: config.port, host: config.host });
app.log.info(
  {
    providerConfigured: config.providerConfigured,
    provider: config.inferenceProvider,
    model: config.providerConfigured ? config.model : null,
    providerBlocker: config.providerBlocker ?? null,
    demoMode: config.demoMode,
    port: config.port,
  },
  'proofroute listening',
);
