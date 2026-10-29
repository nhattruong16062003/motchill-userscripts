// ==UserScript==
// @name         Motchill - lịch sử xem
// @namespace    motchill-history
// @version      1.0
// @author       zic
// @homepageURL  https://github.com/nhattruong16062003/motchill-userscripts
// @updateURL    https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/motchill-history.user.js
// @downloadURL  https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/motchill-history.user.js
// @description  Nhớ chỗ đang xem của từng phim trên motchilltu.com: mở lại là tự tua về chỗ cũ, trang chủ có hàng "Đang xem dở".
// @match        https://motchilltu.com/*
// @run-at       document-start
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(() => {
  'use strict';

  // ============================================================
  //  CÀI ĐẶT
  // ============================================================
  const MAX_SHOWS = 20;            // Giữ tối đa 20 phim gần nhất.
  const SAVE_EVERY_MS = 5000;      // Đang xem: lưu vị trí 5 giây một lần.
  const MIN_RESUME_SECONDS = 10;   // Chưa xem quá 10 giây thì không tua lại.
  const FINISHED_RATIO = 0.95;     // Xem quá 95% tập = xem xong.
  const RESUME_TIP_MS = 6000;      // Viên "Tiếp tục từ..." tự ẩn sau 6 giây.
  const STORE_KEY = 'history';

  // Lịch sử nằm trong kho riêng của Tampermonkey / Userscripts (GM.getValue / GM.setValue),
  // không phải localStorage của trang: không mất khi xóa dữ liệu trang hay khi trang đổi tên miền.
  // Mỗi phim một mục: { slug, title, episode, path, poster, position, duration, updatedAt }.
  // path = đường dẫn tập, không kèm tên miền, ví dụ /xem-phim/thuong-cong-chua/tap-01-sv-0/.

  // ============================================================
  //  KHO LƯU
  // ============================================================
  let shows = [];
  const loaded = GM.getValue(STORE_KEY, '[]').then((raw) => {
    try {
      shows = JSON.parse(raw) || [];
    } catch (e) {
      shows = [];
    }
  });

  function persist() {
    shows.sort((a, b) => b.updatedAt - a.updatedAt);
    shows = shows.slice(0, MAX_SHOWS);
    GM.setValue(STORE_KEY, JSON.stringify(shows));
  }

  const findShow = (slug) => shows.find((s) => s.slug === slug);

  function upsertShow(entry) {
    shows = shows.filter((s) => s.slug !== entry.slug);
    shows.push({ ...entry, updatedAt: Date.now() });
    persist();
  }

  function removeShow(slug) {
    shows = shows.filter((s) => s.slug !== slug);
    persist();
  }

  // ============================================================
  //  TẮT CƠ CHẾ LƯU VỊ TRÍ CỦA TRANG
  //  Trang lưu vào localStorage 'OPCMS-PlayerPosition-<số tập>' (dùng chung cho mọi phim)
  //  và chỉ lưu lúc đóng trang. Xóa đi để trang không tua đè lên vị trí của script.
  // ============================================================
  Object.keys(localStorage)
    .filter((key) => key.startsWith('OPCMS-PlayerPosition-'))
    .forEach((key) => localStorage.removeItem(key));

  // ============================================================
  //  CHỌN VIỆC THEO TRANG
  // ============================================================
  const watchMatch = location.pathname.match(/^\/xem-phim\/([^/]+)\/([^/]+)\/?$/);

  document.addEventListener('DOMContentLoaded', () => {
    loaded.then(() => {
      if (watchMatch) setUpWatchPage(watchMatch[1]);
      else if (location.pathname === '/') addContinueRow();
    });
  });

  // ============================================================
  //  TRANG XEM PHIM: tự tua về chỗ cũ và lưu vị trí
  // ============================================================
  function setUpWatchPage(slug) {
    addStyle(PLAYER_CSS);

    const path = location.pathname;
    const current = document.querySelector('.list-episode a.current');
    const info = {
      slug,
      path,
      title: readTitle(slug),
      episode: current ? 'Tập ' + current.textContent.trim() : '',
      poster: (document.querySelector('meta[property="og:image"]') || {}).content || '',
    };

    // Tập kế tiếp = link ngay sau tập đang xem, trong cùng danh sách (Vietsub / Thuyết minh...).
    const next = current ? current.nextElementSibling : null;
    const nextEpisode = next && next.matches('a[href]')
      ? { path: new URL(next.href).pathname, episode: 'Tập ' + next.textContent.trim() }
      : null;

    const saved = findShow(slug);
    const resumeAt = saved && saved.path === path ? saved.position : 0;

    // Trang tạo lại trình phát khi đổi server -> kiểm tra định kỳ để gắn vào video mới.
    let attached = null;
    setInterval(() => {
      const video = document.querySelector('.jwplayer video');
      if (video && video !== attached) {
        attached = video;
        watchVideo(video, info, resumeAt, nextEpisode);
      }
    }, 1000);
  }

  function readTitle(slug) {
    const link = document.querySelector(`a[href*="/phim/${slug}/"]`);
    if (link && link.textContent.trim()) return link.textContent.trim();
    return document.title.replace(/^Phim\s+/, '').split(' - ')[0];
  }

  function watchVideo(video, info, resumeAt, nextEpisode) {
    let ready = false;      // Chỉ lưu sau khi đã quyết định có tua hay không.
    let lastSave = 0;
    let finished = false;

    function start() {
      if (ready) return;
      ready = true;
      const duration = video.duration || 0;
      const canResume = resumeAt > MIN_RESUME_SECONDS && (!duration || resumeAt < duration * FINISHED_RATIO);
      if (canResume) {
        video.currentTime = resumeAt;
        showResumeTip(video, resumeAt);
      }
    }

    function save() {
      if (!ready || finished) return;
      const duration = video.duration || 0;
      const position = video.currentTime || 0;
      if (duration && position >= duration * FINISHED_RATIO) return markFinished();
      if (position < MIN_RESUME_SECONDS) return;
      lastSave = Date.now();
      upsertShow({ ...info, position: Math.floor(position), duration: Math.floor(duration) });
    }

    // Xem xong: chuyển thẻ sang tập kế tiếp (vị trí 0), hết tập thì xóa khỏi danh sách.
    function markFinished() {
      finished = true;
      if (nextEpisode) {
        upsertShow({ ...info, ...nextEpisode, position: 0, duration: 0 });
      } else {
        removeShow(info.slug);
      }
    }

    if (video.readyState >= 1) start();
    video.addEventListener('loadedmetadata', start);
    video.addEventListener('timeupdate', () => {
      if (Date.now() - lastSave >= SAVE_EVERY_MS) save();
    });
    video.addEventListener('pause', save);
    video.addEventListener('ended', () => {
      if (!finished) markFinished();
    });
    // Chuyển app, tắt màn hình, rời trang: lưu ngay (không đợi sự kiện đóng trang).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
    addEventListener('pagehide', save);
  }

  // ---- Viên kính mờ "Tiếp tục từ mm:ss" + "Xem từ đầu" ----
  function showResumeTip(video, seconds) {
    const player = video.closest('.jwplayer');
    if (!player) return;
    player.querySelectorAll(':scope > .mh-pill').forEach((el) => el.remove());

    player.insertAdjacentHTML('beforeend', `
      <div class="mh-pill mh-resume" role="button">${ICON.resume}<span>Tiếp tục từ ${formatTime(seconds)}</span><i class="mh-countdown"></i></div>
      <div class="mh-pill mh-restart" role="button">${ICON.restart}<span>Xem từ đầu</span></div>
    `);
    const pills = player.querySelectorAll(':scope > .mh-pill');
    const hide = () => pills.forEach((el) => el.remove());
    const timer = setTimeout(hide, RESUME_TIP_MS);

    player.querySelector('.mh-resume').addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(timer);
      hide();
    });
    player.querySelector('.mh-restart').addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(timer);
      video.currentTime = 0;
      hide();
    });
  }

  // ============================================================
  //  TRANG CHỦ: hàng "Đang xem dở"
  // ============================================================
  function addContinueRow() {
    const anchor = document.querySelector('.list-films');
    if (!anchor || !shows.length) return;
    addStyle(HOME_CSS);

    const section = document.createElement('div');
    section.className = 'mh-continue';
    section.innerHTML = `<h2 class="mh-heading">${ICON.history}Đang xem dở</h2><div class="mh-row"></div>`;
    anchor.parentElement.insertBefore(section, anchor);

    const row = section.querySelector('.mh-row');
    const render = () => {
      if (!shows.length) return section.remove();
      row.innerHTML = shows.map(cardHtml).join('');
    };
    render();

    // Dấu × xóa phim khỏi danh sách; bấm chỗ khác trên thẻ là mở tập đó (link thường).
    row.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (!remove) return;
      e.preventDefault();
      removeShow(remove.dataset.remove);
      render();
    });
  }

  function cardHtml(show) {
    const percent = show.duration ? Math.min(100, Math.round((show.position / show.duration) * 100)) : 0;
    const left = show.duration ? Math.max(1, Math.round((show.duration - show.position) / 60)) : 0;
    const note = show.position ? `còn ${left} phút` : 'chưa xem';
    return `
      <a class="mh-card" href="${escapeHtml(show.path)}">
        <span class="mh-thumb" style="background-image:url('${escapeHtml(show.poster)}')">
          <span class="mh-remove" data-remove="${escapeHtml(show.slug)}" role="button" aria-label="Xóa khỏi danh sách">${ICON.close}</span>
          <span class="mh-progress"><i style="width:${percent}%"></i></span>
        </span>
        <span class="mh-title">${escapeHtml(show.title)}</span>
        <span class="mh-note">${escapeHtml(show.episode)} · ${note}</span>
      </a>`;
  }

  // ============================================================
  //  GIAO DIỆN
  // ============================================================
  const svg = (paths, size = 16) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const ICON = {
    resume: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'),
    restart: svg('<path d="M19 20L9 12l10-8z"/><path d="M5 5v14"/>'),
    history: svg('<path d="M12 8v4l2 2"/><path d="M3.05 11a9 9 0 1 1 .5 4"/><path d="M3 4v7h7"/>', 18),
    close: svg('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>', 12),
  };

  const PLAYER_CSS = `
    /* Viên kính mờ giống chữ báo 10s / 2x của script chặn quảng cáo. */
    .mh-pill {
      position: absolute;
      bottom: 56px;
      z-index: 2147483640;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(255, 255, 255, .12);
      backdrop-filter: blur(10px) saturate(140%);
      -webkit-backdrop-filter: blur(10px) saturate(140%);
      border: .5px solid rgba(255, 255, 255, .28);
      color: #fff;
      font: 500 13px sans-serif;
      white-space: nowrap;
      cursor: pointer;
      animation: mh-in .25s ease-out;
    }
    .mh-resume { left: 12px; }
    .mh-restart { right: 12px; }
    /* Vạch mờ dần ở chân viên "Tiếp tục từ...", cho biết còn bao lâu thì tự ẩn. */
    .mh-countdown {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 0;
      height: 2px;
      border-radius: 2px;
      background: rgba(255, 255, 255, .55);
      transform-origin: left;
      animation: mh-countdown ${RESUME_TIP_MS}ms linear forwards;
    }
    @keyframes mh-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
    }
    @keyframes mh-countdown {
      to { transform: scaleX(0); }
    }
  `;

  const HOME_CSS = `
    .mh-continue {
      margin: 16px 0 8px;
    }
    .mh-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0 0 10px;
      color: #d9a86c;
      font-size: 22px;
      font-weight: 400;
      text-transform: uppercase;
    }
    /* Hàng ngang, vuốt sang để xem thêm. */
    .mh-row {
      display: flex;
      gap: 12px;
      overflow-x: auto;
      padding-bottom: 6px;
      scrollbar-width: none;
    }
    .mh-card {
      flex: 0 0 150px;
      color: #e9e9ee;
      text-decoration: none;
    }
    .mh-thumb {
      position: relative;
      display: block;
      height: 90px;
      border-radius: 8px;
      overflow: hidden;
      background: #1b1e27 center / cover no-repeat;
    }
    .mh-remove {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(0, 0, 0, .5);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* Thanh đỏ: đã xem tới đâu. */
    .mh-progress {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 3px;
      background: rgba(255, 255, 255, .25);
    }
    .mh-progress i {
      display: block;
      height: 3px;
      background: #e5484d;
    }
    .mh-title {
      display: block;
      margin-top: 6px;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mh-note {
      display: block;
      font-size: 12px;
      color: #9a9aa5;
    }
  `;

  // ============================================================
  //  TIỆN ÍCH CHUNG
  // ============================================================
  function formatTime(seconds) {
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
