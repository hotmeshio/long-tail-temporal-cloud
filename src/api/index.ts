import { start } from '@hotmeshio/long-tail';
import { temporalProvider } from '@hotmeshio/long-tail-temporal/provider';

import { roles } from '../config/roles';
import { workers } from '../config/workers';
import { consoleUrl, type AppConfig } from '../modules/config';

/** Long Tail's API and dashboard, with Temporal as the durable engine. */
export async function startApi(config: AppConfig) {
  // 1. Temporal provider: delivers outcomes, lists and starts workflows
  const provider = temporalProvider({
    address: config.temporal.address,
    namespace: config.temporal.namespace,
    apiKey: config.temporal.apiKey,
  });

  // 2. Long Tail
  const { database } = config;
  return start({
    database: database.connectionString ? { connectionString: database.connectionString } : {
      host: database.host, port: database.port, user: database.user, password: database.password, database: database.database,
    },
    server: { port: config.port },
    ...(config.jwtSecret ? { auth: { secret: config.jwtSecret } } : {}),
    ...(config.admin.password ? { seed: { admin: {
      externalId: config.admin.user, email: config.admin.email, password: config.admin.password,
    } } } : {}),
    ...(config.nats ? { events: { nats: config.nats } } : {}),
    durable: { provider, consoleUrl: consoleUrl(config.temporal) },
    roles,
    workers,
  });
}
