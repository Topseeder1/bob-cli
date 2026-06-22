// File: tsup.config.ts

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['bin/bob.ts'],
  format: ['esm'],
  outDir: 'dist',
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      'process.env.FIREBASE_API_KEY': '"AIzaSyB-hUZEonRIzbExVDwuneJaDjJZBvHdIps"',
      'process.env.FUNCTIONS_BASE': '"https://us-central1-seedlingapp.cloudfunctions.net"',
    };
  },
});