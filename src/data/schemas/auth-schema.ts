import { defineRelationsPart } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
					id: text('id').primaryKey(),
					name: text('name').notNull(),
 email: text('email').notNull().unique(),
 emailVerified: boolean('email_verified').default(false).notNull(),
 image: text('image'),
 createdAt: timestamp('created_at').defaultNow().notNull(),
 updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
 role: text('role'),
 banned: boolean('banned').default(false),
 banReason: text('ban_reason'),
 banExpires: timestamp('ban_expires')
					});

export const session = pgTable("session", {
					id: text('id').primaryKey(),
					expiresAt: timestamp('expires_at').notNull(),
 token: text('token').notNull().unique(),
 createdAt: timestamp('created_at').defaultNow().notNull(),
 updatedAt: timestamp('updated_at').$onUpdate(() => /* @__PURE__ */ new Date()).notNull(),
 ipAddress: text('ip_address'),
 userAgent: text('user_agent'),
 userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
 impersonatedBy: text('impersonated_by')
					}, (table) => [
  index("session_userId_idx").on(table.userId),
]);

export const account = pgTable("account", {
					id: text('id').primaryKey(),
					issuer: text('issuer').notNull(),
 accountId: text('account_id').notNull(),
 providerId: text('provider_id').notNull(),
 userId: text('user_id').notNull().references(()=> user.id, { onDelete: 'cascade' }),
 accessToken: text('access_token'),
 refreshToken: text('refresh_token'),
 idToken: text('id_token'),
 accessTokenExpiresAt: timestamp('access_token_expires_at'),
 refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
 scope: text('scope'),
 password: text('password'),
 createdAt: timestamp('created_at').defaultNow().notNull(),
 updatedAt: timestamp('updated_at').$onUpdate(() => /* @__PURE__ */ new Date()).notNull()
					}, (table) => [
  uniqueIndex("account_issuer_accountId_uidx").on(table.issuer, table.accountId),
  index("account_userId_idx").on(table.userId),
]);

export const verification = pgTable("verification", {
					id: text('id').primaryKey(),
					identifier: text('identifier').notNull(),
 value: text('value').notNull(),
 expiresAt: timestamp('expires_at').notNull(),
 createdAt: timestamp('created_at').defaultNow().notNull(),
 updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => /* @__PURE__ */ new Date()).notNull()
					}, (table) => [
  index("verification_identifier_idx").on(table.identifier),
]);

export const invite = pgTable("invite", {
					id: text('id').primaryKey(),
					token: text('token').unique(),
 createdAt: timestamp('created_at'),
 expiresAt: timestamp('expires_at').notNull(),
 maxUses: integer('max_uses').notNull(),
 infinityMaxUses: boolean('infinity_max_uses').default(false).notNull(),
 createdByUserId: text('created_by_user_id').references(()=> user.id, { onDelete: 'set null' }),
 redirectToAfterUpgrade: text('redirect_to_after_upgrade'),
 shareInviterName: boolean('share_inviter_name').notNull(),
 email: text('email'),
 emails: text('emails').array(),
 role: text('role').notNull(),
 newAccount: boolean('new_account'),
 status: text('status', { enum: ['pending', 'rejected', 'canceled', 'used'] }).notNull()
					});

export const inviteUse = pgTable("invite_use", {
					id: text('id').primaryKey(),
					inviteId: text('invite_id').notNull().references(()=> invite.id, { onDelete: 'set null' }),
 usedAt: timestamp('used_at').notNull(),
 usedByUserId: text('used_by_user_id').references(()=> user.id, { onDelete: 'set null' })
					});

export const jwks = pgTable("jwks", {
					id: text('id').primaryKey(),
					publicKey: text('public_key').notNull(),
 privateKey: text('private_key').notNull(),
 createdAt: timestamp('created_at').notNull(),
 expiresAt: timestamp('expires_at'),
 alg: text('alg'),
 crv: text('crv')
					});


export const authRelations = defineRelationsPart({ user, session, account, verification, invite, inviteUse, jwks }, (r) => ({
  user: {
    sessions: r.many.session({
      from: r.user.id,
      to: r.session.userId,
    }),
    accounts: r.many.account({
      from: r.user.id,
      to: r.account.userId,
    }),
    invites: r.many.invite({
      from: r.user.id,
      to: r.invite.createdByUserId,
    }),
    inviteUses: r.many.inviteUse({
      from: r.user.id,
      to: r.inviteUse.usedByUserId,
    })
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    })
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    })
  },
  invite: {
    user: r.one.user({
      from: r.invite.createdByUserId,
      to: r.user.id,
    }),
    inviteUses: r.many.inviteUse({
      from: r.invite.id,
      to: r.inviteUse.inviteId,
    })
  },
  inviteUse: {
    invite: r.one.invite({
      from: r.inviteUse.inviteId,
      to: r.invite.id,
    }),
    user: r.one.user({
      from: r.inviteUse.usedByUserId,
      to: r.user.id,
    })
  }
}));
