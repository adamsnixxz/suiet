import { defineManifest } from '@crxjs/vite-plugin';
import { version } from './package-json';

export default defineManifest((env) => ({
  manifest_version: 3,
  name: 'Suiet',
  description: 'The wallet for everyone, built on Sui blockchain',
  version,
  version_name: version,
  icons: {
    '128': 'logo.png',
  },
  action: { default_popup: 'index.html' },
  permissions: ['storage', 'tabs'],
  background: {
    service_worker: 'src/scripts/background/index.ts',
  },
  // TODO: add them after finishing tests
  // content_scripts: [
  //   {
  //     matches: ['http://*/*', 'https://*/*'],
  //     js: ['src/scripts/content/index.ts'],
  //     run_at: 'document_start',
  //   },
  // ],
  // web_accessible_resources: [
  //   {
  //     resources: ['dapp-api.js'],
  //     matches: ['http://*/*', 'https://*/*'],
  //   },
  // ],
  host_permissions: ['http://localhost:*/*', 'http://127.0.0.1:*/*'],
}));