import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  role: text('role').notNull().default('coach'),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
})

export const accountSettings = sqliteTable('account_settings', {
  key: text('key').primaryKey(),
})

export const accountPasswords = sqliteTable('account_passwords', {
  accountId: text('account_id').primaryKey().references(() => accounts.id),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
})

export const accountSessions = sqliteTable('account_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id').notNull().references(() => accounts.id),
  expiresAt: integer('expires_at').notNull(),
}, table => [index('idx_account_sessions_account').on(table.accountId)])

export const accountInvites = sqliteTable('account_invites', {
  tokenHash: text('token_hash').primaryKey(),
  accountId: text('account_id').notNull().unique().references(() => accounts.id),
  expiresAt: integer('expires_at').notNull(),
})

export const authAttempts = sqliteTable('auth_attempts', {
  key: text('key').primaryKey(),
  attempts: integer('attempts').notNull(),
  expiresAt: integer('expires_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  isSeed: integer('is_seed').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_sessions_updated_at').on(table.updatedAt),
])

export const sessionBootstrap = sqliteTable('session_bootstrap', {
  key: text('key').primaryKey(),
  completedAt: text('completed_at').notNull(),
})

export const customGames = sqliteTable('custom_games', {
  id: text('id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_custom_games_updated_at').on(table.updatedAt),
])

export const deletedSeedGames = sqliteTable('deleted_seed_games', {
  id: text('id').primaryKey(),
  deletedAt: text('deleted_at').notNull(),
})

export const customCategories = sqliteTable('custom_categories', {
  id: text('id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_custom_categories_updated_at').on(table.updatedAt),
])

export const gameDrafts = sqliteTable('game_drafts', {
  id: text('id').primaryKey(),
  sourceGameId: text('source_game_id'),
  payloadJson: text('payload_json').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_game_drafts_updated_at').on(table.updatedAt),
  uniqueIndex('uq_game_drafts_source_game').on(table.sourceGameId).where(sql`${table.sourceGameId} is not null`),
])

export const sessionDrafts = sqliteTable('session_drafts', {
  id: text('id').primaryKey(),
  payloadJson: text('payload_json').notNull(),
  revision: integer('revision').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('idx_session_drafts_updated_at').on(table.updatedAt),
])
