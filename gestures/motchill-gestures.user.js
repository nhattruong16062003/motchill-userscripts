// ==UserScript==
// @name         Motchill - thao tác trình phát
// @namespace    motchill-gestures
// @version      1.5.1
// @author       zic
// @homepageURL  https://github.com/nhattruong16062003/motchill-userscripts/tree/main/gestures
// @updateURL    https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/gestures/motchill-gestures.user.js
// @downloadURL  https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/gestures/motchill-gestures.user.js
// @description  Trình phát Motchill (mọi tên miền): chạm 2 lần tua 10 giây, giữ để xem x2, khóa màn hình khi xem toàn màn hình, nút bỏ qua giới thiệu và tập tiếp theo.
// @match        https://motchillsa.com/*
// @match        https://motchilltu.com/*
// @include      /^https?:\/\/[^\/?#]*motchill[^\/?#]*\//
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  addPlayerFeatures();

  // ============================================================
  //  TRÌNH PHÁT (JW Player của motchilltu.com)
  //   - Chạm 2 lần bên trái / phải: lùi / tới 10 giây (chạm tiếp để tua thêm)
  //   - Giữ ngón tay: tốc độ x2, thả ra trở lại như cũ
  //   - Ổ khóa nhỏ ở mép trái, chỉ hiện khi phóng to. Khi khóa: chỉ còn tua
  //     10 giây và giữ x2; muốn dừng hay thu nhỏ phải mở khóa trước.
  //   - Đầu phim: nút "Bỏ qua giới thiệu" (tới 1:30). 3 phút cuối: nút "Tập tiếp theo".
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
    const INTRO_SECONDS = 90;        // Bỏ qua giới thiệu = tua tới 1:30.
    const NEXT_SHOW_SECONDS = 180;   // Nút tập tiếp theo hiện trong 3 phút cuối.
    const MIN_EPISODE_SECONDS = 600; // Không hiện nút với video ngắn (video giả lúc đổi server...).

    // ---- Biểu tượng (SVG nét mảnh, màu theo chữ) ----
    const svg = (paths, size = 16) =>
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    const ICON = {
      lockOpen: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>', 24),
      lockClosed: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 24),
      back: svg('<path d="M11 7l-5 5 5 5"/><path d="M17 7l-5 5 5 5"/>'),
      forward: svg('<path d="M7 7l5 5-5 5"/><path d="M13 7l5 5-5 5"/>'),
      next: svg('<path d="M6 6l9 6-9 6z"/><path d="M18 6v12"/>'),
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

      /* Ổ khóa: tròn 48 px, cách mép trái 48 px cho vừa tầm ngón cái khi cầm ngang,
         mặc định ẩn. */
      .mc-lock {
        position: absolute;
        top: 50%;
        left: 48px;
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

      /* Nút "Bỏ qua giới thiệu" / "Tập tiếp theo": cùng kiểu kính mờ với "10s", "2x",
         góc phải, nằm trên thanh điều khiển. */
      .mc-action {
        position: absolute;
        right: 16px;
        bottom: 64px;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, .12);
        backdrop-filter: blur(10px) saturate(140%);
        -webkit-backdrop-filter: blur(10px) saturate(140%);
        border: .5px solid rgba(255, 255, 255, .28);
        color: #fff;
        font: 500 14px sans-serif;
        white-space: nowrap;
        animation: mc-pop-in .25s ease-out;
      }
      /* Khi khóa vẫn còn nút "Tập tiếp theo" (nằm trên lớp phủ nên bấm được). */
      .mc-action[data-action=""],
      .jwplayer.mc-locked .mc-action[data-action="intro"] {
        display: none;
      }
      @keyframes mc-pop-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: none; }
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
        <div class="mc-action" role="button" data-action=""></div>
      `);
    }

    // ---- Bỏ qua giới thiệu / tập tiếp theo ----
    // Tập kế tiếp = link ngay sau tập đang xem, trong cùng danh sách (Vietsub / Thuyết minh...).
    function nextEpisodeLink() {
      const current = document.querySelector('.list-episode a.current');
      const next = current && current.nextElementSibling;
      return next && next.matches('a[href]') ? next : null;
    }

    function nextEpisodeUrl() {
      const next = nextEpisodeLink();
      return next ? next.href : null;
    }

    let goingNext = false;
    function goNext(player) {
      const next = nextEpisodeLink();
      if (!next || goingNext) return;
      const url = next.href;
      if (!isFullscreen(player)) {
        location.href = url;
        return;
      }

      goingNext = true;
      try {
        const xhr = new XMLHttpRequest();
        // Trang ghi đè window.fetch nên phải dùng XHR.
        xhr.responseType = 'document';
        xhr.onload = () => {
          try {
            if (xhr.status < 200 || xhr.status >= 300 || !xhr.responseXML) throw new Error('Không tải được tập');
            const doc = xhr.responseXML;
            const servers = [...doc.querySelectorAll('.tip-change-server .streaming-server')];
            const currentServers = [...document.querySelectorAll('.tip-change-server .streaming-server')];
            const index = currentServers.findIndex((button) => button.classList.contains('btn-success'));
            const playable = (button) => button && /^(m3u8|mp4)$/.test(button.dataset.type) && button.dataset.link;
            const server = index >= 0 && playable(servers[index]) ? servers[index] : servers.find(playable);
            const tip = document.querySelector('.tip-change-server');
            const nextTip = doc.querySelector('.tip-change-server');
            if (!server || !tip || !nextTip || !window.jwplayer) throw new Error('Không có server');
            const jw = jwplayer(player.id);
            if (!jw || !jw.load || !jw.play) throw new Error('Không có trình phát');

            jw.load([{ file: server.dataset.link.replace(/^http:\/\//i, 'https://'), image: jw.getPlaylistItem().image }]);
            jw.play();
            history.pushState(null, '', url);
            document.title = doc.title;
            document.querySelector('.list-episode a.current').classList.remove('current');
            next.classList.add('current');
            tip.innerHTML = nextTip.innerHTML;
            tip.querySelectorAll('.streaming-server.btn-success').forEach((button) => button.classList.remove('btn-success'));
            tip.querySelectorAll('.streaming-server')[servers.indexOf(server)].classList.add('btn-success');
            for (const selector of ['.breadcrumbs li.active', '.chapter-name']) {
              const currentLabel = document.querySelector(selector);
              const nextLabel = doc.querySelector(selector);
              if (currentLabel && nextLabel) currentLabel.textContent = nextLabel.textContent;
            }
            addEventListener('popstate', () => location.reload(), { once: true });
            goingNext = false;
          } catch (e) {
            location.href = url;
          }
        };
        xhr.onerror = xhr.onabort = xhr.ontimeout = () => { location.href = url; };
        xhr.open('GET', url);
        xhr.timeout = 15000;
        xhr.send();
      } catch (e) {
        location.href = url;
      }
    }

    function updateAction(player) {
      const video = videoOf(player);
      const button = player.querySelector(':scope > .mc-action');
      if (!video || !button) return;
      const time = video.currentTime;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;

      let action = '';
      if (duration >= MIN_EPISODE_SECONDS) {
        if (time > 0 && time < INTRO_SECONDS - 5) action = 'intro';
        else if (duration - time < NEXT_SHOW_SECONDS && nextEpisodeUrl()) action = 'next';
      }
      if (button.dataset.action === action) return;
      button.dataset.action = action;
      button.innerHTML = action === 'intro' ? `Bỏ qua giới thiệu ${ICON.forward}`
        : action === 'next' ? `Tập tiếp theo ${ICON.next}` : '';
    }

    function runAction(player, button) {
      const video = videoOf(player);
      if (button.dataset.action === 'intro' && video) video.currentTime = INTRO_SECONDS;
      if (button.dataset.action === 'next') goNext(player);
      updateAction(player);
    }

    // Trang tạo lại trình phát khi đổi server -> kiểm tra định kỳ.
    // Đồng thời: thoát phóng to (kể cả bằng nút Back) thì tự mở khóa.
    setInterval(() => {
      if (restorePlayer && !restorePlayer.isConnected) clearRestore();
      document.querySelectorAll('.jwplayer').forEach((player) => {
        ensureUI(player);
        updateAction(player);
        if (isLocked(player) && !isFullscreen(player)) unlock(player);
        if (player.dataset.mcNext || !window.jwplayer) return;
        try {
          const jw = jwplayer(player.id);
          if (!jw || !jw.on || !jw.off || !jw._events || !jw._events.complete) return;
          const redirects = jw._events.complete.filter((h) => /location\.href/.test(h.callback));
          if (!redirects.length) return;
          redirects.forEach((h) => jw.off('complete', h.callback));
          jw.on('complete', () => goNext(player));
          player.dataset.mcNext = '1';
        } catch (e) {
          // Trình phát chưa sẵn sàng: thử lại ở lần kiểm tra sau.
        }
      });
    }, 500);

    // ---- Tiện ích nhỏ ----
    const playerOf = (el) => (el && el.closest ? el.closest('.jwplayer') : null);
    // Nút của script (ổ khóa, bỏ qua giới thiệu, tập tiếp theo).
    const buttonOf = (el) => el.closest('.mc-lock, .mc-action');
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

    // Firefox thoát toàn màn hình khi chuyển app / PiP; thử lại khi quay về.
    let fullscreenPlayer = null;
    let restorePlayer = null;
    let restoreLocked = false;
    let lastReturn = 0;

    function clearRestore(restoredPlayer) {
      if (restoredPlayer === restorePlayer && restoreLocked) lock(restoredPlayer);
      if (restorePlayer) hideTip(restorePlayer);
      restorePlayer = null;
      restoreLocked = false;
    }

    function requestRestore(player) {
      player.requestFullscreen().then(() => {
        if (document.fullscreenElement === player) clearRestore(player);
      }, () => {});
    }

    function tryRestore() {
      if (!restorePlayer) return;
      if (!restorePlayer.isConnected) return clearRestore();
      if (!document.hidden && document.hasFocus() && !document.fullscreenElement) requestRestore(restorePlayer);
    }

    document.addEventListener('fullscreenchange', () => {
      const current = document.fullscreenElement;
      if (current) {
        clearRestore(current);
        fullscreenPlayer = current.matches('.jwplayer') ? current : null;
      } else if (fullscreenPlayer) {
        const player = fullscreenPlayer;
        fullscreenPlayer = null;
        const locked = isLocked(player);
        if (locked) unlock(player);
        if (player.isConnected && (document.hidden || !document.hasFocus() || Date.now() - lastReturn < 3000)) {
          restorePlayer = player;
          restoreLocked = locked;
          lastTapUp = 0;
          showTip(player, 'Chạm để xem toàn màn hình', '50%', '50%', '', true);
          tryRestore();
        }
      }
    });
    addEventListener('blur', () => { lastReturn = 0; });
    addEventListener('focus', () => {
      lastReturn = Date.now();
      tryRestore();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) lastReturn = 0;
      else {
        lastReturn = Date.now();
        tryRestore();
      }
    });

    // ---- Khóa / mở khóa ----
    let lockIconTimer = null;

    function lock(player) {
      player.classList.add('mc-locked');
      showLockIcon(player);
    }

    function unlock(player) {
      clearTimeout(lockIconTimer);
      player.classList.remove('mc-locked', 'mc-show-lock');
    }

    // Khi đã khóa: hiện ổ khóa ít giây để người xem bấm vào mở.
    function showLockIcon(player) {
      player.classList.add('mc-show-lock');
      clearTimeout(lockIconTimer);
      lockIconTimer = setTimeout(() => player.classList.remove('mc-show-lock'), LOCK_ICON_SHOW_MS);
    }

    // Chạm 1 lần khi đã khóa: ổ khóa đang ẩn thì hiện, đang hiện thì ẩn (giống app xem phim).
    function toggleLockIcon(player) {
      if (player.classList.contains('mc-show-lock')) {
        clearTimeout(lockIconTimer);
        player.classList.remove('mc-show-lock');
      } else {
        showLockIcon(player);
      }
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
    // Lần chạm dành riêng cho việc bật lại toàn màn hình.
    let restoreTap = false;
    // Ngón tay chạm xuống đúng nút của script đang hiện. Chạm vào chỗ trống làm JW hiện thanh điều khiển
    // (và ổ khóa) ngay dưới ngón tay, nên lúc nhấc tay cú click có thể rơi trúng ổ khóa: không tính.
    let pressedButton = false;
    let lockHintTimer = null;

    // Lần chạm hiện tại có phải để trình phát nhận không?
    // Không, nếu: đang khóa, là lần chạm thứ 2 trở đi, hoặc vừa giữ x2.
    const hideFromPlayer = (player) => isLocked(player) || repeatTap || afterHold || restoreTap;

    addEventListener('pointerdown', (e) => {
      repeatTap = false;
      afterHold = false;
      restoreTap = false;
      pressedButton = !!buttonOf(e.target);
      const player = playerOf(e.target);
      if (!player || !e.isPrimary) return;

      // Lần chạm thứ 2 trở đi luôn là tua, kể cả khi ngón tay rơi đúng ổ khóa hay nút của JW Player
      // (chạm lần 1 làm hiện các nút đó ngay dưới ngón tay).
      if (Date.now() - lastTapUp < DOUBLE_TAP_MS) {
        repeatTap = true;
        clearTimeout(lockHintTimer);
        stop(e);
        return;
      }

      // Nút của script: chỉ không cho trình phát thấy, để click vẫn xảy ra.
      if (buttonOf(e.target)) {
        e.stopImmediatePropagation();
        return;
      }
      if (isJwControl(e.target)) return;

      if (restorePlayer === player) {
        restoreTap = true;
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
      if (!player || !e.isPrimary) return;
      if (restoreTap) {
        stop(e);
        lastTapUp = 0;
        if (restorePlayer === player) requestRestore(player);
        return;
      }
      if (!repeatTap && (buttonOf(e.target) || isJwControl(e.target))) return;

      if (hideFromPlayer(player)) stop(e);

      if (repeatTap) {
        seek(player, e.clientX);
      } else if (isLocked(player)) {
        // Chạm 1 lần khi khóa: hiện/ẩn ổ khóa (chờ xem có phải chạm 2 lần không).
        clearTimeout(lockHintTimer);
        lockHintTimer = setTimeout(() => toggleLockIcon(player), DOUBLE_TAP_MS);
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

      const button = buttonOf(e.target);
      if (button && !repeatTap && !restoreTap) {
        e.stopImmediatePropagation();
        if (!pressedButton) return e.preventDefault();
        if (e.type !== 'click') return;
        e.preventDefault();
        if (button.classList.contains('mc-action')) runAction(player, button);
        else if (isLocked(player)) unlock(player);
        else lock(player);
        return;
      }
      if (isJwControl(e.target) && !repeatTap && !restoreTap) return;

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
