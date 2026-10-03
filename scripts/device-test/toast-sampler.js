(() => {
  // sample which pills are on screen every 100 ms, then raise the "Add your name and a message" error through the Get help form
  window.__samples = [];
  const t0 = performance.now();
  const id = setInterval(() => {
    const pill = document.querySelector('.kx-refresh-pill'), tick = document.querySelector('.alert-ticker');
    const r = tick ? tick.getBoundingClientRect() : null;
    window.__samples.push({ t: Math.round(performance.now() - t0), pill: !!pill, ticker: !!tick, tickerText: tick ? tick.textContent.trim().slice(0, 50) : '' });
  }, 100);
  setTimeout(() => clearInterval(id), 14000);
  const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const name = document.querySelector('.support-input'), msg = document.querySelector('.support-textarea');
  if (!name || !msg) return 'help form not found (hash ' + location.hash + ')';
  set(name, ' '); set(msg, ' ');
  document.querySelector('.support-form-stack button[type=submit]').click();
  return 'submitted blank help form at t=0';
})()
