import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppRouter } from './app/router.js';
import { AuthProvider } from './core/auth/AuthProvider.js';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/shell.css';
import './styles/components.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </StrictMode>,
);
