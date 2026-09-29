/* The hero's animated office board. A small floor of offices and a waitlist: an owner marks themselves
   away, their office turns available, the first person waiting moves into it, and the line moves up.
   Then the next day, with other people. It loops while it's on screen; with reduced motion it shows
   one finished step and stays still. */
(function () {
  var root = document.querySelector(".board-demo");
  if (!root) return;
  var $ = function (s) { return root.querySelector(s); };
  var tilesEl = $(".bd-tiles"), queueEl = $(".bd-queue"), daysEl = $(".bd-days"), note = $(".bd-note"),
      countEl = $(".bd-count b"), barEl = $(".bd-bar i"), waitN = $(".bd-waitn");

  var OFFICES = [
    { id: "marcus", owner: "Marcus Chen", room: "4B", view: "Window" },
    { id: "priya", owner: "Priya Shah", room: "4C", view: "Corner" },
    { id: "elena", owner: "Elena Rossi", room: "5A", view: "Window" },
    { id: "sarah", owner: "Sarah Kim", room: "5B", view: "Quiet" },
    { id: "david", owner: "David Okafor", room: "6A", view: "Corner" },
    { id: "ben", owner: "Ben Adler", room: "6C", view: "Window" }
  ];
  var DAYS = [["Mon", 28], ["Tue", 29], ["Wed", 30], ["Thu", 1], ["Fri", 2]];
  var STEPS = [
    { day: 2, office: "marcus", note: "Away Wed to Fri" },
    { day: 3, office: "elena", note: "Out Thursday" },
    { day: 4, office: "david", note: "Travelling Friday" },
    { day: 0, office: "sarah", note: "Off Monday" }
  ];
  var queue = ["Grace Liu", "Omar Haddad", "Jordan Lee", "Noah Park", "Ava Brooks", "Liam Ortiz"];

  var ICON = {
    dot: '<svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="4"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>'
  };
  function initials(n) { return n.split(" ").map(function (w) { return w[0]; }).join(""); }
  function hue(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360; return h; }
  function av(n) { return '<span class="bd-av" style="--h:' + hue(n) + '">' + initials(n) + "</span>"; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var tiles = {};
  OFFICES.forEach(function (o) {
    var t = el("div", "bd-tile");
    t.innerHTML = '<div class="bd-top"><span class="bd-room">Office ' + o.room + '</span><span class="bd-view">' + o.view + "</span></div>" +
      '<div class="bd-who">' + av(o.owner) + '<span class="bd-name">' + o.owner + "</span></div>" +
      '<span class="bd-pill">' + ICON.dot + "<span>In office</span></span>";
    tilesEl.appendChild(t); tiles[o.id] = t;
  });
  var hi = el("span", "bd-hi"); daysEl.appendChild(hi);
  DAYS.forEach(function (d) { daysEl.appendChild(el("span", "bd-day", "<small>" + d[0] + "</small><b>" + d[1] + "</b>")); });

  function renderQueue(dayIdx) {
    queueEl.innerHTML = "";
    queue.slice(0, 4).forEach(function (n, i) {
      queueEl.appendChild(el("div", "bd-person" + (i === 0 ? " first" : ""), av(n) +
        '<span class="bd-pmeta"><span class="bd-name">' + n + "</span><small>Needs " + DAYS[dayIdx][0] + "</small></span>" +
        '<span class="bd-pos">' + (i + 1) + "</span>"));
    });
    waitN.textContent = queue.length;
  }
  var inUse = 6;
  function setCount(n) { inUse = n; countEl.textContent = n; barEl.style.width = (n / OFFICES.length * 100) + "%"; }
  function setDay(i) {
    var d = daysEl.querySelectorAll(".bd-day")[i];
    [].forEach.call(daysEl.querySelectorAll(".bd-day"), function (x, j) { x.classList.toggle("on", j === i); });
    hi.style.transform = "translateX(" + d.offsetLeft + "px)"; hi.style.width = d.offsetWidth + "px";
  }
  function setTile(t, cls, who, pill) {
    t.className = "bd-tile" + (cls ? " " + cls : "");
    t.querySelector(".bd-who").innerHTML = av(who) + '<span class="bd-name">' + who + "</span>";
    t.querySelector(".bd-pill").innerHTML = pill;
  }

  renderQueue(STEPS[0].day); setCount(6);
  requestAnimationFrame(function () { setDay(STEPS[0].day); });

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    var s0 = STEPS[0];
    setTile(tiles[s0.office], "taken", queue[0], ICON.check + "<span>Assigned " + DAYS[s0.day][0] + "</span>");
    setCount(6);
    return;
  }

  var visible = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0.2 }).observe(root);
  }
  function whenVisible() {
    return new Promise(function (r) { (function check() { if (visible && !document.hidden) r(); else setTimeout(check, 300); })(); });
  }

  async function step(s) {
    var o = OFFICES.filter(function (x) { return x.id === s.office; })[0], t = tiles[s.office], day = DAYS[s.day][0];
    await whenVisible();
    setDay(s.day); renderQueue(s.day);
    await wait(700);
    // the owner's note slides in, and their office opens up
    note.innerHTML = '<span class="bd-nic">' + ICON.cal + "</span>" + av(o.owner) +
      '<span class="bd-ntext"><b>' + o.owner + "</b><span>" + s.note + " · office offered</span></span>";
    note.classList.add("in");
    await wait(900);
    setTile(t, "free", o.owner, ICON.dot + "<span>Available " + day + "</span>");
    setCount(inUse - 1);
    await wait(1300);
    note.classList.remove("in");
    // the first person waiting travels from the line into the office
    var from = queueEl.firstElementChild, a = from.getBoundingClientRect(), b = t.getBoundingClientRect(), box = root.getBoundingClientRect();
    var fly = el("div", "bd-fly", av(queue[0]) + '<span class="bd-name">' + queue[0] + "</span>");
    root.appendChild(fly);
    var fw = fly.offsetWidth, fh = fly.offsetHeight;
    fly.style.left = (a.left - box.left) + "px"; fly.style.top = (a.top - box.top + (a.height - fh) / 2) + "px";
    from.classList.add("gone");
    fly.getBoundingClientRect();
    fly.classList.add("go");
    fly.style.transform = "translate(" + (b.left + (b.width - fw) / 2 - a.left) + "px," + (b.top + b.height * 0.52 - fh / 2 - a.top - (a.height - fh) / 2) + "px)";
    await wait(820);
    fly.remove();
    var who = queue.shift(); queue.push(who);
    setTile(t, "taken pop", who, ICON.check + "<span>Assigned " + day + "</span>");
    setCount(inUse + 1);
    // the line moves up
    var rows = queueEl.children, gap = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 56;
    queueEl.style.transform = "translateY(-" + gap + "px)";
    await wait(420);
    queueEl.style.transition = "none"; queueEl.style.transform = ""; renderQueue(s.day);
    queueEl.getBoundingClientRect(); queueEl.style.transition = "";
    await wait(2400);
    setTile(t, "", o.owner, ICON.dot + "<span>In office</span>");
    await wait(500);
  }

  (async function loop() {
    for (var i = 0; ; i = (i + 1) % STEPS.length) await step(STEPS[i]);
  })();
})();
