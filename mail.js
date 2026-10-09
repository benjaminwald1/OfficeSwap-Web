// Email links: many computers have no email app set up, so a plain mailto
// link can do nothing at all. On computers, clicking one opens a small menu
// instead: write in Gmail or Outlook on the web, open the email app, or copy
// the address. Phones always have a mail app, so they open it directly.
(function () {
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  function toast(text) {
    var t = document.querySelector(".mail-toast");
    if (!t) { t = document.createElement("div"); t.className = "mail-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add("on");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("on"); }, 3200);
  }
  function copy(addr) {
    var ok = function () { toast(addr + " copied"); }, no = function () { toast("Email us at " + addr); };
    try { navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(addr).then(ok, no) : no(); } catch (x) { no(); }
  }
  var ICON = {
    gmail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5V18a1.5 1.5 0 001.5 1.5H7V11l5 3.8L17 11v8.5h2.5A1.5 1.5 0 0021 18V7.5a2 2 0 00-3.2-1.6L12 10.2 6.2 5.9A2 2 0 003 7.5z" fill="currentColor"/></svg>',
    outlook: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7.5l8 5.5 8-5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    app: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l3-8h10l3 8v5a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18v-5zm0 0h4.5l1 2h5l1-2H20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6.5A2.5 2.5 0 0013.5 4h-7A2.5 2.5 0 004 6.5v7A2.5 2.5 0 006.5 16H8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
  };
  function close() { var m = document.querySelector(".mail-menu"); if (m) m.remove(); document.removeEventListener("keydown", esc); }
  function esc(e) { if (e.key === "Escape") close(); }
  function menu(addr, href) {
    close();
    var to = encodeURIComponent(addr);
    var m = document.createElement("div");
    m.className = "mail-menu";
    m.innerHTML =
      '<div class="mail-card" role="dialog" aria-modal="true" aria-label="Email ' + addr + '">' +
      '<p class="mail-to">Email us at</p><p class="mail-addr"></p>' +
      '<a class="mail-opt" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&to=' + to + '">' + ICON.gmail + "Write in Gmail</a>" +
      '<a class="mail-opt" target="_blank" rel="noopener" href="https://outlook.live.com/mail/0/deeplink/compose?to=' + to + '">' + ICON.outlook + "Write in Outlook</a>" +
      '<a class="mail-opt" data-app href="#">' + ICON.app + "Open my email app</a>" +
      '<button class="mail-opt" type="button" data-copy>' + ICON.copy + "Copy address</button>" +
      '<button class="mail-x" type="button" aria-label="Close">&times;</button></div>';
    m.querySelector(".mail-addr").textContent = addr;
    m.addEventListener("click", function (e) {
      if (e.target === m || e.target.closest(".mail-x")) return close();
      if (e.target.closest("[data-copy]")) { copy(addr); return close(); }
      if (e.target.closest("[data-app]")) { e.preventDefault(); close(); location.href = href; return; }
      if (e.target.closest("a.mail-opt")) setTimeout(close, 0);
    });
    document.body.appendChild(m);
    document.addEventListener("keydown", esc);
    m.querySelector(".mail-opt").focus();
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (!a || a.closest(".mail-menu")) return;
    var href = a.getAttribute("href");
    var addr = decodeURIComponent(href.slice(7).split("?")[0]);
    if (coarse) return;
    e.preventDefault();
    menu(addr, href);
  });
})();
