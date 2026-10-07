/* "Scan your team in": a phone scans a printed staff directory (a photo
   of the page on a desk) and the people it reads land in the company's
   office list. Loops while the section is on screen; Reduce Motion
   shows the finished list. */
(function () {
  var stage = document.getElementById("sc-stage");
  if (!stage) return;

  var ORG = "Northwind Partners", LOC = "New York";
  var EXISTING = [
    { n: "Priya Shah", o: "Office 3201" },
    { n: "Marcus Chen", o: "Office 3202" }
  ];
  // Stock headshots (Pexels license) of models, with made-up names.
  // Boxes are where each photo, name and office sits on the printed page,
  // in percent of the page: [left, top, width, height].
  var PEOPLE = [
    { n: "Sarah Kim", o: "3204", img: "6962024" },
    { n: "James Carter", o: "3206", img: "7562139" },
    { n: "Nina Patel", o: "3208", img: "33680700" },
    { n: "Omar Haddad", o: "3210", img: "28442318" },
    { n: "Leo Martins", o: "3212", img: "6942776" }
  ];
  var BOXES = [
    { face: [8.63, 27.27, 9.73, 7.52], name: [20.39, 30.3, 13.96, 1.64], office: [70.98, 30.3, 6.27, 1.64] },
    { face: [8.63, 39.15, 9.73, 7.52], name: [20.39, 42.18, 18.35, 1.64], office: [70.98, 42.18, 6.27, 1.64] },
    { face: [8.63, 51.03, 9.73, 7.52], name: [20.39, 54.06, 13.8, 1.64], office: [70.98, 54.06, 6.27, 1.64] },
    { face: [8.63, 62.91, 9.73, 7.52], name: [20.39, 65.94, 18.9, 1.64], office: [70.98, 65.94, 6.27, 1.64] },
    { face: [8.63, 74.79, 9.73, 7.52], name: [20.39, 77.82, 16.0, 1.64], office: [70.98, 77.82, 6.27, 1.64] }
  ];
  var IMG = "images/scan/";

  function face(p) { return '<img src="' + IMG + "person-" + p.img + '.jpg" alt="" width="160" height="160" loading="lazy" decoding="async">'; }
  function initials(n) { return n.split(" ").map(function (w) { return w[0]; }).join(""); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  // A detection box around a spot on the page, with a little breathing room for text.
  function box(cls, r, pad) {
    var b = el("i", "sc-box " + cls);
    b.style.left = (r[0] - pad) + "%"; b.style.top = (r[1] - pad * 0.9) + "%";
    b.style.width = (r[2] + pad * 2) + "%"; b.style.height = (r[3] + pad * 1.8) + "%";
    return b;
  }

  // ---------- Build the scene ----------
  var scene = el("div", "sc-scene");
  // A photo of the printed directory lying on a desk.
  var desk = el("img", "sc-desk");
  desk.src = IMG + "scan-desk.jpg"; desk.alt = ""; desk.decoding = "async"; desk.loading = "lazy";
  scene.appendChild(desk);

  var phone = el("div", "sc-phone");
  var screen = el("div", "sc-screen");
  var vf = el("div", "sc-vf");
  var view = el("div", "sc-view");
  var page = el("img"); page.src = IMG + "scan-page.jpg"; page.alt = ""; page.decoding = "async"; page.loading = "lazy";
  view.appendChild(page);
  var vRows = BOXES.map(function (b) {
    var g = el("div", "sc-hitrow");
    g.appendChild(box("sc-b-face", b.face, 0.4));
    g.appendChild(box("sc-b-name", b.name, 1.1));
    g.appendChild(box("sc-b-off", b.office, 1.1));
    view.appendChild(g);
    return g;
  });
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

  var rvRows = review.querySelectorAll(".sc-rv-row");
  var dbNew = db.querySelectorAll(".sc-new");
  var addBtn = review.querySelector(".sc-add");
  var count = db.querySelector("#sc-count"), photos = db.querySelector("#sc-photos");
  var sync = db.querySelector(".sc-sync");

  function reset() {
    stage.classList.remove("sc-done");
    phone.className = "sc-phone";
    vf.classList.remove("sc-off"); review.classList.remove("sc-on");
    line.className = "sc-line"; tag.textContent = "Reading the list…"; tag.classList.remove("sc-ok");
    shutter.classList.remove("sc-flash");
    vRows.forEach(function (r) { r.classList.remove("sc-hit"); });
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
      var steps = vRows.map(function (r, i) {
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
