/**
 * 站点的两处动效，都用 IntersectionObserver，只播一次。
 *
 * 1. .reveal 元素进入视口时上浮 32px 并淡入
 * 2. .tagline 里的文字按词逐个从灰变亮
 *
 * 遵守 prefers-reduced-motion：直接显示最终状态，不做位移。
 */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- 1. 滚动显现 ----
  function initReveal() {
    var items = document.querySelectorAll("[data-reveal]");
    if (!items.length) return;

    if (reduce || !("IntersectionObserver" in window)) {
      for (var i = 0; i < items.length; i++) items[i].classList.add("on");
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("on");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    items.forEach(function (el) {
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  // ---- 2. tagline 逐词点亮 ----
  function initTagline() {
    var box = document.querySelector("[data-words]");
    if (!box) return;

    // 按「字」和「词」切开，保留原有换行
    var text = box.textContent;
    box.textContent = "";

    var words = [];
    var buffer = "";

    function flush() {
      if (!buffer) return;
      var span = document.createElement("span");
      span.className = "tw";
      span.textContent = buffer;
      box.appendChild(span);
      words.push(span);
      buffer = "";
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === "\n") {
        flush();
        box.appendChild(document.createElement("br"));
        continue;
      }
      if (/[\s]/.test(ch)) {
        flush();
        box.appendChild(document.createTextNode(ch));
        continue;
      }
      buffer += ch;
      // 中文按单字切，英文按空格切
      if (/[\u4e00-\u9fff]/.test(ch)) flush();
    }
    flush();

    if (reduce || !("IntersectionObserver" in window)) {
      words.forEach(function (w) { w.classList.add("on"); });
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          words.forEach(function (w, idx) {
            setTimeout(function () { w.classList.add("on"); }, idx * 45);
          });
          io.disconnect();
        });
      },
      { threshold: 0.25 }
    );
    io.observe(box);
  }

  function boot() {
    initReveal();
    initTagline();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
