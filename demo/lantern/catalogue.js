(function () {
  'use strict';
  var categories = { DIY: 'DIY & home repair', Garden: 'Garden & outdoors', Cleaning: 'Cleaning', Other: 'A bit of everything' };
  function readList(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw || raw.length > 100000) return [];
      var value = JSON.parse(raw);
      return Array.isArray(value) ? value.slice(0, 50) : [];
    } catch (_) { return []; }
  }
  function saveList(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value.slice(-50))); return true; }
    catch (_) { return false; }
  }
  function validTool(tool) {
    return tool && typeof tool === 'object' && /^local-[0-9]+$/.test(tool.id) && typeof categories[tool.category] === 'string' &&
      ['name', 'owner', 'area', 'notes', 'condition'].every(function (key) { return typeof tool[key] === 'string' && tool[key].length <= 500; }) &&
      Number.isInteger(tool.days) && tool.days >= 1 && tool.days <= 30;
  }
  var saved = readList('lantern-tools').filter(validTool);
  var lendForm = document.querySelector('#lend-form');
  if (lendForm) {
    lendForm.querySelector('button[type="submit"]').disabled = false;
    lendForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!lendForm.reportValidity()) return;
      var data = new FormData(lendForm);
      var tool = { id: 'local-' + Date.now(), category: data.get('category'), days: Number(data.get('days')) };
      ['name', 'owner', 'area', 'notes', 'condition'].forEach(function (key) { tool[key] = data.get(key).trim(); });
      var message = document.querySelector('#lend-message');
      message.hidden = false;
      if (!validTool(tool) || !tool.name || !tool.owner || !tool.area || !tool.notes) {
        message.textContent = 'Please fill in the tool details before adding it.';
        return;
      }
      if (saveList('lantern-tools', saved.concat(tool))) {
        window.location.href = '/browse.html?tool=' + encodeURIComponent(tool.id);
      } else {
        message.textContent = 'This browser could not save your listing. Free some storage or allow site storage and try again.';
      }
    });
  }

  var catalogue = document.querySelector('#catalogue');
  if (!catalogue) return;
  saved.forEach(function (tool) {
    var card = catalogue.querySelector('.tool-card').cloneNode(true);
    Object.keys(tool).forEach(function (key) { card.dataset[key] = tool[key]; });
    card.dataset.available = 'true';
    card.querySelectorAll('.tool-detail-link').forEach(function (link) {
      link.href = '/browse.html?tool=' + tool.id;
      if (link.classList.contains('tool-image')) link.setAttribute('aria-label', 'View ' + tool.name);
      else link.textContent = tool.name;
    });
    card.querySelector('img').src = '/assets/toolkit.svg';
    card.querySelector('img').alt = 'Home repair toolbox illustration';
    card.querySelector('.tool-category').textContent = categories[tool.category];
    card.querySelector('.tool-description').textContent = tool.notes;
    var owner = card.querySelector('.owner-name');
    owner.replaceChildren();
    var dot = document.createElement('span');
    dot.className = 'owner-dot';
    dot.setAttribute('aria-hidden', 'true');
    dot.textContent = tool.owner.charAt(0);
    owner.append(dot, document.createTextNode(tool.owner + ' · ' + tool.area));
    catalogue.appendChild(card);
  });
  var cards = Array.from(catalogue.querySelectorAll('.tool-card'));
  var search = document.querySelector('#tool-search');
  var available = document.querySelector('#available-only');
  var sort = document.querySelector('#tool-sort');
  var params = new URLSearchParams(window.location.search);
  var category = typeof categories[params.get('category')] === 'string' ? params.get('category') : 'All';
  search.value = (params.get('q') || '').slice(0, 80);
  document.querySelectorAll('.browse-search button, .filter-pill, #available-only, #tool-sort').forEach(function (control) { control.disabled = false; });
  function filter() {
    var query = search.value.trim().toLowerCase();
    var count = 0;
    var ordered = cards.slice();
    if (sort.value !== 'featured') {
      var key = sort.value === 'category' ? 'category' : 'name';
      ordered.sort(function (a, b) { return a.dataset[key].localeCompare(b.dataset[key]); });
    }
    ordered.forEach(function (card) {
      var text = [card.dataset.name, card.dataset.owner, card.dataset.area, card.dataset.notes].join(' ').toLowerCase();
      card.hidden = (category !== 'All' && card.dataset.category !== category) || (available.checked && card.dataset.available !== 'true') || !text.includes(query);
      if (!card.hidden) count++;
      catalogue.appendChild(card);
    });
    document.querySelectorAll('.filter-pill').forEach(function (pill) { pill.setAttribute('aria-pressed', String(pill.dataset.category === category)); });
    document.querySelector('#results-count').textContent = count + (count === 1 ? ' tool' : ' tools') + ' on the neighbourhood shelf';
    document.querySelector('#empty-state').hidden = count !== 0;
  }
  document.querySelector('#search-form').addEventListener('submit', function (event) { event.preventDefault(); filter(); });
  search.addEventListener('input', filter);
  available.addEventListener('change', filter);
  sort.addEventListener('change', filter);
  document.querySelectorAll('.filter-pill').forEach(function (pill) {
    pill.addEventListener('click', function () { category = pill.dataset.category; filter(); });
  });
  document.querySelector('#reset-filters').addEventListener('click', function () { category = 'All'; search.value = ''; available.checked = false; filter(); });
  filter();

  var dialog = document.querySelector('#tool-dialog');
  var current;
  var date = document.querySelector('#plan-date');
  var today = new Date();
  var minimum = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  date.min = minimum;
  function showTool(card) {
    current = card;
    var tool = card.dataset;
    document.querySelector('#detail-name').textContent = tool.name;
    document.querySelector('#detail-category').textContent = categories[tool.category];
    document.querySelector('#detail-description').textContent = tool.notes;
    ['owner', 'area', 'condition'].forEach(function (key) { document.querySelector('#detail-' + key).textContent = tool[key]; });
    document.querySelector('#detail-days').textContent = tool.days + ' days';
    document.querySelector('#detail-image').src = card.querySelector('img').src;
    document.querySelector('#detail-image').alt = card.querySelector('img').alt;
    document.querySelector('#plan-form').hidden = tool.available !== 'true';
    document.querySelector('#unavailable-notice').hidden = tool.available === 'true';
    document.querySelector('#plan-feedback').hidden = true;
    date.value = '';
    dialog.showModal();
  }
  catalogue.addEventListener('click', function (event) {
    var link = event.target.closest('.tool-detail-link');
    if (!link) return;
    event.preventDefault();
    showTool(link.closest('.tool-card'));
  });
  document.querySelector('#dialog-close').addEventListener('click', function () { dialog.close(); });
  document.querySelector('#plan-form').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!current || current.dataset.available !== 'true' || !event.target.reportValidity()) return;
    var plans = readList('lantern-plans');
    var savedPlan = saveList('lantern-plans', plans.concat({ tool: current.dataset.id, date: date.value }));
    var feedback = document.querySelector('#plan-feedback');
    feedback.hidden = false;
    feedback.textContent = savedPlan ? 'Your borrowing plan is saved on this device. Arrange pickup with the owner; this does not reserve the tool.' : 'This browser could not save your plan. Allow site storage and try again.';
  });
  var selected = cards.find(function (card) { return card.dataset.id === params.get('tool'); });
  if (selected) showTool(selected);
})();
