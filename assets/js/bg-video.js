/* ===========================================
   背景视频注入
   - 只在宽屏 + 允许动效时加载
   - 自动播放失败静默降级
   =========================================== */
(function () {
  "use strict";

  // 1) 省流 / 减少动效 / 窄屏 → 不加载
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var narrow = window.matchMedia("(max-width: 48em)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || narrow || saveData) return;

  // 2) 用脚本自身位置推算资源根目录
  //    脚本在 <site>/assets/js/bg-video.js → 资源根 <site>/assets/
  var self = document.currentScript;
  var assets = self
    ? new URL("../", self.src)
    : new URL("assets/", location.href);

  // 3) 构建背景容器
  var wrap = document.createElement("div");
  wrap.className = "ctf-bg";
  wrap.setAttribute("aria-hidden", "true");

  var video = document.createElement("video");
  video.autoplay = true;
  video.loop = true;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("disablepictureinpicture", "");
  video.poster = new URL("video/snowfall-poster.jpg", assets).href;
  video.src = new URL("video/snowfall.mp4", assets).href;

  wrap.appendChild(video);

  function mount() {
    if (document.querySelector(".ctf-bg")) return;
    document.body.insertBefore(wrap, document.body.firstChild);
    var p = video.play();
    if (p && typeof p.catch === "function") {
      // 自动播放被拦 → 静默降级，视频层保留封面图
      p.catch(function () {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
