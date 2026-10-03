import './styles/main.css';
import { App } from './components/app';

const root = document.getElementById('app');
if (root) {
  const app = new App(root);
  app.start().catch((err) => {
    console.error('[app] fatal startup error:', err);
    const fallback = document.createElement('p');
    fallback.className = 'fatal';
    fallback.textContent = 'PULSE no pudo iniciarse. Revisa la consola para más detalles.';
    root.appendChild(fallback);
  });
  window.addEventListener('beforeunload', () => app.destroy());
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA is an enhancement; the application remains fully usable without it.
    });
  });
}
