// client/src/main.tsx
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// ✅ Import the Error Boundary
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  // ✅ Wrap the entire App
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
