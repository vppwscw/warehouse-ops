// Tiny redirect for old links: <script src="js/redirect.js" data-to="erp"> (CSP allows no inline script).
(function(){
  var s = document.currentScript;
  var to = s && s.getAttribute('data-to');
  if (to) location.replace(to);
})();
