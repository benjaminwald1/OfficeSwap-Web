/* The hero's animated office board. A small floor of offices and a waitlist: an owner marks themselves
   away, their office turns available, the first person waiting moves into it, and the line moves up.
   Then the next day, with other people. It loops for as long as it's on screen; with reduced motion it
   shows one finished step and stays still. */
(function () {
  var root = document.querySelector(".board-demo");
  if (!root) return;
  var tilesEl = root.querySelector(".bd-tiles"), queueEl = root.querySelector(".bd-queue"),
      daysEl = root.querySelector(".bd-days"), toast = root.querySelector(".bd-toast");

  var OFFICES = [
    { id: "marcus", owner: "Marcus Chen", room: "Office 4B" },
    { id: "priya", owner: "Priya Shah", room: "Office 4C" },
    { id: "elena", owner: "Elena Rossi", room: "Office 5A" },
    { id: "sarah", owner: "Sarah Kim", room: "Office 5B" },
    { id: "david", owner: "David Okafor", room: "Office 6A" },
    { id: "ben", owner: "Ben Adler", room: "Office 6C" }
  ];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  // Each step: the day, whose office frees up, and the note the owner leaves.
  var STEPS = [
    { day: 2, office: "marcus", note: "Marcus Chen is away Wed to Fri" },
    { day: 3, office: "elena", note: "Elena Rossi is out Thursday" },
    { day: 4, office: "david", note: "David Okafor is travelling Friday" },
    { day: 0, office: "sarah", note: "Sarah Kim is off Monday" }
  ];
  var queue = ["Grace Liu", "Omar Haddad", "Jordan Lee", "Noah Park", "Ava Brooks", "Liam Ortiz"];

  function initials(n) { return n.split(" ").map(function (w) { return w[0]; }).join(""); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  var tiles = {};
  OFFICES.forEach(function (o) {
    var t = el("div", "bd-tile");
    t.innerHTML = '<div class="bd-room">' + o.room + '</div><div class="bd-who"><span class="bd-av">' + initials(o.owner) +
      '</span><span class="bd-name">' + o.owner + '</span></div><div class="bd-status">In</div>';
    tilesEl.appendChild(t); tiles[o.id] = t;
  });
  DAYS.forEach(function (d) { daysEl.appendChild(el("span", "bd-day", d)); });
  function renderQueue() {
    queueEl.innerHTML = "";
    queue.slice(0, 4).forEach(function (n, i) {
      var p = el("div", "bd-person", '<span class="bd-av">' + initials(n) + '</span><span class="bd-name">' + n + '</span><span class="bd-pos">#' + (i + 1) + "</span>");
      queueEl.appendChild(p);
    });
  }
  renderQueue();

  function setDay(i) { [].forEach.call(daysEl.children, function (d, j) { d.classList.toggle("on", j === i); }); }
  function resetTile(t, o) {
    t.className = "bd-tile";
    t.querySelector(".bd-av").textContent = initials(o.owner);
    t.querySelector(".bd-name").textContent = o.owner;
    t.querySelector(".bd-status").textContent = "In";
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    var s = STEPS[0], t = tiles[s.office];
    setDay(s.day); t.classList.add("taken");
    t.querySelector(".bd-av").textContent = initials(queue[0]);
    t.querySelector(".bd-name").textContent = queue[0];
    t.querySelector(".bd-status").textContent = "Assigned " + DAYS[s.day];
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
    var o = OFFICES.filter(function (x) { return x.id === s.office; })[0], t = tiles[s.office];
    await whenVisible();
    setDay(s.day);
    await wait(500);
    // the owner's note
    toast.textContent = s.note; toast.classList.add("in");
    await wait(900);
    t.classList.add("free"); t.querySelector(".bd-status").textContent = "Available";
    await wait(1100);
    toast.classList.remove("in");
    // the first person waiting travels from the line into the office
    var from = queueEl.firstElementChild, a = from.getBoundingClientRect(), b = t.getBoundingClientRect(), box = root.getBoundingClientRect();
    var fly = from.cloneNode(true); fly.classList.add("bd-fly");
    fly.style.left = (a.left - box.left) + "px"; fly.style.top = (a.top - box.top) + "px"; fly.style.width = a.width + "px";
    root.appendChild(fly); from.style.visibility = "hidden";
    fly.getBoundingClientRect();
    fly.style.transform = "translate(" + (b.left + (b.width - a.width) / 2 - a.left) + "px," + (b.top + (b.height - a.height) / 2 - a.top) + "px) scale(.92)";
    fly.style.opacity = "0.0";
    await wait(750);
    fly.remove();
    var who = queue.shift(); queue.push(who);
    t.classList.remove("free"); t.classList.add("taken");
    t.querySelector(".bd-av").textContent = initials(who);
    t.querySelector(".bd-name").textContent = who;
    t.querySelector(".bd-status").textContent = "Assigned " + DAYS[s.day];
    // the line moves up
    var rows = queueEl.children, step = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 50;
    rows[0].style.opacity = "0";
    queueEl.style.transform = "translateY(-" + step + "px)";
    await wait(380);
    queueEl.style.transition = "none"; queueEl.style.transform = ""; renderQueue();
    queueEl.getBoundingClientRect(); queueEl.style.transition = "";
    await wait(2200);
    resetTile(t, o);
    await wait(400);
  }

  (async function loop() {
    for (var i = 0; ; i = (i + 1) % STEPS.length) await step(STEPS[i]);
  })();
})();
