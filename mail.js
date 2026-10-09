// Email links: many computers have no email app set up, so a plain mailto
// link can do nothing at all. On computers, clicking one opens a new Gmail
// email to that address in a new tab. Phones always have a mail app, so they
// open it directly.
(function () {
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (!a || coarse) return;
    var addr = decodeURIComponent(a.getAttribute("href").slice(7).split("?")[0]);
    e.preventDefault();
    window.open("https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(addr), "_blank", "noopener");
  });
})();
