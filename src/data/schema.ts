import { pgTable, serial, text } from 'drizzle-orm/pg-core';

export const personTable = pgTable('person', {
  id: serial('id').primaryKey(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text('email').notNull().unique(),
});