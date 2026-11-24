(function(){
  var page = /admin\.html$/i.test(location.pathname) ? 'erp' : 'mobile';
  var file = { erp: 'admin.html', mobile: 'index.html' };
  function store(k, v){ try { sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  window.gwSwitchTo = function(app){
    if (app !== 'erp' && app !== 'mobile') return;
    store('gw-app', app);
    location.replace(file[app] + '?app=' + app);
  };

  var m = /[?&]app=(erp|mobile)(?:&|#|$)/.exec(location.search + '&');
  if (m){ store('gw-app', m[1]); return; }
  var chosen = load('gw-app');
  if (chosen === page) return;

  var isPhone = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent) || window.innerWidth < 768;
  var want = isPhone ? 'mobile' : 'erp';
  if (want !== page) location.replace(file[want] + location.hash);
})();
