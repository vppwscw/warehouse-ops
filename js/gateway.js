(function(){
  var path = location.pathname;
  var page = /(?:\/|^)erp(?:\.html)?$/i.test(path) ? 'erp'
           : /(?:\/|^)app(?:\.html)?$/i.test(path) ? 'mobile' : null;
  var file = { erp: 'erp', mobile: 'app' };
  function store(k, v){ try { sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  window.gwSwitchTo = function(app){
    if (app !== 'erp' && app !== 'mobile') return;
    store('gw-app', app);
    location.replace(file[app] + '?app=' + app);
  };

  if (!page) return;  // login / stub pages: no routing here
  var m = /[?&]app=(erp|mobile)(?:&|#|$)/.exec(location.search + '&');
  if (m){ store('gw-app', m[1]); return; }
  var chosen = load('gw-app');
  if (chosen === page) return;

  var isPhone = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent) || window.innerWidth < 768;
  var want = isPhone ? 'mobile' : 'erp';
  if (want !== page) location.replace(file[want] + location.hash);
})();
