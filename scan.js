/* "Scan your team in": a phone scans a printed staff directory and the
   people it reads land in the company's office list. Loops while the
   section is on screen; Reduce Motion shows the finished list. */
(function () {
  var stage = document.getElementById("sc-stage");
  if (!stage) return;

  var ORG = "Northwind Partners", LOC = "New York";
  var EXISTING = [
    { n: "Priya Shah", o: "Office 3201" },
    { n: "Marcus Chen", o: "Office 3202" }
  ];
  // Illustrated headshots, not photos of real people.
  var PEOPLE = [
    { n: "Sarah Kim", o: "3204", skin: "#f3cfb0", hair: "#2b211c", style: "long", shirt: "#5b7cfa", bg: "#dfe7f5" },
    { n: "James Carter", o: "3206", skin: "#8d5a3b", hair: "#17110d", style: "short", shirt: "#2f3b52", bg: "#e6e0d6" },
    { n: "Nina Patel", o: "3208", skin: "#c68d63", hair: "#1d1612", style: "bun", shirt: "#e07a5f", bg: "#f1e2dc" },
    { n: "Omar Haddad", o: "3210", skin: "#d6a07a", hair: "#2a1f18", style: "beard", shirt: "#3d8b6e", bg: "#dcebe4" },
    { n: "Leo Martins", o: "3212", skin: "#f0c9a8", hair: "#8a5228", style: "wavy", shirt: "#8a63d2", bg: "#e7e1f3" }
  ];

  function face(p) {
    var hair = {
      long: '<path d="M9 21c0-8 4.6-12.4 11-12.4S31 13 31 21v11h-4.4V21.5c-1.8-2.6-4.2-4.2-6.6-4.6-2.4.4-4.8 2-6.6 4.6V32H9z" fill="' + p.hair + '"/>',
      short: '<path d="M12.6 18.6c-.4-5.6 3-9.2 7.4-9.2s7.8 3.4 7.4 9.2c-1.6-2.8-4.4-4.2-7.4-4.2s-5.8 1.4-7.4 4.2z" fill="' + p.hair + '"/>',
      bun: '<circle cx="20" cy="7.6" r="3.4" fill="' + p.hair + '"/><path d="M12.4 19.4c-.2-6 3.2-9.6 7.6-9.6s7.8 3.6 7.6 9.6c-1.4-3-4.4-4.8-7.6-4.8s-6.2 1.8-7.6 4.8z" fill="' + p.hair + '"/>',
      beard: '<path d="M12.8 18.4c-.3-5.4 3-8.8 7.2-8.8s7.5 3.4 7.2 8.8c-1.6-2.4-4.2-3.6-7.2-3.6s-5.6 1.2-7.2 3.6z" fill="' + p.hair + '"/><path d="M13.4 21.6c.6 5 3.4 7.6 6.6 7.6s6-2.6 6.6-7.6c-1 1.6-2 2.4-3 2.6-1 1.4-2.2 2-3.6 2s-2.6-.6-3.6-2c-1-.2-2-1-3-2.6z" fill="' + p.hair + '"/>',
      wavy: '<path d="M12 19.6c-1.2-6.4 2.8-10.6 8-10.6s9.2 4.2 8 10.6c-.8-1.8-1.8-3-3-3.6-.6 1-1.8 1.4-2.8.8-1 .8-2.4.8-3.4 0-1 .6-2.2.4-2.8-.6-1.6.4-3 1.6-4 3.4z" fill="' + p.hair + '"/>'
    }[p.style];
    return '<svg viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" fill="' + p.bg + '"/>' +
      '<path d="M5 40c1.4-7 7-10.6 15-10.6S33.6 33 35 40z" fill="' + p.shirt + '"/>' +
      '<path d="M17 25.5h6v5.4c-1 1-2 1.4-3 1.4s-2-.4-3-1.4z" fill="' + p.skin + '" opacity=".92"/>' +
      '<ellipse cx="20" cy="19.6" rx="7" ry="8.2" fill="' + p.skin + '"/>' + hair + "</svg>";
  }
  function initials(n) { return n.split(" ").map(function (w) { return w[0]; }).join(""); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  // ---------- Build the scene ----------
  var scene = el("div", "sc-scene");
  var paper = el("div", "sc-paper");
  paper.innerHTML =
    '<div class="sc-p-head"><b>' + ORG + '</b><span>Staff directory · 32nd floor</span></div>' +
    '<div class="sc-p-cols"><span>Name</span><span>Office</span></div>' +
    PEOPLE.map(function (p) {
      return '<div class="sc-p-row"><span class="sc-p-face">' + face(p) + '</span><span class="sc-p-name">' + p.n +
        '</span><span class="sc-p-off">' + p.o + "</span></div>";
    }).join("") +
    '<div class="sc-p-foot">Updated Monday · Facilities</div>';
  scene.appendChild(paper);

  var phone = el("div", "sc-phone");
  var screen = el("div", "sc-screen");
  var vf = el("div", "sc-vf");
  var view = paper.cloneNode(true); view.className = "sc-paper sc-view";
  vf.appendChild(view);
  vf.appendChild(el("div", "sc-corners", "<i></i><i></i><i></i><i></i>"));
  var line = el("div", "sc-line"); vf.appendChild(line);
  var tag = el("div", "sc-tag", "Reading the list…"); vf.appendChild(tag);
  var shutter = el("div", "sc-shutter"); vf.appendChild(shutter);
  screen.appendChild(vf);

  var review = el("div", "sc-rv");
  review.innerHTML =
    '<div class="sc-rv-nav"><span>Cancel</span><b>Scanned list</b><span class="sc-add">Add 5</span></div>' +
    '<div class="sc-rv-loc"><small>Add to location</small><span>' + LOC + "</span></div>" +
    '<small class="sc-rv-h">5 found · 5 selected</small>' +
    '<div class="sc-rv-list">' + PEOPLE.map(function (p) {
      return '<div class="sc-rv-row"><i class="sc-ck"></i><span class="sc-av">' + face(p) + '</span><span class="sc-rv-t"><b>' + p.n +
        "</b><small>Office " + p.o + "</small></span></div>";
    }).join("") + "</div>";
  screen.appendChild(review);
  screen.appendChild(el("div", "sc-island"));
  phone.appendChild(screen);
  scene.appendChild(phone);
  stage.appendChild(scene);

  var db = el("div", "sc-db");
  db.innerHTML =
    '<div class="sc-db-head"><span class="sc-org">NP</span><span class="sc-db-t"><b>' + ORG + "</b><small>Office list · " + LOC +
    '</small></span><span class="sc-sync"><i></i>Synced</span></div>' +
    '<div class="sc-db-count"><b id="sc-count">2</b> people · <span id="sc-photos">0</span> photos</div>' +
    '<div class="sc-db-list">' +
    EXISTING.map(function (p) {
      return '<div class="sc-db-row"><span class="sc-av sc-ini">' + initials(p.n) + '</span><span class="sc-db-tx"><b>' + p.n +
        "</b><small>" + p.o + " · " + LOC + "</small></span></div>";
    }).join("") +
    PEOPLE.map(function (p) {
      return '<div class="sc-db-row sc-new"><span class="sc-av">' + face(p) + '</span><span class="sc-db-tx"><b>' + p.n +
        "</b><small>Office " + p.o + " · " + LOC + '</small></span><span class="sc-pill">New</span></div>';
    }).join("") + "</div>" +
    '<div class="sc-db-foot">Everyone at ' + ORG + " sees the update instantly.</div>";
  stage.appendChild(db);

  var vRows = view.querySelectorAll(".sc-p-row");
  var rvRows = review.querySelectorAll(".sc-rv-row");
  var dbNew = db.querySelectorAll(".sc-new");
  var addBtn = review.querySelector(".sc-add");
  var count = db.querySelector("#sc-count"), photos = db.querySelector("#sc-photos");
  var sync = db.querySelector(".sc-sync");

  // The viewfinder shows the page straightened and scaled to the screen.
  function fit() {
    var k = (vf.clientWidth * 0.86) / paper.offsetWidth;
    view.style.transform = "translate(-50%, -50%) scale(" + k + ")";
  }
  fit();
  window.addEventListener("resize", fit);

  function reset() {
    stage.classList.remove("sc-done");
    phone.className = "sc-phone";
    vf.classList.remove("sc-off"); review.classList.remove("sc-on");
    line.className = "sc-line"; tag.textContent = "Reading the list…"; tag.classList.remove("sc-ok");
    shutter.classList.remove("sc-flash");
    [].forEach.call(vRows, function (r) { r.classList.remove("sc-hit"); });
    [].forEach.call(rvRows, function (r) { r.classList.remove("sc-gone"); });
    [].forEach.call(dbNew, function (r) { r.classList.remove("sc-in", "sc-fresh"); });
    addBtn.classList.remove("sc-press");
    count.textContent = EXISTING.length; photos.textContent = 0;
    sync.classList.remove("sc-pulse");
  }

  function finished() {
    reset();
    stage.classList.add("sc-done");
    phone.classList.add("sc-at");
    vf.classList.add("sc-off"); review.classList.add("sc-on");
    [].forEach.call(dbNew, function (r) { r.classList.add("sc-in", "sc-fresh"); });
    [].forEach.call(rvRows, function (r) { r.classList.add("sc-gone"); });
    count.textContent = EXISTING.length + PEOPLE.length; photos.textContent = PEOPLE.length;
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { finished(); return; }

  // ---------- Timing that pauses while off screen ----------
  var visible = false, run = 0;
  function active() { return visible && !document.hidden; }
  function wait(ms, my) {
    return new Promise(function (resolve, reject) {
      var left = ms, last = performance.now();
      (function tick() {
        if (my !== run) return reject();
        var now = performance.now();
        if (active()) left -= now - last;
        last = now;
        if (left <= 0) resolve(); else setTimeout(tick, Math.min(left, 80));
      })();
    });
  }

  function fly(from, to) {
    var s = stage.getBoundingClientRect(), a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    var f = to.cloneNode(true);
    f.className = "sc-db-row sc-fly";
    f.style.left = (a.left - s.left) + "px"; f.style.top = (a.top - s.top) + "px";
    f.style.width = b.width + "px";
    var k = a.width / b.width;
    f.style.transform = "scale(" + k + ")";
    stage.appendChild(f);
    f.getBoundingClientRect();
    f.style.transform = "translate(" + (b.left - a.left) + "px," + (b.top - a.top) + "px) scale(1)";
    return f;
  }

  function loop() {
    var my = ++run;
    var w = function (ms) { return wait(ms, my); };
    reset();
    w(500).then(function () {
      phone.classList.add("sc-at");                       // phone moves over the page
      return w(1100);
    }).then(function () {
      line.classList.add("sc-sweep");                     // scan line passes each row
      var steps = [].map.call(vRows, function (r, i) {
        return w(360 + i * 300).then(function () { r.classList.add("sc-hit"); });
      });
      return Promise.all(steps);
    }).then(function () { return w(500); }).then(function () {
      tag.textContent = "5 people · 5 photos"; tag.classList.add("sc-ok");
      return w(900);
    }).then(function () {
      shutter.classList.add("sc-flash");
      return w(220);
    }).then(function () {
      vf.classList.add("sc-off"); review.classList.add("sc-on");   // the review screen
      return w(1300);
    }).then(function () {
      addBtn.classList.add("sc-press");
      return w(380);
    }).then(function () {
      var chain = Promise.resolve();
      [].forEach.call(rvRows, function (r, i) {
        chain = chain.then(function () {
          dbNew[i].classList.add("sc-in");              // open the slot first so the target is measured in place
          return w(60);
        }).then(function () {
          var f = fly(r, dbNew[i]);
          r.classList.add("sc-gone");
          return w(520).then(function () {
            f.remove();
            dbNew[i].classList.add("sc-fresh");
            count.textContent = EXISTING.length + i + 1;
            photos.textContent = i + 1;
            sync.classList.remove("sc-pulse"); void sync.offsetWidth; sync.classList.add("sc-pulse");
          });
        });
      });
      return chain;
    }).then(function () {
      phone.classList.add("sc-away");
      return w(3400);
    }).then(function () {
      stage.classList.add("sc-fade");
      return w(500);
    }).then(function () {
      stage.classList.remove("sc-fade");
      stage.querySelectorAll(".sc-fly").forEach(function (f) { f.remove(); });
      loop();
    }).catch(function () {});
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { visible = e.isIntersecting; });
    }, { threshold: 0.25 }).observe(stage);
  } else { visible = true; }
  loop();
})();
