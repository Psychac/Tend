import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { AppProvider } from './app/providers/AppProvider';
import { router } from './app/router/router';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { UpdateBanner } from './app/UpdateBanner';
import { installGlobalErrorHandlers } from './shared/diagnostics';
import './index.css';

installGlobalErrorHandlers();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <AppErrorBoundary>
        <RouterProvider router={router} />
      </AppErrorBoundary>
    </AppProvider>
  </StrictMode>,
);

// The service worker caches the app so it starts with no network. A new version is offered, not forced.
const bannerHost = document.createElement('div');
document.body.append(bannerHost);
const bannerRoot = createRoot(bannerHost);
const updateSW = registerSW({
  onNeedRefresh() {
    bannerRoot.render(
      <UpdateBanner
        onReload={() => void updateSW(true)}
        onDismiss={() => bannerRoot.render(null)}
      />,
    );
  },
});
