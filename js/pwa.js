// Service worker registration and the in-app update toast. A new version waits
// until the user taps "Reload"; only then does it take over and the page reload.

export function registerServiceWorker({ toast, onPlanUpdated }) {
  if (!('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let accepted = false;

  sw.addEventListener('controllerchange', () => {
    if (accepted) location.reload();
  });
  sw.addEventListener('message', (event) => {
    if (event.data?.type === 'plan-updated') onPlanUpdated?.();
  });

  const offer = (worker) =>
    toast.show('A new version is ready.', {
      id: 'update',
      action: 'Reload',
      duration: Infinity,
      onAction: () => {
        accepted = true;
        worker.postMessage({ type: 'skip-waiting' });
      },
    });

  const register = async () => {
    try {
      const registration = await sw.register('./sw.js');
      if (registration.waiting && sw.controller) offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && sw.controller) offer(worker);
        });
      });
      // Look for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      });
    } catch (error) {
      console.warn('Offline support is unavailable:', error);
    }
  };

  if (document.readyState === 'complete') register();
  else addEventListener('load', register, { once: true });
}
