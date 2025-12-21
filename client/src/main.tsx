// client/src/main.tsx
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' // ✅ Add this
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter> {/* ✅ Wrap everything here */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
)
