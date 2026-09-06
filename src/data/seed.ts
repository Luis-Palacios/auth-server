import { db } from './database.js';
import { user } from './schemas/auth-schema.js';


async function main() {
  // TODO: Insert some sort of super admin user
  const superAdmin: typeof user.$inferInsert = {
    id: 'superadmin',
    name: 'Super Admin',
    email: 'superadmin@example.com',
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.insert(user).values(superAdmin);


}

main().catch(console.error);