// ==UserScript==
// @name         Motchill - chặn quảng cáo + tối ưu mạng
// @namespace    motchill-noads
// @version      4.5
// @author       zic
// @homepageURL  https://github.com/nhattruong16062003/motchill-userscripts/tree/main/noads
// @updateURL    https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/noads/motchill-noads.user.js
// @downloadURL  https://raw.githubusercontent.com/nhattruong16062003/motchill-userscripts/main/noads/motchill-noads.user.js
// @description  Chặn quảng cáo trên Motchill (mọi tên miền, cả bản WordPress lẫn bản Next.js) và tắt chia sẻ P2P để phim chỉ tải từ máy chủ.
// @match        https://motchillsa.com/*
// @match        https://motchilltu.com/*
// @match        https://motchilln.fm/*
// @match        https://motchillt.app/*
// @include      /^https?:\/\/[^\/?#]*motchill[^\/?#]*\//
// @run-at       document-start
// @inject-into  page
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

  // true  = bỏ quảng cáo video trước phim trong trình phát.
  // false = để trang phát quảng cáo video như bình thường (vẫn chặn banner, popup).
  const BLOCK_VIDEO_ADS = true;

  // Mốc thời gian ở tương lai xa: trang tưởng quảng cáo "vừa hiện xong" nên không hiện nữa.
  const FUTURE = '9999999999999';

  // ============================================================
  //  CHỌN VIỆC THEO TỪNG TRANG
  // ============================================================
  // Có 2 trang Motchill khác nhau, đều hay đổi tên miền: bản WordPress (motchilltu.com -> motchillsa.com...)
  // và bản Next.js (motchillt.app -> motchilln.fm...). Lúc script chạy trang chưa tải nên chưa biết là bản nào;
  // hai bộ chặn không đụng nhau nên chạy cả hai.
  blockMotchilltu();
  if (BLOCK_VIDEO_ADS) disableVideoAds();
  if (DISABLE_P2P) disableP2P();
  blockMotchillt();

  // Trang gán thư viện JW Player sau khi script chạy: bỏ VAST trước mỗi setup.
  function disableVideoAds() {
    const wrappedApis = new WeakSet();
    function wrap(fn) {
      if (typeof fn !== 'function') return fn;
      return new Proxy(fn, {
        apply(target, thisArg, args) {
          const api = Reflect.apply(target, thisArg, args);
          if (api && typeof api.setup === 'function' && !wrappedApis.has(api)) {
            const setup = api.setup;
            api.setup = function (config, ...rest) {
              if (config) delete config.advertising;
              return setup.call(this, config, ...rest);
            };
            wrappedApis.add(api);
          }
          return api;
        },
      });
    }

    let jw = wrap(window.jwplayer);
    Object.defineProperty(window, 'jwplayer', {
      configurable: true,
      get() { return jw; },
      set(value) { jw = wrap(value); },
    });
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

    // 5) Ẩn nút chia sẻ và menu chia sẻ của trình phát.
    addStyle(`
      .jwplayer .jw-settings-sharing,
      .jwplayer .jw-sharing-menu {
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
  //  TIỆN ÍCH CHUNG
  // ============================================================
  // Thêm CSS vào trang càng sớm càng tốt: chưa có <head> thì gắn vào <html>,
  // chưa có cả <html> (script chạy quá sớm) thì đợi trang dựng xong.
  function addStyle(css) {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    };
    if (document.documentElement) add();
    else document.addEventListener('DOMContentLoaded', add);
  }
})();
