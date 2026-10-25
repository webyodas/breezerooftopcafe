/**
 * Breeze Progressive Web App (PWA) Client Controller
 * Manages service worker lifecycle, automatic update checks,
 * and 1-click home screen install prompts across Android, iOS, and Desktop.
 */

(function () {
  'use strict';

  let deferredInstallPrompt = null;
  let swRegistration = null;

  // 1. REGISTER SERVICE WORKER WITH AUTO-UPDATE CHECKING
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((registration) => {
          swRegistration = registration;
          console.log('[Breeze PWA] Service Worker registered. Scope:', registration.scope);

          // Check for service worker updates periodically (every 60 seconds)
          setInterval(() => {
            if (registration && typeof registration.update === 'function') {
              registration.update().catch(() => {});
            }
          }, 60000);

          // Check for updates when user returns to or focuses the app tab
          window.addEventListener('focus', () => {
            if (registration && typeof registration.update === 'function') {
              registration.update().catch(() => {});
            }
          });
        })
        .catch((err) => {
          console.warn('[Breeze PWA] Service Worker registration failed:', err);
        });

      // When a newly activated service worker takes control, refresh clients so latest changes appear immediately
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[Breeze PWA] New version activated, refreshing to load latest updates...');
          window.location.reload();
        }
      });
    });
  }

  // 2. DETECT STANDALONE RUNTIME
  function isRunningStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  // 3. LISTEN FOR ANDROID & CHROME INSTALL PROMPTS
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default mini-infobar from appearing on mobile
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[Breeze PWA] Captured beforeinstallprompt event.');

    // Unhide install buttons on the page if not already installed
    if (!isRunningStandalone()) {
      showInstallTriggers();
    }
  });

  window.addEventListener('appinstalled', () => {
    console.log('[Breeze PWA] App installed successfully to home screen!');
    deferredInstallPrompt = null;
    hideInstallTriggers();
  });

  // 4. GLOBAL TRIGGER METHOD
  window.installBreezeApp = async function (portalName) {
    // If running in standalone mode already
    if (isRunningStandalone()) {
      alert('The Breeze ' + (portalName || '') + ' app is already installed and running in standalone mode! 🎉');
      return;
    }

    // Android / Desktop Chrome native prompt
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[Breeze PWA] User accepted the install prompt');
        hideInstallTriggers();
      } else {
        console.log('[Breeze PWA] User dismissed the install prompt');
      }
      deferredInstallPrompt = null;
      return;
    }

    // iOS Safari Detection & Guidance
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      showIOSInstallModal(portalName);
      return;
    }

    // Fallback for browsers that already installed or don't support beforeinstallprompt
    alert('To install the app, tap your browser menu (⋮) and select "Add to Home screen" or "Install App".');
  };

  function showInstallTriggers() {
    document.querySelectorAll('.btn-pwa-install').forEach(btn => {
      btn.style.display = 'inline-flex';
    });
  }

  function hideInstallTriggers() {
    document.querySelectorAll('.btn-pwa-install').forEach(btn => {
      btn.style.display = 'none';
    });
  }

  // 5. iOS MODAL PROMPT
  function showIOSInstallModal(portalName) {
    const existingModal = document.getElementById('breezeIosInstallModal');
    if (existingModal) {
      existingModal.style.display = 'flex';
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'breezeIosInstallModal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      z-index: 10000;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 16px;
    `;

    modal.innerHTML = `
      <div style="background: #ffffff; color: #1c1814; border-radius: 20px; max-width: 400px; width: 100%; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="/assets/pwa/icon-192.png" alt="Breeze" style="width: 38px; height: 38px; border-radius: 9px; object-fit: cover;">
            <strong style="font-size: 1.1rem; color: #0f172a;">Install Breeze ${portalName || 'App'}</strong>
          </div>
          <button type="button" id="btnCloseIosModal" style="background: none; border: none; font-size: 1.4rem; color: #64748b; cursor: pointer; padding: 4px;">&times;</button>
        </div>
        <p style="font-size: 0.9rem; color: #475569; line-height: 1.5; margin-bottom: 20px;">
          Install this web app to your iPhone or iPad home screen for instant full-screen access:
        </p>
        <div style="display: flex; flex-direction: column; gap: 12px; font-size: 0.9rem; color: #1e293b; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="background: #e2e8f0; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">1</span>
            <span>Tap the <strong>Share</strong> button <span style="font-size: 1.1rem;">⎋</span> at bottom of Safari.</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="background: #e2e8f0; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">2</span>
            <span>Scroll down &amp; tap <strong>Add to Home Screen ⊞</strong>.</span>
          </div>
        </div>
        <button type="button" id="btnDismissIosModal" style="width: 100%; margin-top: 18px; padding: 12px; background: #0f172a; color: #ffffff; border: none; border-radius: 10px; font-weight: 700; cursor: pointer;">
          Got It
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const closeFn = () => { modal.style.display = 'none'; };
    document.getElementById('btnCloseIosModal').addEventListener('click', closeFn);
    document.getElementById('btnDismissIosModal').addEventListener('click', closeFn);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeFn(); });
  }

  // 6. AUTO-ATTACH TO ANY .btn-pwa-install ELEMENT
  document.addEventListener('DOMContentLoaded', () => {
    // If standalone, hide all install buttons
    if (isRunningStandalone()) {
      hideInstallTriggers();
    }

    document.querySelectorAll('.btn-pwa-install').forEach(btn => {
      btn.addEventListener('click', () => {
        const portal = btn.dataset.portal || '';
        window.installBreezeApp(portal);
      });
    });
  });
})();
