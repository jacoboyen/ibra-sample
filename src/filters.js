// Discipline filter for the calendar. Without JavaScript every race is shown.
(function () {
  var bar = document.querySelector('[data-filters]');
  if (!bar) return;
  bar.hidden = false;
  var buttons = bar.querySelectorAll('button');
  var events = document.querySelectorAll('[data-kind]');
  var months = document.querySelectorAll('[data-month]');
  var empty = document.querySelector('[data-empty-filter]');
  bar.addEventListener('click', function (e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var kind = btn.getAttribute('data-value');
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
    var shown = 0;
    events.forEach(function (ev) {
      var match = kind === 'all' || ev.getAttribute('data-kind') === kind;
      ev.hidden = !match;
      if (match) shown++;
    });
    months.forEach(function (m) {
      m.hidden = !m.querySelector('[data-kind]:not([hidden])');
    });
    if (empty) empty.hidden = shown > 0;
  });
})();
