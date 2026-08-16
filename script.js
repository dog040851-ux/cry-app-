// ================= 데이터 =================

// cry-01 은 울기 시작하는 순간에 뜬다
const CRY_MESSAGES = [
  { id: "cry-01", text: "저도 같이 울어줄게요" },
  { id: "cry-02", text: "여기서는 참지 않아도 돼요" },
  { id: "cry-03", text: "다 흘려보내도 괜찮아요" },
];

// 들이쉬기 4초 → 내쉬기 6초로 바로 이어진다. 중간에 멈춤 구간은 없다.
const BREATH_STEPS = [
  { id: "inhale", label: "들이쉬며, 좋은 기운을 채워요", duration: "4000" },   // 1936:5751
  { id: "exhale", label: "내쉬며, 안 좋은 기운을 흘려보내요", duration: "6000" }, // 1936:5791
];

const SCREEN_TEXTS = [
  {
    id: "splash", // 1936:5909 / 1936:28600
    title: "울몽",
    sub: "같이 울어주는 앱",
  },
  {
    id: "tapStart", // 1976:23
    title: "화면을 눌러 시작하기", // 1976:43
  },
  {
    id: "home", // 1936:5592 / 1936:5624 / 1936:5688
    title: "혼자 울어도, 괜찮아요",
    sub: "누르고 있는 동안, 마음의 물이 조금씩 흘러나가요",
    gaugeLabel: "마음의 물",
    buttonFirst: "꾹 눌러서 울기",
    buttonAgain: "다시 눌러서 울기",
    buttonHold: "울고 있어요...",
  },
  {
    id: "cryDone", // 1936:5656
    title: "혼자 울어도, 괜찮아요",
    sub: "이제 숨을 고를 시간이에요",
    gaugeLabel: "마음의 물",
    button: "다 울었어요",
    buttonMore: "조금 더 울기", // 1967:35199
  },
  {
    id: "breathIntro", // 1936:5747 / 1936:5779
    title: "천천히, 함께 숨을 쉬어요",
    sub: "",
    gaugeLabel: "마음의 온기",
    circleLabel: "호흡",
  },
  {
    id: "breathDone", // 1936:5821
    title: "마음이 한결 가벼워졌어요",
    // 시안에서 두 줄로 나뉘어 있어 줄바꿈까지 그대로 옮긴다 (CSS 는 white-space: pre-line)
    sub: "잘 울었어요. 안 좋은 기운은 다 흘려보냈으니,\n오늘은 여기까지 울어도 괜찮아요.",
    gaugeLabel: "마음의 온기",
    button: "₊· ☘︎ ·₊Lucky Day ₊· ☘︎ ·₊", // 1936:5824
  },
];

function findText(id) {
  return SCREEN_TEXTS.find((item) => item.id === id);
}

// ================= 상태 =================

let currentState = "SPLASH";
let splashPercent = 0;  // 화면에 적히는 정수 %
let splashFill = 0;     // 물 높이용 연속값 (소수점 유지)
let heartPercent = 100; // 마음의 물 100 → 0
let warmPercent = 0;    // 마음의 온기 0 → 100
let hasStartedCrying = false;
let breathSetIndex = 0;

// ===== 속도 =====
// 아이콘에 적힌 숫자(1.5 / 1.2)와 실제 배수는 별개다. 헷갈리지 않게 여기서만 정의한다.
// normal 이 기본이고, slow 는 거기서 정확히 2배 느리다.
const SPEED_SLOW_FACTOR = 2;

// 기준 속도(%/초). 아래 셋은 여기서 각자의 배수로 갈라진다.
const GAUGE_BASE_PER_SEC = 3.75; // 마음의 물이 줄어드는 속도 → 0↔100% 약 26.7초

// 마음의 온기는 물보다 느리게 찬다. 호흡을 여유 있게 따라갈 시간을 준다.
const WARM_SLOWDOWN = 1.75;
// 다시 채울 때는 기다리는 시간이므로 빠르게 넘긴다.
const REFILL_SPEEDUP = 2.5;

const SPEED_MODES = {
  normal: { label: "1.5", divisor: 1 },
  slow:   { label: "1.2", divisor: SPEED_SLOW_FACTOR }, // 전부 2배 느려진다
};

let isSlowSpeed = false;
const speedMode = () => (isSlowSpeed ? SPEED_MODES.slow : SPEED_MODES.normal);
const speedDivisor = () => speedMode().divisor;

const cryDrainPerSec = () => GAUGE_BASE_PER_SEC / speedDivisor();
const warmRisePerSec = () => GAUGE_BASE_PER_SEC / WARM_SLOWDOWN / speedDivisor();
const heartRefillPerSec = () => (GAUGE_BASE_PER_SEC * REFILL_SPEEDUP) / speedDivisor();
const CRY_MAX_DELTA_SEC = 0.25; // 한 프레임이 이보다 길어도 이만큼만 반영

// 원: 165(호흡 중) → 193(호흡 준비). 시안 실측값.
const BREATH_SCALE_MAX = 193 / 165;
// 두 시안의 원 중심이 다르다(패널 기준 138.5 vs 130.5). scale 은 중심을 고정하므로 같이 올려준다.
const BREATH_RISE_PX = 138.5 - 130.5;
// 입: 15x7(큰 입) → 7x3(작은 입). 축은 입 상자의 정중앙.
const BREATH_MOUTH_SCALE_MIN_X = 7 / 15;
const BREATH_MOUTH_SCALE_MIN_Y = 3 / 7;

const BREATH_CYCLE_MS = BREATH_STEPS.reduce((sum, s) => sum + Number(s.duration), 0);

// 화면 전환 시간은 style.css 에서만 정한다. 여기서는 읽어 쓰기만 한다.
const SCREEN_OUT_MS = (() => {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--dur-screen-out")
    .trim();
  const n = parseFloat(raw);
  if (!n) return 200;
  return raw.endsWith("ms") ? n : n * 1000;
})();

// 조용하고 느린 앱. 급하게 움직이는 요소가 없어야 한다.
// 물 차오름과 % 증가가 모두 이 값 하나에서 나온다. 줄이면 둘 다 같이 빨라진다.
const SPLASH_DURATION_MS = 7000;
const CRY_MESSAGE_INTERVAL_MS = 6500; // 시안에 없음
const BREATH_INTRO_MS = 3200;         // 시안에 없음

// 비 : 개체마다 크기·속도·지연·투명도를 다르게 준다
const RAIN_DROP_COUNT = 64;

// 부정 덩어리 : 내쉬기가 시작되면 후두둑 쏟아졌다가 구간 끝으로 가며 잦아든다.
// 호흡 버튼(패널 기준 105,56 / 165x165)의 하단 중앙에서 나온다.
const BLOB_ORIGIN_X = 187.5; // 105 + 165/2
const BLOB_ORIGIN_Y = 221;   // 56 + 165
const BLOB_COUNT = 13;
const BLOB_START_MS = 180;
// 간격이 점점 벌어져서 "쏟아졌다가 잦아드는" 리듬이 된다
const BLOB_GAP_FIRST = 35;
const BLOB_GAP_GROW = 18;

// 타이머 핸들 — 새 타이머를 추가하면 반드시 clearAllTimers 에도 등록한다
let splashRafId = null;
let splashStartTs = null;
let splashScreenId = null;
let cryRafId = null;
let cryLastTs = null;
let cryPressStartTs = null;
let cryMessageTimer = null;
let breathStepTimer = null;
let warmRafId = null;
let warmLastTs = null;
let blobTimers = [];
let refillRafId = null;
let refillDoneTimer = null;

// ================= 소리 =================

// 트랙마다 Audio 객체를 딱 하나만 만들어 두고 계속 쓴다.
// 화면이 바뀌어도 새로 만들지 않으므로 BGM 이 끊기지 않는다.
//
// pending: 아직 파일이 없는 트랙. 요청 자체를 하지 않아 404 도 콘솔 에러도 남지 않는다.
// 파일을 sounds/ 에 넣은 뒤 pending 줄만 지우면 그대로 살아난다.
// 빗소리는 늘 깔려 있고, 누르고 있는 동안에만 조금 커진다.
const RAIN_VOLUME_IDLE = 0.22;
const RAIN_VOLUME_CRYING = 0.4;

// ===== 호흡 소리 크기 =====
// 두 파일의 원래 크기가 크게 다르다 (ffmpeg ebur128 실측).
//   빗소리 -37.8 LUFS / 호흡 -17.7 LUFS  → 호흡 파일이 20.1 LU 더 크다.
// 그래서 volume 숫자를 비슷하게 두면 호흡만 훨씬 크게 들린다.
// 빗소리와 같은 크기로 맞춘 뒤 2 LU 더 낮춘다.
const BREATH_LOUDER_BY_LU = 20.1;
const BREATH_QUIETER_BY_LU = 2;
const BREATH_VOLUME =
  RAIN_VOLUME_IDLE * Math.pow(10, -(BREATH_LOUDER_BY_LU + BREATH_QUIETER_BY_LU) / 20);

const SOUND = {
  bgm:    { src: "sounds/bgm.mp3",    volume: 0.3,  pending: true },
  rain:   { src: "sounds/rain.mp3",   volume: 0.4 },
  breath: { src: "sounds/breath.mp3", volume: BREATH_VOLUME },
};

// 켜질 때는 아주 길게, 곡선으로. "켜졌다"는 느낌 없이 스며들게.
const SOUND_FADE_MS = 1800;
// 끌 때는 짧게. 호흡 화면에 들어가면 빗소리가 곧바로 물러나야 하고,
// 음소거 버튼도 누르는 즉시 조용해져야 한다.
const SOUND_FADE_OUT_MS = 500;

// 처음엔 아주 천천히, 끝에서도 완만하게 (smoothstep)
const easeVolume = (p) => p * p * (3 - 2 * p);

const tracks = {};
let isMuted = false;
let audioUnlocked = false;
// 트랙별 목표 볼륨. 0 이면 꺼진 것으로 본다. (음소거와 별개)
const soundLevel = { bgm: 0, rain: 0, breath: 0 };

// ===== 왜 Web Audio 를 쓰는가 =====
// iOS Safari 는 audio.volume 에 값을 넣어도 무시한다. 볼륨은 기기의
// 하드웨어 버튼으로만 정해진다. 그래서 아이폰에서는 음소거도, 페이드도
// 전혀 걸리지 않았다(아이콘만 바뀌고 소리는 그대로).
// 각 트랙을 GainNode 로 통과시키고 gain 을 조절하면 iOS 에서도 동작한다.
// AudioContext 는 사용자가 화면을 처음 누를 때(unlockAudio) 만든다.
let audioCtx = null;

function trackVolume(t) {
  if (!t || !t.audio) return 0;
  return t.gain ? t.gain.gain.value : t.audio.volume;
}

function setTrackVolume(t, v) {
  if (!t || !t.audio) return;
  const clamped = Math.max(0, Math.min(1, v));
  if (t.gain) t.gain.gain.value = clamped;
  else t.audio.volume = clamped; // Web Audio 를 못 쓰는 환경용
}

// 트랙을 GainNode 에 연결한다. 요소마다 딱 한 번만 할 수 있다.
function routeThroughGain() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || audioCtx) return;

  try {
    audioCtx = new Ctx();
  } catch (e) {
    return; // 못 만들면 audio.volume 으로 그대로 간다
  }

  Object.keys(tracks).forEach((name) => {
    const t = tracks[name];
    if (!t.audio || t.gain) return;
    try {
      const source = audioCtx.createMediaElementSource(t.audio);
      const gain = audioCtx.createGain();
      gain.gain.value = t.audio.volume;
      source.connect(gain);
      gain.connect(audioCtx.destination);
      t.gain = gain;
    } catch (e) {
      /* 이 트랙만 예전 방식으로 둔다 */
    }
  });
}

// iOS 는 화면을 벗어났다 돌아오면 컨텍스트를 재워둔다. 필요할 때마다 깨운다.
function resumeAudioCtx() {
  if (audioCtx && audioCtx.state === "suspended") {
    const p = audioCtx.resume();
    if (p && p.catch) p.catch(() => {});
  }
}

function buildTracks() {
  Object.keys(SOUND).forEach((name) => {
    // 아직 없는 파일은 Audio 객체를 아예 만들지 않는다.
    // 아래 함수들은 전부 audio 가 없으면 조용히 건너뛴다.
    if (SOUND[name].pending) {
      tracks[name] = { audio: null, gain: null, rafId: null, failed: true };
      return;
    }

    const audio = new Audio(SOUND[name].src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    // 파일을 못 읽어도 앱은 그대로 동작한다
    audio.addEventListener("error", () => { tracks[name].failed = true; });
    tracks[name] = { audio, gain: null, rafId: null, failed: false };
  });
}

// 볼륨은 언제나 fade 로 바뀐다. 갑자기 켜지거나 꺼지지 않는다.
function fadeTo(name, target, onDone, durationMs) {
  const t = tracks[name];
  if (!t || !t.audio) return;
  if (t.rafId) { cancelAnimationFrame(t.rafId); t.rafId = null; }

  const from = trackVolume(t);
  if (Math.abs(from - target) < 0.001) { setTrackVolume(t, target); if (onDone) onDone(); return; }

  const duration = durationMs || SOUND_FADE_MS;
  let startTs = null;
  const step = (ts) => {
    if (startTs === null) startTs = ts;
    const p = Math.min(1, (ts - startTs) / duration);
    const eased = easeVolume(p);
    setTrackVolume(t, from + (target - from) * eased);
    if (p >= 1) { t.rafId = null; if (onDone) onDone(); return; }
    t.rafId = requestAnimationFrame(step);
  };
  t.rafId = requestAnimationFrame(step);
}

// 음소거 중에도 오디오는 계속 돌고 volume 만 0 이다.
// 그래야 다시 켰을 때 처음부터가 아니라 이어서 들린다.
function applyAudio() {
  if (!audioUnlocked) return;
  resumeAudioCtx();

  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t || !t.audio || t.failed) return;

    const level = soundLevel[name];
    const target = isMuted ? 0 : level;

    if (level > 0 && t.audio.paused) {
      const p = t.audio.play();
      if (p && p.catch) p.catch(() => {});
    }

    // 줄이는 쪽은 짧게, 키우는 쪽은 길게.
    const fadeMs = target < trackVolume(t) ? SOUND_FADE_OUT_MS : SOUND_FADE_MS;

    fadeTo(name, target, () => {
      // 이 트랙이 필요 없어졌을 때만 멈춘다. 음소거는 멈추지 않는다.
      if (soundLevel[name] === 0 && !t.audio.paused) t.audio.pause();
    }, fadeMs);
  });
}

function setScreenAudio(state) {
  const onBreath =
    state === "BREATH_INTRO" || state === "BREATHING" || state === "BREATH_DONE";

  // 스플래시와 "화면을 눌러 시작하기" 는 아직 소리가 없는 구간이다.
  // 브라우저가 자동재생을 막고 있어 어차피 들리지도 않는다.
  const onIntro = state === "SPLASH" || state === "TAP_TO_START";

  // BGM 은 화면을 누르고 HOME 에 들어오는 순간부터 계속 유지된다
  if (!onIntro) soundLevel.bgm = SOUND.bgm.volume;

  // 빗소리는 HOME 부터 늘 깔려 있다가 누르는 동안만 조금 커진다.
  // 볼륨만 바뀌므로 버튼을 떼도 끊기지 않고 원래 크기로 되돌아간다.
  // 호흡 화면에서는 완전히 멈춘다.
  if (onIntro || onBreath) {
    soundLevel.rain = 0;
  } else {
    soundLevel.rain = state === "CRYING" ? RAIN_VOLUME_CRYING : RAIN_VOLUME_IDLE;
  }

  // 호흡 소리는 호흡 준비·호흡 중에만. 호흡이 끝나면 페이드아웃된다.
  soundLevel.breath = state === "BREATH_INTRO" || state === "BREATHING"
    ? SOUND.breath.volume
    : 0;

  applyAudio();
}

// "화면을 눌러 시작하기" 를 누른 순간 빗소리를 0 에서부터 올리기 시작한다.
// 한 번만 걸어두면 긴 페이드(SOUND_FADE_MS)가 HOME 진입 후까지 그대로 이어져
// 화면이 바뀌는 동안 소리가 자연스럽게 스며든다.
let rainStarted = false;
function startRainPreroll() {
  if (rainStarted) return;
  rainStarted = true;
  soundLevel.rain = RAIN_VOLUME_IDLE;
  applyAudio();
}

// 럭키데이 : 소리를 전부 정리하고 처음 상태로 되돌린다
function resetAudio() {
  rainStarted = false;
  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t) return;
    if (t.rafId) { cancelAnimationFrame(t.rafId); t.rafId = null; }
    soundLevel[name] = 0;
    if (!t.audio) return;
    t.audio.pause();
    try { t.audio.currentTime = 0; } catch (e) { /* 로드 전이면 무시 */ }
    setTrackVolume(t, 0);
  });
}

// 브라우저 자동재생 정책 : 첫 사용자 입력이 있어야 재생이 허용된다.
// "화면을 눌러 시작하기" 의 터치가 그 입력이다. (startFromTap 에서 호출)
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;

  // 이 입력 안에서 만들어야 iOS 가 AudioContext 를 살려둔다
  routeThroughGain();
  resumeAudioCtx();

  Object.keys(tracks).forEach((name) => {
    const t = tracks[name];
    if (!t.audio) return;
    setTrackVolume(t, 0);
    const p = t.audio.play();
    if (p && p.then) {
      p.then(() => { if (soundLevel[name] === 0) t.audio.pause(); }).catch(() => {});
    }
  });
  applyAudio();
}

// 홈 화면 앱은 화면을 벗어났다 돌아오면 컨텍스트가 잠들어 있다
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && audioUnlocked) resumeAudioCtx();
});

// ================= DOM =================

const screenEls = document.querySelectorAll(".screen");
const appEl = document.getElementById("app");
const backdropEl = document.getElementById("backdrop");
const backdropWaterEl = document.getElementById("backdropWater");
const stageEl = document.getElementById("stage");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');
const el = (id) => document.getElementById(id);
const rand = (min, max) => min + Math.random() * (max - min);

// 하트 내부는 7곳에서 구조가 같다. 아홉 번 베껴 쓰면 어긋나기 쉬워 한 번에 만들어 넣는다.
function buildHearts() {
  document.querySelectorAll(".cry__heart").forEach((heart) => {
    const warm = heart.dataset.heart === "warm";
    heart.style.setProperty("--water-color", warm ? "#AE3F3F" : "#3F93AE");
    heart.innerHTML =
      // 따뜻한 하트에만 숯불 같은 잔열을 깐다. 하트 도형 자체는 건드리지 않는다.
      (warm
        ? '<div class="heart__glow" aria-hidden="true"><i></i><i></i><i></i></div>'
        : "") +
      '<div class="heart__water">' +
      '<div class="heart__water-body"></div>' +
      '<div class="wave" style="background-image:url(assets/wave-heart-' +
      (warm ? "warm" : "cool") +
      '.svg)"></div>' +
      "</div>" +
      '<img class="heart__outline" src="assets/heart-0.svg" alt="" aria-hidden="true" />';
  });
}

// 포슬포슬한 비. 같은 동작이 겹치지 않도록 개체마다 값을 흩뜨린다.
function buildRain() {
  const rain = document.querySelector(".cry__rain");
  if (!rain) return;

  for (let i = 0; i < RAIN_DROP_COUNT; i += 1) {
    const drop = document.createElement("img");
    drop.className = "rain__drop";
    drop.src = "assets/rain-drop.svg";
    drop.alt = "";
    drop.setAttribute("aria-hidden", "true");

    const width = rand(1.8, 2.8);
    const duration = rand(9, 17);

    drop.style.left = rand(-2, 100) + "%";
    drop.style.width = width + "px";
    drop.style.height = width * rand(6, 10) + "px";
    drop.style.animationDuration = duration + "s";
    // 음수 지연 : 처음부터 화면 곳곳에 흩어진 상태로 시작한다
    drop.style.animationDelay = -rand(0, duration) + "s";
    drop.style.setProperty("--drop-opacity", rand(0.3, 0.8).toFixed(2));

    rain.appendChild(drop);
  }
}

// 게이지 숫자와 하트 채움을 같은 값 하나로 맞춘다
function setHeart(screenId, percent) {
  const heart = document.querySelector("#" + screenId + " .cry__heart");
  if (!heart) return;
  // 매 프레임 불리므로 값이 바뀔 때만 속성을 건드린다
  const empty = String(percent <= 0);
  if (heart.dataset.empty !== empty) heart.dataset.empty = empty;
  heart.style.setProperty("--fill", percent + "%");

  // 온기가 오를수록 잔열이 조금씩 진해진다 (0.30 → 0.85)
  if (heart.dataset.heart === "warm") {
    heart.style.setProperty("--glow-strength", (0.3 + (percent / 100) * 0.55).toFixed(3));
  }
}

function activeScreenId(state) {
  switch (state) {
    case "SPLASH":       return splashPercent === 0 ? "screen-splash" : "screen-splash-loading";
    case "TAP_TO_START": return "screen-tap-start";
    case "HOME":         return hasStartedCrying ? "screen-released" : "screen-home";
    case "CRYING":       return "screen-crying";
    case "CRY_DONE":     return "screen-cry-done";
    // 호흡 준비와 호흡 중은 한 화면을 쓴다 → 그 사이에는 전환이 일어나지 않는다
    case "BREATH_INTRO": return "screen-breathing";
    case "BREATHING":    return "screen-breathing";
    case "BREATH_DONE":  return "screen-breath-done";
    default:             return "screen-splash";
  }
}

// 같은 자리에서 상태만 바뀌는 화면들. 이 안에서는 슬라이드하지 않는다.
const INSTANT_GROUP = ["screen-home", "screen-crying", "screen-released"];

let screenLeaveTimer = null;

// 바깥 배경층을 지금 화면과 같은 배경으로 맞춘다.
// 이게 없으면 좌우(또는 위아래) 여백에서 색이 끊겨 경계선이 보인다.
// 스플래시에서는 물도 바깥까지 이어져야 해서 따로 표시해 둔다.
// 시작 화면(1976:23)은 뺀다. 시안에서 파도 마루가 y-52 라 화면 밖에 있어
// 물면이 평평하다. 물 층을 켜면 화면 맨 위에 물결선이 그어진다.
// 이 화면의 --edge 가 이미 물색(#D3E2E8)이라 배경만으로 충분하다.
const SPLASH_SCREENS = ["screen-splash", "screen-splash-loading"];

function syncBackdrop(screen) {
  if (!screen || !backdropEl) return;
  const style = getComputedStyle(screen);

  const edge = style.getPropertyValue("--edge").trim() || "#FFFDFA";
  const bg = style.getPropertyValue("--bg").trim();
  const size = style.getPropertyValue("--bg-size").trim();
  const position = style.getPropertyValue("--bg-position").trim();

  // html 에도 같이 넣어야 한다.
  // 캔버스 배경(상태바 자리·바운스 영역)은 html 에 배경이 있으면 그쪽을 쓰고
  // body 것은 무시한다. body 만 바꾸면 그 영역이 계속 흰색으로 남는다.
  document.documentElement.style.backgroundColor = edge;
  document.body.style.backgroundColor = edge;
  backdropEl.style.backgroundColor = edge;
  // 안드로이드 크롬의 상단 바 색도 화면 따라 바뀐다.
  // (아이폰은 black-translucent 라 .backdrop 이 그 자리까지 직접 칠한다.)
  if (themeColorMeta) themeColorMeta.setAttribute("content", edge);
  backdropEl.style.backgroundImage = bg && bg !== "none" ? bg : "none";
  backdropEl.style.backgroundSize = size || "100% 100%";
  backdropEl.style.backgroundPosition = position || "center";

  backdropEl.dataset.splash = String(SPLASH_SCREENS.includes(screen.id));
  updateSplashWater();
}

// 물의 수면 높이를 화면 좌표(px)로 정한다.
// 물은 앱 밖(.backdrop) 에 있어 화면 전체 폭으로 그려진다.
function updateSplashWater() {
  if (!backdropWaterEl || !stageEl) return;
  const scale =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--app-scale")
    ) || 1;
  const rect = stageEl.getBoundingClientRect();
  const surfaceY = rect.top + 812 * (1 - splashFill / 100) * scale;
  // top 은 .backdrop 기준이다. 배경층이 화면 밖으로 나가 있어도 어긋나지 않게
  // 화면 좌표에서 배경층의 위치를 빼서 넣는다.
  const base = backdropEl.getBoundingClientRect().top;
  backdropWaterEl.style.top = (surfaceY - base).toFixed(1) + "px";
}

// 나가기가 완전히 끝난 뒤에 들어오기를 시작한다.
// 두 화면이 동시에 보이는 프레임이 한 번도 없다.
function showScreen(id) {
  const next = document.getElementById(id);
  if (!next || next.classList.contains("is-active")) return;

  const current = document.querySelector(".screen.is-active");

  if (screenLeaveTimer) { clearTimeout(screenLeaveTimer); screenLeaveTimer = null; }
  document.querySelectorAll(".screen.is-leaving").forEach((n) => n.classList.remove("is-leaving"));

  // 배경은 .backdrop 한 곳에서만 그린다. 화면들은 전부 투명하다.
  syncBackdrop(next);

  const instant =
    current && INSTANT_GROUP.includes(current.id) && INSTANT_GROUP.includes(next.id);

  if (instant) {
    next.classList.add("is-instant", "is-active");
    current.classList.remove("is-active");
    void next.offsetWidth; // 전환 없이 자리만 바꾸고 다음을 위해 되돌린다
    next.classList.remove("is-instant");
    return;
  }

  if (!current) {
    next.classList.add("is-active");
    return;
  }

  current.classList.remove("is-active");
  current.classList.add("is-leaving");

  screenLeaveTimer = setTimeout(() => {
    current.classList.remove("is-leaving"); // 완전히 사라진 뒤 숨긴다
    next.classList.add("is-active");        // 그 다음에야 나타나기 시작
    screenLeaveTimer = null;
  }, SCREEN_OUT_MS);
}

// ================= 타이머 정리 =================

function clearAllTimers() {
  if (splashRafId) { cancelAnimationFrame(splashRafId); splashRafId = null; }
  splashStartTs = null;
  if (cryRafId) { cancelAnimationFrame(cryRafId); cryRafId = null; }
  cryLastTs = null;
  if (cryMessageTimer) { clearInterval(cryMessageTimer); cryMessageTimer = null; }
  if (breathStepTimer) { clearTimeout(breathStepTimer); breathStepTimer = null; }
  if (warmRafId) { cancelAnimationFrame(warmRafId); warmRafId = null; }
  warmLastTs = null;
  if (refillRafId) { cancelAnimationFrame(refillRafId); refillRafId = null; }
  if (refillDoneTimer) { clearTimeout(refillDoneTimer); refillDoneTimer = null; }
  blobTimers.forEach(clearTimeout);
  blobTimers = [];
  document.querySelectorAll(".breath__emit").forEach((n) => { n.innerHTML = ""; });
}

// ================= 화면 전환 =================

function renderScreen(state) {
  clearAllTimers();
  currentState = state;
  showScreen(activeScreenId(state));
  setScreenAudio(state);
  renderHud(state);
  setBubbleOpen(false); // 화면이 바뀌면 말풍선은 닫는다

  if (state === "SPLASH") startSplash();
  if (state === "TAP_TO_START") renderTapStart();
  if (state === "HOME") renderHome();
  if (state === "CRYING") renderCrying();
  if (state === "CRY_DONE") renderCryDone();
  if (state === "BREATH_INTRO") renderBreathIntro();
  if (state === "BREATHING") renderBreathing();
  if (state === "BREATH_DONE") renderBreathDone();
}

// ================= SPLASH =================

function renderSplashText() {
  const text = findText("splash");
  el("splashTitle").textContent = text.title;
  el("splashSubtitle").textContent = text.sub;
  el("splashLoadingTitle").textContent = text.title;
  el("splashLoadingSubtitle").textContent = text.sub;
}

// 물 높이는 소수점까지 그대로 쓴다. 정수로 반올림하면 8px 씩 계단으로 튄다.
// 화면에 적히는 숫자만 정수로 내린다.
// 숫자는 화면 아래에 고정이다. 물만 차오르고 값만 바뀐다.
// 물 높이는 변수 하나로 정해서 앱 안쪽 물과 바깥 배경층의 물이 같이 움직인다.
function renderSplashProgress() {
  const shown = splashPercent + " %";
  el("splashPercent").textContent = shown;
  el("splashLoadingPercent").textContent = shown;
  updateSplashWater();

  const id = activeScreenId("SPLASH");
  if (id !== splashScreenId) {
    showScreen(id);
    splashScreenId = id;
  }
}

// 일정한 속도로 차오르면 뻣뻣하다.
// 느리게 시작해 가운데서 빨라졌다 끝에서 다시 느려지는 곡선에,
// 아주 얕은 완급을 얹어 물이 밀려오듯 만든다.
// 완급 항은 양 끝에서 0 이 되고 진폭이 본 곡선의 기울기보다 작아
// 수위가 뒤로 물러나는 일은 없다.
function easeWater(r) {
  const base = 0.5 - 0.5 * Math.cos(Math.PI * r);
  const swell = 0.015 * Math.sin(Math.PI * r) * Math.sin(6 * Math.PI * r);
  return Math.max(0, Math.min(1, base + swell));
}

function startSplash() {
  splashPercent = 0;
  splashFill = 0;
  splashStartTs = null;
  splashScreenId = null;
  renderSplashText();
  renderSplashProgress();

  const tick = (ts) => {
    if (splashStartTs === null) splashStartTs = ts;

    const ratio = Math.min(1, (ts - splashStartTs) / SPLASH_DURATION_MS);
    splashFill = easeWater(ratio) * 100;
    splashPercent = Math.round(splashFill);

    // 곡선이라 끝에서 아주 느려진다. 숫자가 100 이 된 뒤에도 ratio 가 1 이 되려면
    // 0.6 초쯤 더 걸려서 100% 인 채로 멈춰 있는 것처럼 보였다.
    // 숫자가 100 에 닿는 순간이 곧 끝이다.
    if (splashPercent >= 100) {
      splashFill = 100;
      renderSplashProgress();
      splashRafId = null;
      renderScreen("TAP_TO_START");
      return;
    }

    renderSplashProgress();
    splashRafId = requestAnimationFrame(tick);
  };

  splashRafId = requestAnimationFrame(tick);
}

// ================= 화면을 눌러 시작하기 =================

// 시안(1976:23)에는 화면 아래에 "100 %" 가 있지만 넣지 않는다.
// 로딩 숫자가 수면을 따라 올라가도록 바뀌어서, 여기서 다시 아래에 뜨면
// 전환하는 순간 숫자가 위에서 아래로 튄다.
function renderTapStart() {
  el("tapStartText").textContent = findText("tapStart").title;
}

// 이 한 번의 입력이 브라우저 자동재생 잠금을 푸는 시점이다.
// 여기서 오디오를 열고 빗소리를 0 에서부터 올리기 시작한 뒤 HOME 으로 넘어간다.
// 빗소리 페이드는 화면 전환보다 길어서 HOME 에 도착한 뒤에도 계속 차오른다.
function startFromTap() {
  if (currentState !== "TAP_TO_START") return;
  unlockAudio();
  startRainPreroll();
  renderScreen("HOME");
}

// 화면 아무 곳이나. pointerdown 이 먼저 상태를 바꾸므로
// 뒤따라오는 click 은 위 가드에 걸려 두 번 실행되지 않는다.
el("screen-tap-start").addEventListener("pointerdown", startFromTap);
el("screen-tap-start").addEventListener("click", startFromTap);

// ================= HOME / CRYING / CRY_DONE =================

function renderHome() {
  const text = findText("home");
  const prefix = hasStartedCrying ? "released" : "home";

  el(prefix + "GaugeLabel").textContent = text.gaugeLabel;
  el(prefix + "GaugeValue").textContent = Math.round(heartPercent) + "%";
  el(prefix + "Helper").textContent = text.sub;
  el(prefix + "ButtonLabel").textContent = hasStartedCrying ? text.buttonAgain : text.buttonFirst;
  setHeart(activeScreenId("HOME"), heartPercent);
}

function renderCrying() {
  const text = findText("home");

  el("cryingGaugeLabel").textContent = text.gaugeLabel;
  el("cryingGaugeValue").textContent = Math.round(heartPercent) + "%";
  el("cryingButtonLabel").textContent = text.buttonHold;
  setHeart("screen-crying", heartPercent);

  startCryMessageRotation();
  startCryDrain();
}

function startCryMessageRotation() {
  const messages = CRY_MESSAGES.filter((item) => item.text !== "");
  if (messages.length === 0) return;

  let i = 0;
  el("cryingHelper").textContent = messages[i].text;
  if (messages.length === 1) return;

  cryMessageTimer = setInterval(() => {
    i = (i + 1) % messages.length;
    el("cryingHelper").textContent = messages[i].text;
  }, CRY_MESSAGE_INTERVAL_MS);
}

function startCryDrain() {
  // 첫 프레임의 기준을 pointerdown 시각으로 잡아야 정확히 5%/초가 된다
  cryLastTs = cryPressStartTs;
  cryPressStartTs = null;

  const tick = (ts) => {
    if (cryLastTs === null) cryLastTs = ts;

    // 탭이 숨었다 돌아오면 멈춘 시간이 통째로 델타로 들어온다. 한 번에 왕창 줄지 않게 막는다.
    const deltaSec = Math.min(CRY_MAX_DELTA_SEC, Math.max(0, (ts - cryLastTs) / 1000));
    cryLastTs = ts;

    heartPercent = Math.max(0, heartPercent - cryDrainPerSec() * deltaSec);
    el("cryingGaugeValue").textContent = Math.round(heartPercent) + "%";
    setHeart("screen-crying", heartPercent);

    if (heartPercent <= 0) {
      renderScreen("CRY_DONE");
      return;
    }
    cryRafId = requestAnimationFrame(tick);
  };
  cryRafId = requestAnimationFrame(tick);
}

function renderCryDone() {
  const text = findText("cryDone");
  el("cryDoneGaugeLabel").textContent = text.gaugeLabel;
  el("cryDoneGaugeValue").textContent = Math.round(heartPercent) + "%";
  el("cryDoneButtonLabel").textContent = text.button;
  el("cryMoreButton").textContent = text.buttonMore;
  el("cryMoreButton").dataset.gone = "false";
  setHeart("screen-cry-done", heartPercent);
}

// "조금 더 울기" : 버튼을 바로 지우고 → 하트를 100% 까지 채우고 → HOME 으로.
function startHeartRefill() {
  let lastTs = null;
  const tick = (ts) => {
    if (lastTs === null) lastTs = ts;
    const deltaSec = Math.min(CRY_MAX_DELTA_SEC, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;

    heartPercent = Math.min(100, heartPercent + heartRefillPerSec() * deltaSec);
    el("cryDoneGaugeValue").textContent = Math.round(heartPercent) + "%";
    setHeart("screen-cry-done", heartPercent);

    if (heartPercent >= 100) {
      refillRafId = null;
      refillDoneTimer = setTimeout(() => {
        refillDoneTimer = null;
        renderScreen("HOME");
      }, 260);
      return;
    }
    refillRafId = requestAnimationFrame(tick);
  };
  refillRafId = requestAnimationFrame(tick);
}

// ================= 누르기 =================

function handlePressStart(event) {
  event.preventDefault();
  if (currentState !== "HOME") return;
  hasStartedCrying = true;
  cryPressStartTs = typeof event.timeStamp === "number" ? event.timeStamp : performance.now();
  renderScreen("CRYING");
}

// 주의 : 이 핸들러는 window 에 걸려 있어 화면 어디를 눌러도 실행된다.
// 터치 기기에서 pointerup 에 preventDefault() 를 하면 뒤따르는 click 이 취소된다.
// 그래서 상태를 먼저 확인하고, 우는 중일 때만 기본 동작을 막는다.
// (먼저 막아버리면 상단 소리·속도 아이콘의 click 이 영영 오지 않는다.)
function handlePressEnd(event) {
  if (currentState !== "CRYING") return;
  event.preventDefault();
  renderScreen("HOME");
}

["homeButton", "releasedButton"].forEach((id) => {
  el(id).addEventListener("pointerdown", handlePressStart);
});

// 누르는 순간 화면이 바뀌면서 방금 누른 버튼이 사라지므로 떼는 이벤트는 window 에서 받는다
window.addEventListener("pointerup", handlePressEnd);
window.addEventListener("pointercancel", handlePressEnd);
el("cryingButton").addEventListener("pointerleave", handlePressEnd);

["homeButton", "releasedButton", "cryingButton"].forEach((id) => {
  el(id).addEventListener("contextmenu", (event) => event.preventDefault());
});

el("cryDoneButton").addEventListener("click", () => {
  if (currentState !== "CRY_DONE") return;
  renderScreen("BREATH_INTRO");
});

el("cryMoreButton").addEventListener("click", () => {
  if (currentState !== "CRY_DONE" || refillRafId) return;
  // 누르는 즉시 버튼을 지우고, 그 다음에 물이 차오른다
  el("cryMoreButton").dataset.gone = "true";
  startHeartRefill();
});

// ================= BREATH_INTRO / BREATHING =================

// 호흡 준비는 호흡 화면과 같은 DOM 을 쓴다. 사이클만 아직 돌지 않는 상태다.
function renderBreathIntro() {
  const text = findText("breathIntro");
  el("breathingGaugeLabel").textContent = text.gaugeLabel;
  el("breathingGaugeValue").textContent = Math.round(warmPercent) + "%";
  el("breathingCircleLabel").textContent = text.circleLabel;
  el("breathingHelper").textContent = BREATH_STEPS[0].label;
  setHeart("screen-breathing", warmPercent);

  // 첫 들이쉬기가 이어지도록 최소 상태로 맞춰 둔다
  const circle = el("breathingCircle");
  const mouth = el("breathingMouth");
  circle.style.transition = "none";
  mouth.style.transition = "none";
  setBreathState(false);
  void circle.getBoundingClientRect().width;
  circle.style.transition = "";
  mouth.style.transition = "";

  breathStepTimer = setTimeout(() => {
    if (currentState !== "BREATH_INTRO") return;
    breathSetIndex = 0;
    renderScreen("BREATHING");
  }, BREATH_INTRO_MS);
}

// 호흡 버튼을 누르면 화면 전환 없이 그 자리에서 사이클이 시작된다
el("breathingCircle").addEventListener("click", () => {
  if (currentState !== "BREATH_INTRO") return;
  breathSetIndex = 0;
  renderScreen("BREATHING");
});

// 원과 입은 같은 방향으로, 같은 시간·같은 easing 으로 움직인다.
// 들이쉬면 원도 입도 커지고, 내쉬면 둘 다 작아진다.
function setBreathState(inhaled) {
  el("breathingCircle").style.transform = inhaled
    ? "translateY(-" + BREATH_RISE_PX + "px) scale(" + BREATH_SCALE_MAX + ")"
    : "translateY(0px) scale(1)";

  el("breathingMouth").style.transform = inhaled
    ? "scale(1, 1)"
    : "scale(" + BREATH_MOUTH_SCALE_MIN_X + ", " + BREATH_MOUTH_SCALE_MIN_Y + ")";
}

function renderBreathing() {
  const text = findText("breathIntro");
  el("breathingGaugeLabel").textContent = text.gaugeLabel;
  el("breathingCircleLabel").textContent = text.circleLabel;

  // 화면 전환이 끝나기를 기다리지 않는다. 페이드가 도는 동안 이미 첫 들이쉬기가
  // 진행 중이어야 멈칫하는 구간이 생기지 않는다. 그래서 여기서 바로 사이클을 시작한다.
  const circle = el("breathingCircle");
  const mouth = el("breathingMouth");

  // 1) transition 을 완전히 끄고 시작 크기를 먼저 확정한다
  circle.style.transition = "none";
  mouth.style.transition = "none";
  setBreathState(false);

  // 2) 강제 reflow — 시작값이 여기서 실제로 커밋되어야
  //    다음에 주는 변경이 튀지 않고 transition 을 탄다
  void circle.getBoundingClientRect().width;
  void mouth.getBoundingClientRect().width;

  // 3) transition 을 되살린다 (duration 은 runBreathStep 이 단계값으로 넣는다)
  circle.style.transition = "";
  mouth.style.transition = "";

  warmPercent = 0;
  startWarmRise();
  runBreathStep(0);
}

// 마음의 온기는 세트가 끝날 때 뚝 오르지 않고, 호흡 내내 물이 차오르듯 이어진다.
//
// 경과 시간 전체를 총 시간으로 나누는 방식이면, 속도를 바꾸는 순간 분모가 바뀌어
// 현재 % 가 확 튄다. 그래서 매 프레임 "증가분"만 더한다.
// 이렇게 하면 속도를 바꿔도 지금까지 쌓인 값은 그대로 남고 이후 기울기만 달라진다.
function startWarmRise() {
  warmLastTs = null;
  const tick = (ts) => {
    if (warmLastTs === null) warmLastTs = ts;

    const deltaSec = Math.min(CRY_MAX_DELTA_SEC, Math.max(0, (ts - warmLastTs) / 1000));
    warmLastTs = ts;

    warmPercent = Math.min(100, warmPercent + warmRisePerSec() * deltaSec);
    el("breathingGaugeValue").textContent = Math.round(warmPercent) + "%";
    setHeart("screen-breathing", warmPercent);

    if (warmPercent >= 100) { warmRafId = null; return; }
    warmRafId = requestAnimationFrame(tick);
  };
  warmRafId = requestAnimationFrame(tick);
}

// 하트 안에서 하나씩 뱉어낸다. 정지해 있는 덩어리는 두지 않는다.
function spitBlob(index) {
  const emit = document.querySelector("#screen-breathing .breath__emit");
  if (!emit) return;

  // 작은 것 위주에 큰 것이 드문드문 섞이도록 제곱으로 치우치게 뽑는다
  const r = Math.random();
  const size = 8 + r * r * 24; // 8~32px, 대부분 작다 (기존 4~15의 약 2배)

  const img = document.createElement("img");
  img.src = "assets/breath-bubble-" + (index % 2 === 0 ? "a" : "b") + ".svg";
  img.alt = "";
  img.setAttribute("aria-hidden", "true");

  img.style.left = BLOB_ORIGIN_X - size / 2 + rand(-10, 10) + "px";
  img.style.top = BLOB_ORIGIN_Y - size / 2 + "px";
  img.style.width = size + "px";
  img.style.height = size + "px";
  // 부채꼴로 넓게 흩어진다
  img.style.setProperty("--blob-dx", rand(-34, 34).toFixed(1) + "px");
  img.style.setProperty("--blob-dy", rand(52, 92).toFixed(1) + "px");
  // 회전은 방향도 속도도 제각각
  img.style.setProperty("--blob-rot",
    (rand(40, 220) * (Math.random() < 0.5 ? -1 : 1)).toFixed(0) + "deg");
  img.style.setProperty("--blob-opacity", rand(0.5, 0.9).toFixed(2));
  img.style.animationName = "blobSpit";
  img.style.animationDuration = rand(1400, 2600).toFixed(0) + "ms";
  img.addEventListener("animationend", () => img.remove());

  emit.appendChild(img);
}

function runBreathStep(stepIndex) {
  const step = BREATH_STEPS[stepIndex];
  const durationMs = Number(step.duration);

  el("breathingHelper").textContent = step.label;
  el("breathingCircle").style.transitionDuration = durationMs + "ms";
  el("breathingMouth").style.transitionDuration = durationMs + "ms";

  if (step.id === "inhale") {
    setBreathState(true);
  } else if (step.id === "exhale") {
    setBreathState(false);
    // 내쉬기가 시작되면 짧은 간격으로 우르르 쏟아지고, 간격이 점점 벌어져 잦아든다
    let at = BLOB_START_MS;
    for (let i = 0; i < BLOB_COUNT; i += 1) {
      const spawnAt = at;
      blobTimers.push(setTimeout(() => spitBlob(i), spawnAt));
      at += BLOB_GAP_FIRST + i * BLOB_GAP_GROW;
    }
  }
  // hold 는 transform 을 손대지 않는다 → 직전 상태 유지

  breathStepTimer = setTimeout(() => {
    if (stepIndex < BREATH_STEPS.length - 1) {
      runBreathStep(stepIndex + 1);
      return;
    }

    breathSetIndex += 1;
    // 세트 수로 끝내면 도중에 속도를 바꿨을 때 게이지와 어긋난다.
    // 온기가 다 찼는지로 판정한다.
    if (warmPercent >= 100) {
      renderScreen("BREATH_DONE");
    } else {
      runBreathStep(0);
    }
  }, durationMs);
}

// ================= BREATH_DONE =================

function renderBreathDone() {
  const text = findText("breathDone");
  warmPercent = 100;

  el("breathDoneGaugeLabel").textContent = text.gaugeLabel;
  el("breathDoneGaugeValue").textContent = warmPercent + "%";
  el("breathDoneHeadline").textContent = text.title;
  el("breathDoneParagraph").textContent = text.sub;
  el("breathDoneButton").textContent = text.button;
  setHeart("screen-breath-done", warmPercent);
}

// 럭키데이 : 앱을 통째로 처음부터 다시 시작한다. 남는 상태가 없어야 한다.
el("breathDoneButton").addEventListener("click", () => {
  if (currentState !== "BREATH_DONE") return;

  clearAllTimers();
  resetAudio();

  heartPercent = 100;
  warmPercent = 0;
  breathSetIndex = 0;
  hasStartedCrying = false;
  isSlowSpeed = false;
  splashPercent = 0;
  splashFill = 0;
  renderSpeedToggle();

  document.querySelectorAll(".cry__heart").forEach((heart) => {
    heart.dataset.empty = "false";
    heart.style.setProperty("--fill", "0%");
  });
  el("cryMoreButton").dataset.gone = "false";

  renderScreen("SPLASH");
});

// ================= 안내 말풍선 =================

// 화면 전환 없이 지금 화면 위에 겹쳐서 뜬다.
function setBubbleOpen(open) {
  el("feedbackBubble").dataset.open = String(open);
}

// 물음표를 누르면 열리고, 다시 누르면 닫힌다
el("feedbackOpen").addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = el("feedbackBubble").dataset.open === "true";
  setBubbleOpen(!isOpen);
});

// 바깥을 누르면 닫힌다
document.addEventListener("click", (event) => {
  if (el("feedbackBubble").dataset.open !== "true") return;
  if (event.target.closest("#feedbackBubble")) return;
  setBubbleOpen(false);
});

// ================= 상단 아이콘 =================

const hud = el("hud");
const speedToggle = el("speedToggle");
const soundToggle = el("soundToggle");

// 스플래시(로딩)·시작 화면·호흡 끝 화면에서는 아이콘을 숨긴다.
// 시안 1936:5821 과 1976:23 에도 Frame 11(아이콘 묶음)이 없다.
function renderHud(state) {
  hud.dataset.hidden = String(
    state === "SPLASH" || state === "TAP_TO_START" || state === "BREATH_DONE"
  );
}

function renderSpeedToggle() {
  speedToggle.dataset.slow = String(isSlowSpeed);
  speedToggle.setAttribute("aria-label", isSlowSpeed ? "속도 1.2배" : "속도 1.5배");
}

// 상단 아이콘은 click 하나에만 의존하지 않는다.
// 터치 기기에서는 스크롤 판정·탭 지연·다른 핸들러의 preventDefault 때문에
// click 이 오지 않는 경우가 있다. pointerup 으로도 같이 받고,
// 둘 다 오면 한 번만 처리한다(같은 탭에서 온 두 번째 이벤트는 버린다).
function bindTap(element, handler) {
  let lastAt = -1e9;
  const run = (event) => {
    const now = typeof event.timeStamp === "number" ? event.timeStamp : performance.now();
    if (now - lastAt < 500) return;
    lastAt = now;
    handler(event);
  };
  element.addEventListener("pointerup", run);
  element.addEventListener("click", run);
}

// 1.5 ⇄ 1.2 토글. 값만 바꾸면 물 감소·온기 상승이 다음 프레임부터 바로 반영된다.
bindTap(speedToggle, () => {
  isSlowSpeed = !isSlowSpeed;
  renderSpeedToggle();
});

function renderSoundToggle() {
  soundToggle.dataset.muted = String(isMuted);
  soundToggle.setAttribute("aria-pressed", String(isMuted));
  soundToggle.setAttribute("aria-label", isMuted ? "소리 켜기" : "소리 끄기");
}

bindTap(soundToggle, () => {
  isMuted = !isMuted;
  renderSoundToggle();
  applyAudio(); // 음소거는 정지가 아니라 볼륨 0. 다시 켜면 이어서 들린다.
});

// 토글을 눌러도 아래 화면이 반응하지 않게 한다.
// preventDefault 는 쓰지 않는다. 터치에서 뒤따르는 click 까지 취소될 수 있다.
[speedToggle, soundToggle].forEach((btn) => {
  btn.addEventListener("pointerdown", (event) => event.stopPropagation());
});

// ================= 서비스워커 =================

// 오프라인 동작과 설치(PWA) 조건을 담당한다.
// file:// 로 열었을 때는 등록되지 않으니 로컬 확인은 http 로 해야 한다.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* 등록에 실패해도 앱은 그대로 동작한다 */
    });
  });
}

// ================= 화면 크기 대응 =================

// 375x812 를 기기 화면에 맞춰 통째로 확대·축소한다.
// 내부 좌표는 시안 그대로 두고 여기서만 배율을 바꾼다.
// 쓸 수 있는 공간 = 실제로 보이는 영역에서 노치·홈바(safe-area)를 뺀 것.
// visualViewport 는 아이폰에서 주소창이 접히거나 펼쳐지는 것까지 반영한다.
function fitApp() {
  // 아이폰 사파리는 상황에 따라 다른 높이를 알려준다. 셋 중 가장 작은 값을
  // 쓰면 어떤 상태에서도 내용이 브라우저 UI 에 가리지 않는다.
  // 그만큼 앱이 작아지지만 남는 자리는 .backdrop 이 덮어 티가 안 난다.
  const vv = window.visualViewport;
  const heights = [window.innerHeight, document.documentElement.clientHeight];
  if (vv) heights.push(vv.height);
  const widths = [window.innerWidth, document.documentElement.clientWidth];
  if (vv) widths.push(vv.width);

  const cs = getComputedStyle(document.body);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

  const availW = Math.min.apply(null, widths.filter((n) => n > 0)) - padX;
  const availH = Math.min.apply(null, heights.filter((n) => n > 0)) - padY;

  // 가로·세로 중 작은 비율을 쓴다. 그래야 375x812 비율이 그대로 유지된다.
  const scale = Math.min(availW / 375, availH / 812);
  document.documentElement.style.setProperty("--app-scale", scale.toFixed(4));
  updateSplashWater();
}

window.addEventListener("resize", fitApp);
// 아이폰에서 주소창이 접히거나 회전할 때도 다시 맞춘다
window.addEventListener("orientationchange", fitApp);
window.addEventListener("pageshow", fitApp);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fitApp);
  window.visualViewport.addEventListener("scroll", fitApp);
}

// 아이폰 사파리는 처음 몇 백 ms 동안 툴바 높이가 확정되지 않아
// 로드 직후의 값이 실제와 다르다. 잠깐씩 다시 재어 맞춘다.
[120, 400, 900, 1800].forEach((ms) => setTimeout(fitApp, ms));

// ================= 시작 =================

fitApp();

buildTracks();
renderSoundToggle();
renderSpeedToggle();
buildHearts();
buildRain();
// 첫 화면은 HTML 에서 이미 is-active 라 showScreen 이 일찍 빠져나간다.
// 바깥 배경층은 여기서 한 번 맞춰 준다. (배경은 폰트와 무관하게 바로 보인다)
syncBackdrop(document.getElementById("screen-splash"));

// ================= 폰트가 준비된 뒤에 시작 =================
//
// 폰트가 오기 전에 시작하면 시스템 기본 글꼴로 먼저 그려졌다가 바뀐다.
// @font-face 를 font-display: block 으로 두어 글자가 안 그려지게 했고,
// 여기서는 폰트가 다 온 뒤에 화면을 띄운다. 그때까지는 배경색만 보인다.
//
// 스플래시 진행도 이때 시작한다. 미리 돌려두면 화면이 나타나는 순간
// 이미 30% 쯤 차 있어서 0 부터 차오르는 그림이 깨진다.
const FONT_WAIT_MS = 2000;

// 실제로 쓰는 조합만 골라 미리 받는다.
// 글자가 화면에 올라가야 폰트를 요청하는데, 지금은 글자를 안 그리고 있어서
// 이렇게 직접 요청하지 않으면 document.fonts.ready 가 그냥 바로 끝나버린다.
const FONTS_IN_USE = [
  "48px Ownglyph_positive",
  "24px Ownglyph_positive",
  "400 15px Pretendard",
  "500 18px Pretendard",
  "600 20px Pretendard",
  "700 20px Pretendard",
];

// Pretendard 는 동적 서브셋이라 글자 범위별로 파일이 쪼개져 있다.
// 어떤 조각이 필요한지는 글자를 넘겨야 알 수 있으므로, 앱에서 쓰는 문구를
// 전부 모아 넘긴다. 문구가 바뀌어도 여기 손댈 일이 없다.
const APP_TEXT = (() => {
  const parts = [];
  SCREEN_TEXTS.forEach((t) => {
    Object.keys(t).forEach((k) => {
      if (k !== "id" && typeof t[k] === "string") parts.push(t[k]);
    });
  });
  CRY_MESSAGES.forEach((m) => parts.push(m.text));
  BREATH_STEPS.forEach((s) => parts.push(s.label));
  parts.push("0123456789% .,");
  // 같은 글자를 여러 번 넘길 필요는 없다
  return Array.from(new Set(parts.join("").split(""))).join("");
})();

function startApp() {
  appEl.classList.add("is-ready");
  renderScreen("SPLASH");
}

(function waitForFonts() {
  if (!document.fonts || !document.fonts.ready) { startApp(); return; }

  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    startApp();
  };

  // 폰트가 아무리 늦어도 이 시간이 지나면 그냥 시작한다
  setTimeout(go, FONT_WAIT_MS);

  Promise.all(
    FONTS_IN_USE.map((f) => document.fonts.load(f, APP_TEXT).catch(() => {}))
  )
    .then(() => document.fonts.ready)
    .then(go)
    .catch(go);
})();
