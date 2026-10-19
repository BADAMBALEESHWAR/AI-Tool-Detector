import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#ffffff',
            color: '#231f20',
            border: '1px solid #e2e2e6',
            borderLeft: '4px solid #d2232a',
            borderRadius: '8px',
            fontSize: '13px',
            boxShadow: '0 8px 24px rgba(35, 31, 32, 0.12)',
          },
          success: { iconTheme: { primary: '#059669', secondary: '#fff' } },
          error: { iconTheme: { primary: '#d2232a', secondary: '#fff' } },
        }}
      />
    </BrowserRouter>
  </StrictMode>
);
