// 서비스워커 — 오프라인 동작과 캐시 버전 관리
//
// 배포할 때마다 CACHE_VERSION 을 올려야 사용자가 새 파일을 받는다.
// 이 값이 바뀌면 예전 캐시는 activate 단계에서 통째로 지워진다.
const CACHE_VERSION = "v5";
const CORE_CACHE = "ulmong-core-" + CACHE_VERSION;
const RUNTIME_CACHE = "ulmong-runtime-" + CACHE_VERSION;

// 앱을 띄우는 데 반드시 필요한 것들. 설치할 때 한 번에 받아 둔다.
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",

  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",

  "/assets/heart-0.svg",
  "/assets/heart-100.svg",
  "/assets/wave-heart-cool.svg",
  "/assets/wave-heart-warm.svg",
  "/assets/wave-splash-a.svg",
  "/assets/face-neutral.svg",
  "/assets/face-cry-done.svg",
  "/assets/face-blank.svg",
  "/assets/face-done.svg",
  "/assets/breath-mouth.svg",
  "/assets/breath-eye-left.svg",
  "/assets/breath-eye-right.svg",
  "/assets/breath-bubble-a.svg",
  "/assets/breath-bubble-b.svg",
  "/assets/crying-tear.svg",
  "/assets/rain-drop.svg",
  "/assets/done-blush-c.svg",
  "/assets/done-blush-left.svg",
  "/assets/done-blush-right.svg",
  "/assets/icon-speed-15.svg",
  "/assets/icon-speed-12.svg",
  "/assets/icon-sound-on.svg",
  "/assets/icon-sound-off.svg",
  "/assets/icon-question.svg",

  "/assets/Ownglyph_positive-subset.woff2",
];

// 소리 파일은 22MB 라 설치를 막지 않도록 나중에 따로 받는다.
// 한 번 재생되면 런타임 캐시에 남아 그다음부터는 오프라인에서도 들린다.
const AUDIO_ASSETS = [
  "/sounds/rain.mp3",
  "/sounds/breath.mp3",
];

// 온글잎은 13.8KB 서브셋이라 CORE_ASSETS 에 넣어 설치 때 같이 받는다.
// Pretendard 는 동적 서브셋이라 어떤 조각이 필요한지 미리 알 수 없다.
// 조각들은 실제로 쓰일 때 아래 fetch 핸들러가 런타임 캐시에 담는다.
const FONT_ASSETS = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CORE_CACHE)
      // 파일 하나가 없어도 설치 전체가 실패하지 않게 개별로 담는다
      .then((cache) =>
        Promise.all(
          CORE_ASSETS.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CORE_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
      .then(() => cacheHeavyAssetsInBackground())
  );
});

// 설치가 끝난 뒤 조용히 받아 둔다. 실패해도 앱 동작에는 지장이 없다.
// 폰트를 먼저 받는다. 글자가 늦게 뜨는 게 소리가 늦는 것보다 눈에 띈다.
function cacheHeavyAssetsInBackground() {
  return caches.open(RUNTIME_CACHE).then((cache) => {
    const grab = (url) =>
      cache.match(url).then((hit) => (hit ? null : cache.add(url).catch(() => {})));
    return Promise.all(FONT_ASSETS.map(grab)).then(() =>
      Promise.all(AUDIO_ASSETS.map(grab))
    );
  });
}

// 코드 파일. 내용이 계속 바뀌므로 절대 캐시 우선으로 두면 안 된다.
// 캐시 우선으로 두면 CACHE_VERSION 을 올리기 전까지 옛 코드가 영원히 나온다.
// (실제로 깨진 script.js 가 캐시에 박혀 스플래시가 0% 에서 멈춘 적이 있다.)
const CODE_PATHS = new Set(["/", "/index.html", "/style.css", "/script.js", "/manifest.json"]);

// 네트워크를 먼저 보고, 성공하면 캐시도 최신으로 갱신한다.
// 오프라인일 때만 캐시에 있는 것을 돌려준다.
function networkFirst(request, fallbackPath) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CORE_CACHE).then((cache) => cache.put(fallbackPath, copy));
      }
      return response;
    })
    .catch(() =>
      caches.match(fallbackPath).then((hit) => hit || caches.match("/index.html"))
    );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // 화면 이동은 네트워크를 먼저 본다. 새로 배포한 내용이 바로 반영되고,
  // 오프라인이면 캐시에 있는 index.html 을 돌려준다.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/index.html"));
    return;
  }

  // HTML/CSS/JS/manifest 도 같은 이유로 네트워크 우선이다.
  if (sameOrigin && CODE_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(request, url.pathname === "/" ? "/index.html" : url.pathname));
    return;
  }

  // 나머지(SVG·아이콘·소리·폰트 CDN)는 내용이 바뀌지 않으므로 캐시 우선.
  // 파일을 바꿀 일이 생기면 파일명을 바꾸거나 CACHE_VERSION 을 올린다.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;

      return fetch(request)
        .then((response) => {
          // 다른 출처(CDN)는 opaque 응답이라 status 가 0 이다. 그것도 담아 둔다.
          const cacheable =
            response && (response.ok || response.type === "opaque");
          if (cacheable) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // 오프라인이고 캐시에도 없는 경우
          if (url.origin === self.location.origin && url.pathname.endsWith(".mp3")) {
            return new Response("", { status: 504, statusText: "offline" });
          }
          return Response.error();
        });
    })
  );
});
