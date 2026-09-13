import { drizzle } from 'drizzle-orm/node-postgres';
import { config } from '../lib/config.js';

const db = drizzle(config.databaseUrl);

export { db };