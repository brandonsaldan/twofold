import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:4323', browserName: 'chromium' },
  webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4323', url: 'http://127.0.0.1:4323', reuseExistingServer: false }
})
