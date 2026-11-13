(function () {
  'use strict';
  var theme;
  try { theme = localStorage.getItem('lantern-theme'); } catch (_) { /* Storage is optional. */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.add('js');
  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;
    function updateToggle() {
      var dark = document.documentElement.dataset.theme === 'dark';
      toggle.setAttribute('aria-pressed', String(dark));
      toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      document.querySelector('meta[name="theme-color"]').content = dark ? '#18251e' : '#f8f7ef';
    }
    toggle.addEventListener('click', function () {
      theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('lantern-theme', theme); } catch (_) { /* Storage is optional. */ }
      updateToggle();
    });
    updateToggle();
  });
})();
