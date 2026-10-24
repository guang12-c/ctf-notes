/* ===========================================
   背景视频注入
   - 桌面和手机都加载（手机竖屏也生效）
   - 省流模式 / 减少动效 → 不加载
   - 自动播放失败静默降级（保留封面图）
   =========================================== */
(function () {
  "use strict";

  // 1) 省流 / 减少动效 → 不加载（窄屏不再排除）
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  if (reduce || saveData) return;

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
