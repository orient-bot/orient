import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/sqlite/index.ts',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_DATABASE || './data/orient.db',
  },
});
