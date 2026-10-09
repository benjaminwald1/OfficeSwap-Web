// The hero's logo animation, the same as the app's welcome screen: the tile
// pops in, the two towers rise, every window lights up floor by floor, then
// the towers swap places and the name fades in. After that the towers swap
// every few seconds with different windows lit, like offices in use.
// Timers rather than requestAnimationFrame, which never fires in hidden tabs.
(function () {
  var hero = document.querySelector(".logo-hero");
  if (!hero) return;
  var tall = hero.querySelector(".lg-tall"), short = hero.querySelector(".lg-short");
  var wins = [].slice.call(hero.querySelectorAll(".w"));
  var swapped = false, visible = true;

  function someLit() { wins.forEach(function (w) { w.classList.toggle("on", Math.random() < 0.4); }); }

  // The towers trade places, the shorter one hopping over in front.
  function swap() {
    swapped = !swapped;
    short.parentNode.appendChild(short);
    tall.style.transform = swapped ? "translateX(260px)" : "";
    short.style.transform = swapped ? "translateX(-260px)" : "";
    var hops = [tall, short].map(function (t) { return t.querySelector(".lg-hop"); });
    hops.forEach(function (h) { h.classList.remove("down"); h.classList.add("up"); });
    setTimeout(function () { hops.forEach(function (h) { h.classList.add("down"); h.classList.remove("up"); }); }, 260);
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    tall.style.transition = short.style.transition = "none";
    hero.classList.add("is-tile", "is-risen", "is-ready");
    swap(); someLit();
    return;
  }

  var steps = [
    [80, function () { hero.classList.add("is-tile"); }],
    [300, function () { hero.classList.add("is-risen"); }],
    [550, null]
  ];
  // Every window on, floor by floor from the ground.
  for (var f = 0; f < 7; f++) (function (f) {
    steps.push([55, function () { wins.forEach(function (w) { if (+w.dataset.f === f) w.classList.add("on"); }); }]);
  })(f);
  steps.push([250, someLit], [0, swap], [560, function () { hero.classList.add("is-ready"); }]);

  var t = 0;
  steps.forEach(function (s) { t += s[0]; if (s[1]) setTimeout(s[1], t); });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(hero);
  }
  setTimeout(function () {
    setInterval(function () {
      if (!visible || document.hidden) return;
      swap(); someLit();
    }, 3800);
  }, t + 2600);
})();
