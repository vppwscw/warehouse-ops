// Runs in <head> before first paint (no flash). Sets html.sb-rail from the saved
// choice (localStorage 'wo.sidebar': 'rail' | 'full') or forced <=960px.
(function(){
  var h = document.documentElement, mq = window.matchMedia('(max-width:960px)');
  function pref(){ try{ return localStorage.getItem('wo.sidebar'); }catch(e){ return null; } }
  function apply(){ h.classList.toggle('sb-rail', pref()==='rail' || mq.matches); }
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
})();
