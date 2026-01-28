import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './dist/schema/sqlite/index.js',
  out: './drizzle/sqlite',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_DATABASE || './data/orient.db',
  },
});
