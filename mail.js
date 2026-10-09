// Email links: many computers have no email app set up, so a mailto link
// can do nothing at all. Clicking one also copies the address and says so;
// the email app still opens where there is one.
(function () {
  function toast(text) {
    var t = document.querySelector(".mail-toast");
    if (!t) { t = document.createElement("div"); t.className = "mail-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = text;
    t.classList.add("on");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove("on"); }, 3200);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="mailto:"]');
    if (!a) return;
    var addr = decodeURIComponent(a.getAttribute("href").slice(7).split("?")[0]);
    var done = function () { toast(addr + " copied. Paste it into your email."); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(addr).then(done, function () { toast("Email us at " + addr); });
      else toast("Email us at " + addr);
    } catch (x) { toast("Email us at " + addr); }
  });
})();
