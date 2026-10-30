// ==UserScript==
// @name         Motchill - lịch sử xem
// @namespace    motchill-history
// @version      1.9
// @author       zic
// @homepageURL  https://github.com/nhattruong16062003/motchill-userscripts/tree/main/history
// @updateURL    https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/history/motchill-history.user.js
// @downloadURL  https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/history/motchill-history.user.js
// @description  Nhớ chỗ đang xem của từng phim trên Motchill (mọi tên miền): mở lại là tự tua về chỗ cũ, trang chủ có hàng "Đang xem dở".
// @match        https://motchillsa.com/*
// @match        https://motchilltu.com/*
// @include      /^https?:\/\/[^\/?#]*motchill[^\/?#]*\//
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
  const MIN_EPISODE_SECONDS = 120; // Video ngắn hơn 2 phút (video giả lúc đổi server...) không phải tập phim.
  const STORE_KEY = 'history';

  // Lịch sử nằm trong kho riêng của Tampermonkey / Userscripts (GM.getValue / GM.setValue),
  // không phải localStorage của trang: không mất khi xóa dữ liệu trang hay khi trang đổi tên miền.
  // Mỗi phim một mục: { slug, title, episode, path, poster, position, duration, updatedAt }.
  // path = đường dẫn tập, không kèm tên miền, ví dụ /xem-phim/thuong-cong-chua/tap-01-sv-0/.

  // ============================================================
  //  KHO LƯU
  // ============================================================
  let shows = [];

  function parse(raw) {
    try {
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((s) => s && s.slug) : [];
    } catch (e) {
      return [];
    }
  }

  const reload = () => GM.getValue(STORE_KEY, '[]').then((raw) => { shows = parse(raw); });
  const loaded = reload();

  // Mỗi lần sửa đều đọc lại kho trước (tab khác, hoặc trang quay lại bằng nút Back,
  // có thể đang giữ bản cũ), và sửa lần lượt từng cái một.
  let queue = loaded;
  function change(fn) {
    queue = queue.then(reload).then(() => {
      fn();
      shows.sort((a, b) => b.updatedAt - a.updatedAt);
      shows = shows.slice(0, MAX_SHOWS);
      return GM.setValue(STORE_KEY, JSON.stringify(shows));
    });
    return queue;
  }

  const findShow = (slug) => shows.find((s) => s.slug === slug);

  const upsertShow = (entry) => change(() => {
    shows = shows.filter((s) => s.slug !== entry.slug);
    shows.push({ ...entry, updatedAt: Date.now() });
  });

  const removeShow = (slug) => change(() => {
    shows = shows.filter((s) => s.slug !== slug);
  });

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

  // Trang tải nhanh (từ bộ nhớ đệm) có thể đã xong trước khi script được nạp:
  // khi đó chạy luôn, không đợi sự kiện DOMContentLoaded nữa.
  function onPageReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  onPageReady(() => {
    addMenuItem();
    loaded.then(() => {
      if (watchMatch) setUpWatchPage();
      else if (location.pathname === '/') addContinueRow();
    });
  });

  // ============================================================
  //  TRANG XEM PHIM: tự tua về chỗ cũ và lưu vị trí
  // ============================================================
  function setUpWatchPage() {
    addStyle(PLAYER_CSS);

    // Trang tạo lại trình phát khi đổi server -> kiểm tra định kỳ để gắn vào video mới.
    // Mỗi video mới tua về vị trí đã lưu GẦN NHẤT (không phải vị trí lúc mở trang),
    // và chỉ video đang hiện mới được lưu.
    let attached = null;
    let attachedPath = null;
    let saving = Promise.resolve();
    setInterval(() => {
      const video = document.querySelector('.jwplayer video');
      const path = location.pathname;
      if (!video || (video === attached && path === attachedPath)) return;
      const match = path.match(/^\/xem-phim\/([^/]+)\/([^/]+)\/?$/);
      if (!match) return;
      const slug = match[1];
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

      attached = video;
      attachedPath = path;
      saving.then(() => {
        if (attached !== video || location.pathname !== path) return;
        const saved = findShow(slug);
        const resumeAt = saved && saved.path === path ? saved.position : 0;
        watchVideo(video, info, resumeAt, nextEpisode, () => attached === video && location.pathname === path, (p) => { saving = p; });
      });
    }, 1000);
  }

  function readTitle(slug) {
    const link = document.querySelector(`a[href*="/phim/${slug}/"]`);
    if (link && link.textContent.trim()) return link.textContent.trim();
    return document.title.replace(/^Phim\s+/, '').split(' - ')[0];
  }

  function watchVideo(video, info, resumeAt, nextEpisode, isActive, onSave) {
    let ready = false;      // Chỉ lưu sau khi đã quyết định có tua hay không.
    let lastSave = 0;
    let finished = false;

    // Trình phát tải thông tin phim ngay khi mở trang: lúc đó tua về chỗ cũ và cho phim chạy luôn,
    // không cần bấm Play hay chọn gì.
    // Quảng cáo video của trang chạy trong cùng thẻ <video>: không coi là phim.
    const playingAd = () => !!video.closest('.jw-flag-ads');

    function start() {
      if (ready || !isActive() || playingAd()) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      if (duration && duration < MIN_EPISODE_SECONDS) return; // Video giả: đợi phim thật nạp vào.
      ready = true;
      const canResume = resumeAt > MIN_RESUME_SECONDS && (!duration || resumeAt < duration * FINISHED_RATIO);
      if (!canResume) return;
      video.currentTime = resumeAt;
      autoPlay(video);
    }

    function save() {
      if (!ready || !isActive() || playingAd()) return;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const position = video.currentTime || 0;
      // Lỡ tua qua đoạn cuối rồi tua ngược lại: tính là đang xem tiếp, không phải đã xem xong.
      if (finished && duration && position < duration * FINISHED_RATIO - 30) finished = false;
      if (finished || (duration && duration < MIN_EPISODE_SECONDS)) return;
      if (duration && position >= duration * FINISHED_RATIO) return markFinished();
      if (position < MIN_RESUME_SECONDS) return;
      lastSave = Date.now();
      onSave(upsertShow({ ...info, position: Math.floor(position), duration: Math.floor(duration) }));
    }

    // Xem xong: chuyển thẻ sang tập kế tiếp (vị trí 0), hết tập thì xóa khỏi danh sách.
    function markFinished() {
      if (!isActive()) return;
      finished = true;
      onSave(nextEpisode
        ? upsertShow({ ...info, ...nextEpisode, position: 0, duration: 0 })
        : removeShow(info.slug));
    }

    if (video.readyState >= 1) start();
    video.addEventListener('loadedmetadata', start);
    video.addEventListener('timeupdate', () => {
      if (Date.now() - lastSave >= SAVE_EVERY_MS) save();
    });
    video.addEventListener('pause', save);
    // Trang gỡ video cũ khi đổi server cũng làm video phát 'ended': chỉ tin khi đã thật sự tới gần cuối.
    video.addEventListener('ended', () => {
      const duration = video.duration;
      if (!finished && !playingAd() && Number.isFinite(duration) && duration >= MIN_EPISODE_SECONDS && video.currentTime >= duration * FINISHED_RATIO) {
        markFinished();
      }
    });
    // Chuyển app, tắt màn hình, rời trang: lưu ngay (không đợi sự kiện đóng trang).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
    addEventListener('pagehide', save);
  }

  // ---- Tự chạy phim sau khi tua ----
  // Firefox mặc định chặn video tự phát CÓ TIẾNG khi trang vừa mở. Bị chặn thì cho chạy tắt tiếng,
  // hiện viên "Chạm để bật tiếng"; chạm bất kỳ đâu trên phim là bật lại tiếng.
  function autoPlay(video) {
    const attempt = video.play();
    if (!attempt) return;
    attempt.catch(() => {
      video.muted = true;
      video.play().then(() => offerUnmute(video)).catch(() => {});
    });
  }

  function offerUnmute(video) {
    const player = video.closest('.jwplayer');
    if (!player) return;
    player.insertAdjacentHTML('beforeend',
      `<div class="mh-pill" role="button">${ICON.muted}<span>Chạm để bật tiếng</span></div>`);
    const pill = player.querySelector(':scope > .mh-pill');

    const unmute = () => {
      video.muted = false;
      pill.remove();
      player.removeEventListener('click', unmute, true);
    };
    player.addEventListener('click', unmute, true);
  }

  // ============================================================
  //  MENU: mục "Lịch sử xem" ngay dưới TV SHOWS (menu ba gạch trên điện thoại và menu máy tính)
  //  Mở trang chủ và cuộn tới hàng "Đang xem dở". Thêm '?lich-su' để trang luôn tải lại
  //  (nếu chỉ đổi '#', bấm từ trang chủ thì menu không đóng).
  // ============================================================
  const HISTORY_ID = 'dang-xem-do';

  function addMenuItem() {
    document.querySelectorAll('li > a[href="/danh-sach/tv-shows/"]').forEach((link) => {
      const item = link.parentElement.cloneNode(false); // Giữ class của trang để cùng kiểu chữ.
      item.innerHTML = `<a title="Lịch sử xem" href="/?lich-su#${HISTORY_ID}">LỊCH SỬ XEM</a>`;
      link.parentElement.after(item);
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
    section.id = HISTORY_ID;
    section.innerHTML = `<h2 class="mh-heading">${ICON.history}Đang xem dở</h2><div class="mh-row"></div>`;
    anchor.parentElement.insertBefore(section, anchor);

    const row = section.querySelector('.mh-row');
    const render = () => {
      if (!shows.length) return section.remove();
      row.innerHTML = shows.map(cardHtml).join('');
    };
    render();
    if (location.hash === '#' + HISTORY_ID) section.scrollIntoView({ block: 'center' });

    // Bấm Back từ trang xem phim: trình duyệt hiện lại trang chủ cũ mà không chạy lại script.
    addEventListener('pageshow', (e) => {
      if (e.persisted) reload().then(render);
    });

    // Dấu × xóa phim khỏi danh sách; bấm chỗ khác trên thẻ là mở tập đó (link thường).
    row.addEventListener('click', (e) => {
      const remove = e.target.closest('[data-remove]');
      if (!remove) return;
      e.preventDefault();
      removeShow(remove.dataset.remove).then(render);
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
    muted: svg('<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/>'),
    history: svg('<path d="M12 8v4l2 2"/><path d="M3.05 11a9 9 0 1 1 .5 4"/><path d="M3 4v7h7"/>', 18),
    close: svg('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>', 12),
  };

  const PLAYER_CSS = `
    /* Viên kính mờ "Chạm để bật tiếng", giống chữ báo 10s / 2x của script thao tác. */
    .mh-pill {
      position: absolute;
      right: 12px;
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
    @keyframes mh-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: none; }
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
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function addStyle(css) {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }
})();
