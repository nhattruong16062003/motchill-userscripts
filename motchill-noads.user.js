// ==UserScript==
// @name         Motchill - chặn quảng cáo + cử chỉ tua
// @namespace    motchill-noads
// @version      3.3
// @author       zic
// @homepageURL  https://github.com/nhattruong16062003/motchill-noads
// @updateURL    https://raw.githubusercontent.com/nhattruong16062003/motchill-noads/main/motchill-noads.user.js
// @downloadURL  https://raw.githubusercontent.com/nhattruong16062003/motchill-noads/main/motchill-noads.user.js
// @description  Chặn quảng cáo trên motchilltu.com / motchillt.app. Trình phát: chạm 2 lần tua 10 giây, giữ để xem x2, khóa màn hình khi phóng to, tắt chia sẻ P2P.
// @match        https://motchilltu.com/*
// @match        https://motchillt.app/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ============================================================
  //  CÀI ĐẶT
  // ============================================================

  // true  = phim chỉ tải từ máy chủ, máy bạn không phải tải lên cho người xem khác.
  // false = để nguyên cơ chế P2P (chia sẻ qua lại giữa người xem) của trang.
  const DISABLE_P2P = true;

  // Mốc thời gian ở tương lai xa: trang tưởng quảng cáo "vừa hiện xong" nên không hiện nữa.
  const FUTURE = '9999999999999';

  // ============================================================
  //  CHỌN VIỆC THEO TỪNG TRANG
  // ============================================================
  const host = location.hostname;

  if (host === 'motchilltu.com') {
    blockMotchilltu();
    if (DISABLE_P2P) disableP2P();
    addPlayerFeatures();
  } else if (host === 'motchillt.app') {
    blockMotchillt();
  }

  // ============================================================
  //  motchilltu.com: CHẶN QUẢNG CÁO
  //  (WordPress, quảng cáo đến từ plugin "ads-manager" và "popup-protect")
  // ============================================================
  function blockMotchilltu() {
    // 1) Tab quảng cáo khi bấm (popup-protect): cho trang tưởng hôm nay
    //    đã dùng hết lượt, và lượt chỉ được làm mới ở tương lai xa.
    localStorage.setItem('plp_day', new Date().toISOString().slice(0, 10));
    localStorage.setItem('plp_windowStart', FUTURE);
    localStorage.setItem('plp_windowCount', '999');

    // 2) Popup-under (ads-manager): hiện đang tắt trên trang, chặn sẵn phòng khi bật lại.
    localStorage.setItem('popupShown', 'true');
    localStorage.setItem('lastPopupTime', FUTURE);

    // 3) Popup giữa màn hình: chỉ hiện khi cookie này đã cũ hơn 30 phút.
    document.cookie = 'popup_last_shown=' + FUTURE + '; path=/';

    // 4) Ẩn banner trên/dưới, banner dưới trình phát, popup và nút "Ẩn QC".
    addStyle(`
      .cat-footer-wrapper,
      .cat-header-wrapper,
      .container-aam,
      .container-aam-player,
      #popup-overlay,
      .hide-qc {
        display: none !important;
      }
    `);

    // Popup có thể đã mở (và khoá cuộn trang) trước khi bookmarklet chạy.
    if (document.body) document.body.style.overflow = '';
  }

  // ============================================================
  //  motchilltu.com: TẮT CHIA SẺ P2P
  //  Trang dùng thư viện p2p-media-loader: phần lớn đoạn phim được tải từ máy
  //  của người xem khác, và máy bạn cũng tải lên cho họ. Trang chỉ bật P2P khi
  //  p2pml.hlsjs.Engine.isSupported() trả về true; nếu là false, trang tự phát
  //  thẳng từ máy chủ (nhánh dự phòng có sẵn của trang).
  //  Script đặt một "getter" cho biến p2pml: mỗi lần trang đọc nó,
  //  isSupported() bị đổi thành luôn trả về false.
  //  Chỉ có tác dụng khi chạy trước trang (Tampermonkey / Userscripts),
  //  bookmarklet chạy sau khi trang đã tải nên không tắt được.
  // ============================================================
  function disableP2P() {
    let p2pml = window.p2pml;
    Object.defineProperty(window, 'p2pml', {
      configurable: true,
      get() {
        const engine = p2pml && p2pml.hlsjs && p2pml.hlsjs.Engine;
        if (engine) engine.isSupported = () => false;
        return p2pml;
      },
      set(value) {
        p2pml = value;
      },
    });
  }

  // ============================================================
  //  motchillt.app (Next.js): CHẶN QUẢNG CÁO
  // ============================================================
  function blockMotchillt() {
    // 1) Video quảng cáo trước phim, popup giữa màn hình, tab quảng cáo khi bấm:
    //    trang chỉ hiện khi các mốc thời gian này đã cũ.
    sessionStorage.setItem('vast_ad_last_shown', FUTURE);
    sessionStorage.setItem('popup-ads-last-shown-ts', FUTURE);
    sessionStorage.setItem('popup-ads-init-count', '999');
    sessionStorage.setItem('click_last_ad', FUTURE);

    // 2) Trang chỉ gắn bộ bắt click mở tab quảng cáo khi cờ này chưa bật -> giữ nó luôn bật.
    try {
      Object.defineProperty(window, '__ads_listener__', { get: () => true, set: () => {} });
    } catch (e) {}

    // 3) Ẩn banner, nút "AD Blocker" giả, popup, nút quảng cáo nhấp nháy.
    addStyle(`
      .ads-banner,
      div:has(> button[aria-label="Button handle hide all ads"]),
      .fixed.inset-0:has(.no-ads-under),
      div:has(> a.promo-btn) {
        display: none !important;
      }
    `);
  }

  // ============================================================
  //  TRÌNH PHÁT (JW Player của motchilltu.com)
  //   - Chạm 2 lần bên trái / phải: lùi / tới 10 giây (chạm tiếp để tua thêm)
  //   - Giữ ngón tay: tốc độ x2, thả ra trở lại như cũ
  //   - Ổ khóa nhỏ ở mép phải, chỉ hiện khi phóng to. Khi khóa: chỉ còn tua
  //     10 giây và giữ x2; muốn dừng hay thu nhỏ phải mở khóa trước.
  //   - Ẩn nút chia sẻ của trình phát.
  //
  //  Cách JW Player nghe thao tác chạm trên Android (đã đọc mã của nó):
  //   - Mỗi lần chạm nó tự nhận touchstart/touchend; 2 lần touchend cách nhau
  //     dưới 300 ms = "chạm 2 lần" -> bật toàn màn hình.
  //   - Giữ lâu -> sự kiện contextmenu -> nó mở menu "chuột phải" của nó.
  //  Vì vậy script chặn các sự kiện đó trước khi JW Player nhận được.
  // ============================================================
  function addPlayerFeatures() {
    const SKIP_SECONDS = 10;
    const HOLD_MS = 450;
    const DOUBLE_TAP_MS = 300;
    const LOCK_ICON_SHOW_MS = 2500;
    const TIP_SHOW_MS = 700;

    // ---- Biểu tượng (SVG nét mảnh, màu theo chữ) ----
    const svg = (paths, size = 16) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    const ICON = {
      lockOpen: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>', 24),
      lockClosed: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 24),
      back: svg('<path d="M11 7l-5 5 5 5"/><path d="M17 7l-5 5 5 5"/>'),
      forward: svg('<path d="M7 7l5 5-5 5"/><path d="M13 7l5 5-5 5"/>'),
      // Một mũi tên tam giác nhỏ; 2x dùng ba cái nối nhau.
      triangle: '<svg viewBox="0 0 10 12" width="9" height="12"><path d="M0 0L10 6L0 12z" fill="currentColor"/></svg>',
    };

    addStyle(`
      /* Không phóng to khi chạm 2 lần, không bôi đen chữ khi giữ. */
      .jwplayer {
        touch-action: manipulation;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }

      /* Nút tua / tập tiếp ở giữa màn hình nằm đúng vùng chạm 2 lần -> ẩn
         (nút tua 10 giây ở thanh điều khiển phía dưới vẫn còn). */
      .jwplayer .jw-display-icon-rewind,
      .jwplayer .jw-display-icon-next {
        visibility: hidden !important;
      }

      /* Ẩn nút chia sẻ và menu chia sẻ của trình phát. */
      .jwplayer .jw-settings-sharing,
      .jwplayer .jw-sharing-menu {
        display: none !important;
      }

      /* Lớp phủ trong suốt khi khóa: mọi thao tác chạm rơi vào đây. */
      .mc-layer {
        position: absolute;
        inset: 0;
        z-index: 2147483645;
        display: none;
        touch-action: none;
      }
      .jwplayer.mc-locked .mc-layer {
        display: block;
      }

      /* Khi khóa: ẩn toàn bộ điều khiển của JW Player (dừng, thu nhỏ, thanh tua...). */
      .jwplayer.mc-locked .jw-controls {
        display: none !important;
      }

      /* Ổ khóa: tròn 48 px, cách mép phải 48 px cho vừa tầm ngón cái khi cầm ngang,
         mặc định ẩn. */
      .mc-lock {
        position: absolute;
        top: 50%;
        right: 48px;
        z-index: 2147483646;
        width: 48px;
        height: 48px;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: rgba(0, 0, 0, .3);
        border: .5px solid rgba(255, 255, 255, .35);
        color: #fff;
        opacity: 0;
        pointer-events: none;
        transition: opacity .2s;
      }
      .mc-lock .mc-closed,
      .jwplayer.mc-locked .mc-lock .mc-open {
        display: none;
      }
      .jwplayer.mc-locked .mc-lock .mc-closed {
        display: block;
      }

      /* Chưa khóa: ổ khóa hiện khi đang phóng to và thanh điều khiển của JW đang hiện. */
      .jwplayer.jw-flag-fullscreen:not(.mc-locked):not(.jw-flag-user-inactive) .mc-lock,
      .jwplayer.jw-flag-fullscreen.jw-state-paused:not(.mc-locked) .mc-lock,
      /* Đã khóa: ổ khóa chỉ hiện ít giây sau khi chạm vào phim. */
      .jwplayer.mc-locked.mc-show-lock .mc-lock {
        opacity: 1;
        pointer-events: auto;
      }

      /* Chữ báo "10s", "2x": viên nhỏ kiểu kính mờ, nhìn xuyên được xuống phim. */
      .mc-tip {
        position: absolute;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255, 255, 255, .12);
        backdrop-filter: blur(10px) saturate(140%);
        -webkit-backdrop-filter: blur(10px) saturate(140%);
        border: .5px solid rgba(255, 255, 255, .28);
        color: #fff;
        font: 500 14px sans-serif;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity .2s;
      }
      .mc-tip.mc-on {
        opacity: 1;
      }

      /* 2x: chữ đứng yên, ba mũi tên sáng lên nối tiếp nhau và nhích nhẹ sang phải. */
      .mc-chevrons {
        display: flex;
      }
      .mc-chevrons svg {
        margin-left: -1px;
        opacity: .3;
        animation: mc-run 1s ease-in-out infinite;
      }
      .mc-chevrons svg:nth-child(2) {
        animation-delay: .15s;
      }
      .mc-chevrons svg:nth-child(3) {
        animation-delay: .3s;
      }
      @keyframes mc-run {
        0%, 100% { opacity: .3; transform: translateX(0); }
        35% { opacity: 1; transform: translateX(2px); }
      }

      /* 10s: viên kính nảy nhẹ khi hiện, mũi tên trượt theo chiều tua. */
      .mc-tip.mc-skip.mc-on {
        animation: mc-pop .25s ease-out;
      }
      .mc-tip.mc-forward.mc-on svg {
        animation: mc-nudge-right .35s ease-out;
      }
      .mc-tip.mc-back.mc-on svg {
        animation: mc-nudge-left .35s ease-out;
      }
      @keyframes mc-pop {
        from { transform: translate(-50%, -50%) scale(.85); }
        60% { transform: translate(-50%, -50%) scale(1.04); }
        to { transform: translate(-50%, -50%) scale(1); }
      }
      @keyframes mc-nudge-right {
        from { transform: translateX(-4px); opacity: .3; }
        to { transform: none; opacity: 1; }
      }
      @keyframes mc-nudge-left {
        from { transform: translateX(4px); opacity: .3; }
        to { transform: none; opacity: 1; }
      }
    `);

    // ---- Gắn ổ khóa / lớp phủ / chữ báo vào trình phát ----
    function ensureUI(player) {
      if (player.querySelector(':scope > .mc-layer')) return;
      player.insertAdjacentHTML('beforeend', `
        <div class="mc-layer"></div>
        <div class="mc-lock" role="button" aria-label="Khóa / mở khóa màn hình">
          <span class="mc-open">${ICON.lockOpen}</span>
          <span class="mc-closed">${ICON.lockClosed}</span>
        </div>
        <div class="mc-tip"></div>
      `);
    }

    // Trang tạo lại trình phát khi đổi server -> kiểm tra định kỳ.
    // Đồng thời: thoát phóng to (kể cả bằng nút Back) thì tự mở khóa.
    setInterval(() => {
      document.querySelectorAll('.jwplayer').forEach((player) => {
        ensureUI(player);
        if (isLocked(player) && !isFullscreen(player)) unlock(player);
      });
    }, 1000);

    // ---- Tiện ích nhỏ ----
    const playerOf = (el) => (el && el.closest ? el.closest('.jwplayer') : null);
    const lockButtonOf = (el) => el.closest('.mc-lock');
    // Thanh điều khiển, menu cài đặt... của JW: để nó tự xử lý như bình thường.
    const isJwControl = (el) =>
      el.closest('.jw-controlbar, .jw-settings-menu, .jw-plugin, .jw-rightclick, .jw-info-overlay, .jw-shortcuts-tooltip');
    const isLocked = (player) => player.classList.contains('mc-locked');
    const isFullscreen = (player) => player.classList.contains('jw-flag-fullscreen');
    const videoOf = (player) => player.querySelector('video');

    // Chặn hẳn: trình phát và trình duyệt đều không nhận được sự kiện này.
    const stop = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };

    // ---- Chữ báo kính mờ ----
    let tipTimer = null;

    // kind = class hiệu ứng: 'mc-fast' (2x), 'mc-skip mc-forward' / 'mc-skip mc-back' (tua).
    function showTip(player, html, left, top, kind, keep) {
      const tip = player.querySelector('.mc-tip');
      if (!tip) return;
      tip.innerHTML = html;
      tip.style.left = left;
      tip.style.top = top;
      // Đặt lại class rồi ép trình duyệt vẽ lại, để hiệu ứng chạy lại từ đầu mỗi lần chạm.
      tip.className = `mc-tip ${kind}`;
      void tip.offsetWidth;
      tip.classList.add('mc-on');
      clearTimeout(tipTimer);
      if (!keep) tipTimer = setTimeout(() => tip.classList.remove('mc-on'), TIP_SHOW_MS);
    }

    function hideTip(player) {
      const tip = player.querySelector('.mc-tip');
      if (tip) tip.className = 'mc-tip';
    }

    // ---- Khóa / mở khóa ----
    let lockIconTimer = null;

    function lock(player) {
      player.classList.add('mc-locked');
      flashLockIcon(player);
    }

    function unlock(player) {
      player.classList.remove('mc-locked', 'mc-show-lock');
    }

    // Khi đã khóa: hiện ổ khóa ít giây để người xem bấm vào mở.
    function flashLockIcon(player) {
      player.classList.add('mc-show-lock');
      clearTimeout(lockIconTimer);
      lockIconTimer = setTimeout(() => player.classList.remove('mc-show-lock'), LOCK_ICON_SHOW_MS);
    }

    // ---- Giữ ngón tay: x2 ----
    let holdTimer = null;
    let heldVideo = null;
    let heldPlayer = null;
    let normalRate = 1;

    function startHold(player) {
      const video = videoOf(player);
      if (!video || video.paused) return;
      heldVideo = video;
      heldPlayer = player;
      normalRate = video.playbackRate;
      video.playbackRate = 2;
      const chevrons = `<span class="mc-chevrons">${ICON.triangle.repeat(3)}</span>`;
      showTip(player, `2x ${chevrons}`, '50%', '12%', 'mc-fast', true);
    }

    // Trả về true nếu vừa kết thúc một lần giữ x2.
    function stopHold() {
      clearTimeout(holdTimer);
      if (!heldVideo) return false;
      heldVideo.playbackRate = normalRate;
      hideTip(heldPlayer);
      heldVideo = null;
      heldPlayer = null;
      return true;
    }

    // ---- Chạm 2 lần: tua ----
    function seek(player, clientX) {
      const video = videoOf(player);
      if (!video) return;
      const rect = player.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;

      if (x < 0.4) {
        video.currentTime = Math.max(0, video.currentTime - SKIP_SECONDS);
        showTip(player, `${ICON.back} 10s`, '22%', '50%', 'mc-skip mc-back');
      } else if (x > 0.6) {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + SKIP_SECONDS);
        showTip(player, `10s ${ICON.forward}`, '78%', '50%', 'mc-skip mc-forward');
      }
    }

    // ---- Theo dõi từng lần chạm ----
    // Lúc nhấc ngón tay của lần chạm trước (để nhận ra chạm 2 lần, chạm liên tiếp).
    let lastTapUp = 0;
    // Lần chạm hiện tại là lần thứ 2 trở đi trong chuỗi chạm nhanh.
    let repeatTap = false;
    // Lần chạm hiện tại vừa là một lần giữ x2.
    let afterHold = false;
    let lockHintTimer = null;

    // Lần chạm hiện tại có phải để trình phát nhận không?
    // Không, nếu: đang khóa, là lần chạm thứ 2 trở đi, hoặc vừa giữ x2.
    const hideFromPlayer = (player) => isLocked(player) || repeatTap || afterHold;

    addEventListener('pointerdown', (e) => {
      repeatTap = false;
      afterHold = false;
      const player = playerOf(e.target);
      if (!player || !e.isPrimary) return;

      // Ổ khóa của script: chỉ không cho trình phát thấy, để click vẫn xảy ra.
      if (lockButtonOf(e.target)) {
        e.stopImmediatePropagation();
        return;
      }
      if (isJwControl(e.target)) return;

      if (Date.now() - lastTapUp < DOUBLE_TAP_MS) {
        repeatTap = true;
        clearTimeout(lockHintTimer);
        stop(e);
        return;
      }

      if (isLocked(player)) stop(e);
      holdTimer = setTimeout(() => startHold(player), HOLD_MS);
    }, true);

    addEventListener('pointerup', (e) => {
      const player = playerOf(e.target);

      if (stopHold()) {
        afterHold = true;
        if (player) stop(e);
        return;
      }
      if (!player || !e.isPrimary || lockButtonOf(e.target) || isJwControl(e.target)) return;

      if (hideFromPlayer(player)) stop(e);

      if (repeatTap) {
        seek(player, e.clientX);
      } else if (isLocked(player)) {
        // Chạm 1 lần khi khóa: hiện ổ khóa (chờ xem có phải chạm 2 lần không).
        clearTimeout(lockHintTimer);
        lockHintTimer = setTimeout(() => flashLockIcon(player), DOUBLE_TAP_MS);
      }
      lastTapUp = Date.now();
    }, true);

    addEventListener('pointercancel', stopHold, true);

    // Giữ lâu: không cho JW Player mở menu "chuột phải", không cho trình duyệt mở menu ảnh/video.
    addEventListener('contextmenu', (e) => {
      const player = playerOf(e.target);
      if (player && !isJwControl(e.target)) stop(e);
    }, true);

    // Các sự kiện còn lại của một lần chạm (JW Player trên Android nghe touchstart/touchend).
    function follow(e) {
      const player = playerOf(e.target);
      if (!player) return;

      if (lockButtonOf(e.target)) {
        e.stopImmediatePropagation();
        if (e.type !== 'click') return;
        e.preventDefault();
        if (isLocked(player)) unlock(player);
        else lock(player);
        return;
      }
      if (isJwControl(e.target)) return;

      if (hideFromPlayer(player)) stop(e);
    }

    for (const type of ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click', 'dblclick']) {
      addEventListener(type, follow, { capture: true, passive: false });
    }
  }

  // ============================================================
  //  TIỆN ÍCH CHUNG
  // ============================================================
  // Thêm CSS vào trang (chờ <head> có sẵn nếu script chạy quá sớm).
  function addStyle(css) {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    };
    if (document.head) add();
    else document.addEventListener('DOMContentLoaded', add);
  }
})();
