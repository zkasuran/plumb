(function () {
  'use strict';
  var theme;
  try { theme = localStorage.getItem('lantern-theme'); } catch (_) { /* Storage is optional. */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('js');
})();
