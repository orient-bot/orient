import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://aibot:aibot123@localhost:5432/whatsapp_bot_0',
  },
  verbose: true,
  strict: true,
});
