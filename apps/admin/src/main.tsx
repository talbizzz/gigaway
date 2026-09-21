// latin + latin-ext only (covers German diacritics — this project's members
// are Munich-based) rather than the default import, which pulls in every
// script @fontsource ships a subset for (cyrillic, greek, vietnamese, math…)
// and nearly quadruples the font payload for scripts this app never shows.
import '@fontsource/lora/latin-600.css'
import '@fontsource/lora/latin-ext-600.css'
import '@fontsource/lora/latin-700.css'
import '@fontsource/lora/latin-ext-700.css'
import '@fontsource/ubuntu/latin-400.css'
import '@fontsource/ubuntu/latin-ext-400.css'
import '@fontsource/ubuntu/latin-500.css'
import '@fontsource/ubuntu/latin-ext-500.css'
import '@fontsource/ubuntu/latin-700.css'
import '@fontsource/ubuntu/latin-ext-700.css'
import './theme/global.css'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/app'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
