(function () {
  var icon =
    '<svg class="erp-back-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="m15 18-6-6 6-6"/></svg>';

  function erpBackLink(href) {
    return '<a class="btn-ghost admin-back erp-back" href="' + (href || '/admin') + '">' +
      icon + '<span>Briket ERP</span></a>';
  }

  var style = document.createElement('style');
  style.textContent = '.erp-back{display:inline-flex;align-items:center;gap:6px;}.erp-back-icon{display:block;flex:0 0 auto;}';
  document.head.appendChild(style);
  window.erpBackLink = erpBackLink;
})();
