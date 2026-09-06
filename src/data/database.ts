import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { personTable } from './schema.js';

const db = drizzle(process.env.DATABASE_URL!);

async function main() {
  const person: typeof personTable.$inferInsert = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
  };

  await db.insert(personTable).values(person);
}

main().catch(console.error);