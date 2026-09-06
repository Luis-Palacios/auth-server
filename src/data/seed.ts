import { db } from './database.js';
import { personTable } from './schema.js';

async function main() {
  const person: typeof personTable.$inferInsert = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
  };

  await db.insert(personTable).values(person);
}

main().catch(console.error);