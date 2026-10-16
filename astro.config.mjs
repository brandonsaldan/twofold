import { defineConfig } from 'astro/config'
import react from '@astrojs/react'

export default defineConfig({ site: 'https://twofold.brandonsaldan.com', output: 'static', integrations: [react()] })
