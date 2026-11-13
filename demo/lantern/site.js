(function () {
  'use strict';

  // All pages use the same chrome, including the static host's missing-page view.
  document.querySelector('.site-header').innerHTML = `
    <div class="container header-inner">
      <a class="brand" href="/index.html" aria-label="Lantern home"><img src="/assets/lantern.svg" alt="" width="31" height="39">lantern</a>
      <nav class="primary-nav" id="primary-nav" aria-label="Main navigation">
        <div class="nav-item"><a class="nav-link" href="/index.html">Home</a></div>
        <div class="nav-item" data-open="false">
          <a class="nav-link" href="/browse.html">Browse tools</a>
          <button class="submenu-toggle" type="button" aria-label="Tool categories" aria-haspopup="menu" aria-expanded="false" aria-controls="tools-menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
          <div class="submenu" id="tools-menu" role="menu" aria-label="Tool categories">
            <a role="menuitem" href="/browse.html?category=DIY">DIY &amp; home repair<small>Make that little fix happen</small></a>
            <a role="menuitem" href="/browse.html?category=Garden">Garden &amp; outdoors<small>A helping hand for your green space</small></a>
            <a role="menuitem" href="/browse.html?category=Cleaning">Cleaning<small>Fresh starts without the big purchase</small></a>
            <a role="menuitem" href="/browse.html?category=Other">A bit of everything<small>Ladders, kits and useful extras</small></a>
          </div>
        </div>
        <div class="nav-item" data-open="false">
          <a class="nav-link" href="/how-it-works.html">How it works</a>
          <button class="submenu-toggle" type="button" aria-label="How Lantern works" aria-haspopup="menu" aria-expanded="false" aria-controls="about-menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
          <div class="submenu" id="about-menu" role="menu" aria-label="How Lantern works">
            <a role="menuitem" href="/how-it-works.html#borrowing">Borrow a little<small>Your next project in three steps</small></a>
            <a role="menuitem" href="/how-it-works.html#lending">Lend a little<small>Put your idle tools to good use</small></a>
            <a role="menuitem" href="/how-it-works.html#faq">Good questions<small>The practical things to know</small></a>
          </div>
        </div>
        <a class="button mobile-lend" href="/lend.html" hidden>Lend a tool <span aria-hidden="true">↗</span></a>
      </nav>
      <div class="header-actions">
        <button class="icon-button theme-toggle js-only" type="button" aria-label="Switch to dark mode" aria-pressed="false"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg></button>
        <a class="button small" href="/lend.html">Lend a tool <span aria-hidden="true">↗</span></a>
        <button class="icon-button mobile-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="primary-nav"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      </div>
    </div>`;
  document.querySelector('.site-footer').innerHTML = `<div class="container"><div class="footer-top"><div class="footer-brand"><a class="brand" href="/index.html"><img src="/assets/lantern.svg" alt="" width="25" height="32">lantern</a><p>Good tools. Great neighbours. A little more community.</p></div><nav class="footer-links" aria-label="Footer navigation"><a href="/browse.html">Browse tools</a><a href="/how-it-works.html">How it works</a><a href="/lend.html">Lend a tool</a><a href="/how-it-works.html#faq">FAQs</a></nav></div><div class="footer-bottom"><span>© 2026 Lantern. Made for the neighbourhood.</span><span>A little sharing goes a long way. <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 21C6 17 3 13 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 4-3 8-9 12Z"/></svg></span></div></div>`;
  document.querySelectorAll('.nav-link').forEach(function (link) {
    if (link.pathname === window.location.pathname || (link.pathname === '/index.html' && window.location.pathname === '/')) {
      link.setAttribute('aria-current', 'page');
    }
  });

  var nav = document.querySelector('.primary-nav');
  var items = Array.from(nav.querySelectorAll('.nav-item[data-open]'));
  var mobileToggle = document.querySelector('.mobile-toggle');
  function setOpen(item, open) {
    item.dataset.open = String(open);
    item.querySelector('.submenu-toggle').setAttribute('aria-expanded', String(open));
  }
  function closeMenus() { items.forEach(function (item) { setOpen(item, false); }); }
  function openMenu(item) { closeMenus(); setOpen(item, true); }
  function closeNavigation() {
    closeMenus();
    nav.dataset.mobileOpen = 'false';
    mobileToggle.setAttribute('aria-expanded', 'false');
    mobileToggle.setAttribute('aria-label', 'Open navigation');
  }
  items.forEach(function (item) {
    var toggle = item.querySelector('.submenu-toggle');
    item.addEventListener('pointerenter', function (event) {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') openMenu(item);
    });
    item.addEventListener('pointerleave', function (event) {
      if (event.pointerType !== 'touch' && !item.contains(document.activeElement)) setOpen(item, false);
    });
    item.addEventListener('focusin', function () { openMenu(item); });
    item.addEventListener('focusout', function (event) {
      if (!item.contains(event.relatedTarget)) setOpen(item, false);
    });
    // Remember the state before pointer focus opens the menu, so the first tap opens it.
    var openOnPointerDown = false;
    toggle.addEventListener('pointerdown', function () { openOnPointerDown = item.dataset.open === 'true'; });
    toggle.addEventListener('click', function (event) {
      var open = event.detail ? openOnPointerDown : item.dataset.open === 'true';
      closeMenus();
      setOpen(item, !open);
    });
    item.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        toggle.focus();
        closeMenus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        openMenu(item);
        var links = Array.from(item.querySelectorAll('.submenu a'));
        var index = links.indexOf(document.activeElement);
        var next = event.key === 'ArrowDown' ? (index + 1) % links.length : (index < 0 ? links.length - 1 : (index + links.length - 1) % links.length);
        links[next].focus();
      }
    });
  });
  mobileToggle.addEventListener('click', function () {
    var open = nav.dataset.mobileOpen !== 'true';
    closeMenus();
    nav.dataset.mobileOpen = String(open);
    mobileToggle.setAttribute('aria-expanded', String(open));
    mobileToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  document.addEventListener('click', function (event) {
    if (!nav.contains(event.target) && !mobileToggle.contains(event.target)) closeNavigation();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      if (nav.dataset.mobileOpen === 'true') mobileToggle.focus();
      closeNavigation();
    }
  });
  nav.addEventListener('click', function (event) { if (event.target.closest('a')) closeNavigation(); });
})();
