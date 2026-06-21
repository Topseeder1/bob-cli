// File: tsup.config.ts

import { defineConfig } from 'tsup';
import * as dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
  entry: ['bin/bob.ts'],
  format: ['esm'],
  outDir: 'dist',
  env: {
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY || '',
    FUNCTIONS_BASE: process.env.FUNCTIONS_BASE
      || 'https://us-central1-seedlingapp.cloudfunctions.net',
  },
});