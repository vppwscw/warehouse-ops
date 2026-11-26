// Registers the service worker (CSP allows no inline script).
// Usage: <script src="js/pwa.js" data-sw="sw.js" defer></script>, data-sw relative to the page.
(function(){
  if (!('serviceWorker' in navigator)) return;
  var s = document.currentScript;
  var sw = (s && s.getAttribute('data-sw')) || 'sw.js';
  window.addEventListener('load', function(){
    navigator.serviceWorker.register(sw).catch(function(){});
  });
})();
