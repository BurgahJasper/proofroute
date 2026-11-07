import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { loadCatalog, loadScenarios } from './catalog.js';
import { openDatabase, purgeExpired, resolveDatabasePath } from './db.js';
import { assertSessionSecret, loadConfig, type AppConfig } from './env.js';
import { repoRoot, webDist } from './paths.js';
import { registerApi } from './routes.js';

export interface BuildOptions {
  config?: Partial<AppConfig>;
  silent?: boolean;
}

export async function buildApp(options: BuildOptions = {}) {
  const config = loadConfig(options.config);
  assertSessionSecret(config);
  const databasePath = resolveDatabasePath(repoRoot, config.databasePath);
  const store = openDatabase(databasePath);
  const catalog = loadCatalog(repoRoot);
  const scenarios = loadScenarios(repoRoot);
  const app = Fastify({
    logger: options.silent ? false : { level: config.production ? 'info' : 'warn', redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'] },
    bodyLimit: 64 * 1024,
    trustProxy: true,
  });
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: config.production
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,
  });
  app.get('/healthz', async () => ({ ok: true }));
  registerApi(app, { store, config, catalog, scenarios, root: repoRoot });

  if (config.production && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/healthz')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
      }
      return reply.sendFile('index.html');
    });
  }

  const purge = setInterval(() => purgeExpired(store), 60 * 60 * 1000);
  purge.unref?.();
  app.addHook('onClose', async () => {
    clearInterval(purge);
    store.close();
  });

  return { app, store, config, catalog, scenarios };
}
