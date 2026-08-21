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
// 지금 어느 단계를 언제부터 하고 있는가. 백그라운드에서 돌아왔을 때
// 나간 지점부터 이어 붙이려면 이 둘이 있어야 한다.
let breathStepIndex = 0;
let breathStepStartTs = null;
let breathIntroStartTs = null;
let warmRafId = null;
let warmLastTs = null;
let blobTimers = [];
let refillRafId = null;
let refillDoneTimer = null;

// ================= 소리 =================

// 트랙마다 Audio 객체를 딱 하나만 만들어 두고 계속 쓴다.
// 화면이 바뀌어도 새로 만들지 않으므로 소리가 끊기지 않는다.

// ===== 볼륨 값이 뜻하는 것 =====
// 두 mp3 는 파일 자체가 EBU R128 -23 LUFS 로 정규화돼 있다.
// 정규화 후 실측 (ffmpeg loudnorm) :
//   rain.mp3    -23.39 LUFS / -0.80 dBTP / LRA 1.6  / 467.590s
//   breath.mp3  -23.44 LUFS / -4.76 dBTP / LRA 9.8  / 248.450s
// 두 파일 차이가 0.05 dB 라 이제 같은 숫자를 넣으면 같은 크기로 들린다.
// (예전에는 원본이 20.1 LU 나 차이 나서 트랙마다 값을 따로 맞춰야 했다.)
//
// 그래서 아래 값은 "기준(-23 LUFS)보다 몇 dB 아래로 낼 것인가" 만 뜻한다.
// 계산식으로 만들지 않는다. 계산식은 파일을 바꾸면 조용히 틀어진다.
//   1.00 =  0.0 dB → 약 -23   LUFS
//   0.95 = -0.4 dB → 약 -23.4 LUFS
//   0.56 = -5.0 dB → 약 -28   LUFS
//
// 빗소리는 늘 깔려 있고, 누르고 있는 동안에만 커진다.
const RAIN_VOLUME_IDLE = 0.56;   // 평상시 빗소리 : -5.0 dB → 약 -28   LUFS
const RAIN_VOLUME_CRYING = 1.0;  // 누르는 동안   :  0.0 dB → 약 -23   LUFS
const BREATH_VOLUME = 0.95;      // 호흡 화면     : -0.4 dB → 약 -23.4 LUFS

// 트랙마다 페이드 시간을 따로 정한다.
//   rain   : 켤 때는 스며들 듯 길게, 끌 때는 짧게.
//            호흡 화면에 들어가면 빗소리가 곧바로 물러나야 한다.
//   breath : 호흡 화면의 배경음. 들고 날 때 모두 1.5초.
// 주소 뒤의 ?v= 는 캐시를 깨기 위한 것이다. 지우지 말 것.
// vercel.json 이 /sounds/ 에 max-age=31536000, immutable 을 걸어 두었다.
// 파일 내용을 바꿔도 이름이 같으면 기존 사용자는 브라우저·CDN 캐시에서
// 1년 동안 옛 파일을 계속 받는다 (서비스워커 CACHE_VERSION 을 올려도
// 그 아래 HTTP 캐시 층까지는 비우지 못한다).
// 소리 파일을 다시 만들 때마다 이 숫자를 올리고 sw.js 의 AUDIO_ASSETS 도 같이 맞춘다.
// v2 : EBU R128 -23 LUFS 정규화
//
// ===== v3 : 앞뒤 무음을 잘라내 loop 이음새를 없앴다 =====
// loop=true 는 파일이 끝나면 곧바로 처음으로 돌아간다. 그래서 파일 앞뒤에
// 무음이 있으면 그 둘이 이어져 "뚝 끊겼다가 다시 들리는" 구간이 된다.
// 실측한 무음 (브라우저에서 이음새 전후 출력을 재서 확인) :
//   rain   앞 204ms + 뒤 8ms   = 212ms  → 7분 48초마다 한 번
//   breath 앞 23ms + 뒤 625ms  = 648ms  → 4분 9초마다 한 번
// 원본(sounds/original)에도 그대로 있던 무음이다. 정규화가 만든 것이 아니다.
//
// 원본에서 그 구간을 잘라내고 다시 정규화했다. breath 는 끝의 2초짜리
// 페이드아웃까지 걷어냈다 (그대로 두면 소리가 잦아들다 갑자기 커진다).
// 다시 만든 뒤 실측 : rain 이음새 무음 0ms, breath 10ms (들리지 않는다).
//
// mp3 를 다시 만들 때는 반드시 앞뒤 무음부터 확인할 것.
// mp3 인코더는 앞에 20ms 안팎의 여백을 자동으로 붙이는데, 크롬은 LAME
// 갭리스 태그를 읽어 그건 알아서 건너뛴다. 문제가 되는 것은 "내용" 의 무음이다.
const SOUND = {
  rain:   { src: "sounds/rain.mp3?v=3",   volume: RAIN_VOLUME_CRYING, fadeIn: 1800, fadeOut: 500 },
  breath: { src: "sounds/breath.mp3?v=3", volume: BREATH_VOLUME,      fadeIn: 1500, fadeOut: 1500 },
};

const SOUND_FADE_MS = 1800; // 설정이 없을 때 쓰는 기본값

// 처음엔 아주 천천히, 끝에서도 완만하게 (smoothstep)
const easeVolume = (p) => p * p * (3 - 2 * p);

const tracks = {};
let isMuted = false;
let audioUnlocked = false;
// 앱이 화면에서 벗어나 소리를 내려둔 상태인가. 실제 처리는 파일 맨 아래에 있다.
// (선언만 여기에 둔다 — dbgSnapshot 이 이 값을 읽는다)
let inBackground = false;
// 트랙별 목표 볼륨. 0 이면 꺼진 것으로 본다. (음소거와 별개)
const soundLevel = { rain: 0, breath: 0 };

// ===== 소리 흐름 추적 =====
// 소리가 안 날 때 어느 지점에서 끊겼는지 보려면 켠다. 평소에는 조용하다.
//
// ===== 켜고 끄는 방법은 주소 하나뿐이다 =====
//   켜기 : 주소 뒤에 ?audiodebug=1
//   끄기 : 그 부분을 지우고 다시 접속하거나, 패널의 "끄기" 를 누른다
//
// 예전에는 localStorage 로도 켤 수 있게 해뒀다. 그런데 그렇게 켜면 주소를
// 지워도 값이 남아 계속 따라다닌다. 껐다고 생각한 뒤에도 패널이 그대로
// 뜨는데 주소에는 아무것도 없으니 왜 뜨는지 알 수가 없다.
// 그래서 주소에 있을 때만 켜고, 예전에 남아 있던 값은 지워 버린다.
let audioDebug = false;
try {
  audioDebug = new URLSearchParams(location.search).get("audiodebug") === "1";
} catch (e) {
  audioDebug = location.search.indexOf("audiodebug=1") !== -1;
}
try {
  // 예전 방식으로 켜 둔 것이 있으면 여기서 정리한다. 다시는 이걸로 안 켜진다.
  localStorage.removeItem("ulmongAudioDebug");
} catch (e) {
  /* 시크릿 모드 등에서 localStorage 가 막혀 있어도 그냥 넘어간다 */
}

const dbg = { root: null, now: null, log: null, lines: [], timer: null };
const DEBUG_LOG_MAX = 120;

function dbgPush(text) {
  if (!audioDebug) return;
  const at = (performance.now() / 1000).toFixed(1);
  dbg.lines.push(at + "s  " + text);
  if (dbg.lines.length > DEBUG_LOG_MAX) dbg.lines.shift();
  if (dbg.log) {
    dbg.log.textContent = dbg.lines.join("\n");
    dbg.log.scrollTop = dbg.log.scrollHeight;
  }
}

function trace(where, detail) {
  if (!audioDebug) return;
  const line = where + (detail ? " : " + detail : "");
  console.log("[소리·추적] " + line);
  dbgPush(line);
}

// 지금 트랙들이 어떤 상태인지 한 줄로
function trackSummary() {
  return Object.keys(SOUND)
    .map((name) => {
      const t = tracks[name];
      if (!t || !t.audio) return name + "=없음";
      const vol = t.gain ? t.gain.gain.value : t.audio.volume;
      return (
        name + "{목표 " + soundLevel[name] +
        ", 실제 " + vol.toFixed(3) +
        ", " + (t.audio.paused ? "멈춤" : "재생중") +
        ", readyState " + t.audio.readyState + "}"
      );
    })
    .join(" ");
}

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
      gain.gain.value = t.audio.volume; // 지금까지의 볼륨을 그대로 이어받는다
      source.connect(gain);
      gain.connect(audioCtx.destination);
      t.gain = gain;

      // ===== 여기를 지우면 안드로이드에서 소리가 완전히 사라진다 =====
      // 크롬은 요소의 volume 을 그래프에 들어가기 "전" 에 곱한다.
      // buildTracks 가 넣어둔 volume=0 을 그대로 두면 그다음부터는
      // gain 을 아무리 올려도 0 × n = 0 이라 영원히 무음이다.
      // paused 는 false, currentTime 도 정상으로 흐르고 state 도 running 이라
      // 겉으로는 멀쩡해 보인다. 그래서 찾기 어려웠다.
      //
      // 아이폰 사파리는 volume 을 아예 무시해서(그래서 GainNode 를 쓴다)
      // 이 줄이 없어도 들렸다. 안드로이드에서만 안 나던 이유가 이것이다.
      //
      // 연결된 뒤로 요소는 소리를 그냥 통과시키기만 하고,
      // 볼륨은 오직 GainNode 하나가 맡는다.
      t.audio.volume = 1;
    } catch (e) {
      /* 이 트랙만 예전 방식으로 둔다 */
    }
  });
}

// iOS 는 화면을 벗어났다 돌아오면 컨텍스트를 재워둔다. 필요할 때마다 깨운다.
//
// 컨텍스트가 suspended 로 남아 있으면 audio 는 "재생중" 인데 소리만 안 난다.
// paused 가 false 라 멀쩡해 보여서 특히 찾기 어렵다. 그래서 결과를 남긴다.
function resumeAudioCtx() {
  if (!audioCtx) return;
  if (audioCtx.state !== "suspended") return;
  const p = audioCtx.resume();
  if (p && p.then) {
    p.then(
      () => trace("AudioContext.resume 성공", "state=" + audioCtx.state),
      (e) => logAudioError("AudioContext", "resume 실패", (e && e.message) || String(e))
    );
  }
}

// ===== 소리가 안 날 때 원인을 찾기 위한 로그 =====
// 소리는 조용히 실패한다. 화면은 멀쩡히 돌아가고 소리만 안 나서
// 경로가 틀린 건지, 파일이 깨진 건지, 브라우저가 막은 건지 알 수가 없었다.
// 그래서 실패한 지점마다 이유를 콘솔에 남긴다. 앱 동작은 막지 않는다.

// HTMLMediaElement.error 의 code. 숫자만 봐서는 뜻을 알 수 없다.
const MEDIA_ERROR_TEXT = {
  1: "MEDIA_ERR_ABORTED — 내려받는 중에 중단됐습니다 (사용자나 스크립트가 멈춤)",
  2: "MEDIA_ERR_NETWORK — 네트워크가 끊겨 받다가 실패했습니다",
  3: "MEDIA_ERR_DECODE — 파일은 받았는데 소리로 풀지 못했습니다 (파일 손상 또는 지원하지 않는 인코딩)",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED — 파일을 찾지 못했거나(404·경로 오류) 브라우저가 지원하지 않는 형식입니다",
};

function describeMediaError(mediaError) {
  if (!mediaError) return "알 수 없는 오류 (error 객체가 비어 있음)";
  const text = MEDIA_ERROR_TEXT[mediaError.code] || ("알 수 없는 code: " + mediaError.code);
  // message 는 브라우저마다 있을 수도, 빈 문자열일 수도 있다
  return mediaError.message ? text + " / " + mediaError.message : text;
}

function logAudioError(name, where, detail) {
  const line = name + " — " + where + " : " + detail;
  console.error("[소리] " + line);
  dbgPush("!! " + line);
}

// play() 는 거절돼도 예외를 던지지 않고 조용히 거절된 Promise 만 남긴다.
// NotAllowedError 는 자동재생 차단(사용자 입력 없이 재생 시도),
// NotSupportedError 는 소스 자체를 못 여는 경우다.
function playTrack(name, t, where, onPlaying) {
  if (!t || !t.audio) return;
  trace("play() 호출 — " + name, where);
  let p;
  try {
    p = t.audio.play();
  } catch (e) {
    logAudioError(name, where + " play() 예외", e && e.message ? e.message : String(e));
    return;
  }
  if (!p || !p.catch) { // Promise 를 안 돌려주는 옛 브라우저
    if (onPlaying) onPlaying();
    return;
  }

  // 재생이 시작되기 전에 pause() 를 하면 이 play() 가 통째로 취소된다(AbortError).
  // 그러면 잠금 해제가 성립하지 않는다. 그래서 "재생 요청이 아직 처리 중"
  // 이라는 표시를 남기고, 그동안에는 아무도 이 트랙을 멈추지 못하게 한다.
  t.playPending = true;
  p.then(
    () => {
      t.playPending = false;
      trace("play() 성공 — " + name, where);
      if (onPlaying) onPlaying();
    },
    () => { t.playPending = false; }
  );

  p.catch((e) => {
    const kind = e && e.name ? e.name : "UnknownError";
    let why = e && e.message ? e.message : "";
    if (kind === "NotAllowedError") {
      why = "브라우저가 자동재생을 막았습니다. 사용자가 화면을 누른 뒤에만 재생할 수 있습니다. " + why;
    } else if (kind === "NotSupportedError") {
      why = "소스를 열 수 없습니다. 경로(" + SOUND[name].src + ")와 파일 형식을 확인하세요. " + why;
    }
    logAudioError(name, where + " play() 거절 (" + kind + ")", why);
  });
}

function buildTracks() {
  Object.keys(SOUND).forEach((name) => {
    const audio = new Audio(SOUND[name].src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    // 파일을 못 읽어도 앱은 그대로 동작한다. 대신 이유는 반드시 남긴다.
    audio.addEventListener("error", () => {
      tracks[name].failed = true;
      logAudioError(
        name,
        "파일 읽기 실패 (" + SOUND[name].src + ")",
        describeMediaError(audio.error)
      );
    });
    tracks[name] = { audio, gain: null, rafId: null, failed: false, playPending: false };
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
// fadeMsOverride 를 주면 트랙별 페이드 시간 대신 그 값을 쓴다.
// 백그라운드에서 돌아올 때처럼 짧게 되살려야 하는 경우에만 쓴다.
function applyAudio(fadeMsOverride) {
  if (!audioUnlocked) {
    trace("applyAudio 건너뜀", "아직 잠금이 안 풀렸다 (audioUnlocked=false)");
    return;
  }
  trace("applyAudio", trackSummary() + (isMuted ? " / 음소거 켜짐" : ""));
  resumeAudioCtx();

  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t || !t.audio || t.failed) return;

    const level = soundLevel[name];
    const target = isMuted ? 0 : level;

    if (level > 0 && t.audio.paused && !t.playPending) {
      playTrack(name, t, "applyAudio");
    }

    // 페이드 시간은 트랙마다 다르다 (SOUND 참고)
    const cfg = SOUND[name];
    const fadeMs =
      fadeMsOverride ||
      (target < trackVolume(t)
        ? cfg.fadeOut || SOUND_FADE_MS
        : cfg.fadeIn || SOUND_FADE_MS);

    fadeTo(name, target, () => {
      // 이 트랙이 필요 없어졌을 때만 멈춘다. 음소거는 멈추지 않는다.
      //
      // playPending 을 반드시 봐야 한다. 볼륨이 이미 목표값이면 fadeTo 가
      // 이 콜백을 그 자리에서(동기로) 부르는데, 방금 play() 한 트랙이
      // 여기에 걸리면 재생이 시작되기도 전에 취소된다.
      // 그 경우 멈추는 일은 play() 가 끝난 뒤 onPlaying 이 맡는다.
      if (soundLevel[name] === 0 && !t.audio.paused && !t.playPending) {
        trace("트랙 정지 — " + name, "목표 볼륨이 0 이라 멈춘다");
        t.audio.pause();
      }
    }, fadeMs);
  });
}

function setScreenAudio(state, fadeMsOverride) {
  const onBreath =
    state === "BREATH_INTRO" || state === "BREATHING" || state === "BREATH_DONE";

  // 스플래시와 "화면을 눌러 시작하기" 는 아직 소리가 없는 구간이다.
  // 브라우저가 자동재생을 막고 있어 어차피 들리지도 않는다.
  const onIntro = state === "SPLASH" || state === "TAP_TO_START";

  // 빗소리는 HOME 부터 늘 깔려 있다가 누르는 동안만 조금 커진다.
  // 볼륨만 바뀌므로 버튼을 떼도 끊기지 않고 원래 크기로 되돌아간다.
  // 호흡 화면에서는 완전히 멈춘다.
  if (onIntro || onBreath) {
    soundLevel.rain = 0;
  } else {
    soundLevel.rain = state === "CRYING" ? RAIN_VOLUME_CRYING : RAIN_VOLUME_IDLE;
  }

  // 호흡 화면의 배경음. 준비(BREATH_INTRO)에서 스며들어 호흡 중에도
  // 그대로 이어지고, 호흡이 끝나면(BREATH_DONE) 빠져나간다.
  // 두 상태가 한 화면을 쓰므로 그 사이에는 끊길 일이 없다.
  soundLevel.breath = state === "BREATH_INTRO" || state === "BREATHING"
    ? BREATH_VOLUME
    : 0;

  trace("setScreenAudio(" + state + ")",
    "빗소리 목표 " + soundLevel.rain + " / 호흡 목표 " + soundLevel.breath);

  applyAudio(fadeMsOverride);
}

// "화면을 눌러 시작하기" 를 누른 순간 빗소리를 0 에서부터 올리기 시작한다.
// 한 번만 걸어두면 긴 페이드(SOUND_FADE_MS)가 HOME 진입 후까지 그대로 이어져
// 화면이 바뀌는 동안 소리가 자연스럽게 스며든다.
let rainStarted = false;
function startRainPreroll() {
  if (rainStarted) return;
  rainStarted = true;
  soundLevel.rain = RAIN_VOLUME_IDLE;
  trace("startRainPreroll", "빗소리 목표를 " + RAIN_VOLUME_IDLE + " 로");
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

// ===== 브라우저 자동재생 잠금 풀기 =====
//
// 재생하려면 "사용자 입력" 이 있어야 한다. 그런데 어떤 이벤트가 사용자
// 입력으로 인정되는지가 입력 장치마다 다르다. HTML 명세가 정한 목록은
//   pointerdown — pointerType 이 "mouse" 일 때만 인정
//   pointerup   — 마우스가 아닐 때(터치·펜) 인정
//   touchend / keydown / click — 인정
// 즉 **터치스크린에서 pointerdown 은 사용자 입력으로 치지 않는다.**
//
// 예전에는 startFromTap(pointerdown) 안에서 잠금을 풀었다. 마우스로는
// 멀쩡히 됐지만 폰은 언제나 터치라 폰에서만 영영 안 풀렸다.
// AudioContext 가 suspended 로 태어나고 play() 는 NotAllowedError 로 막혔다.
// 화면은 정상이고 소리만 안 나서 원인을 찾기 어려웠다.
//
// 그래서 잠금 해제를 화면 전환에서 떼어내, 인정되는 이벤트에 모두 건다.
// 여러 번 불려도 안전하고, 아직 안 풀렸으면 그다음 입력에서 다시 시도한다.

// 잠금이 실제로 풀렸는가. audioUnlocked 플래그만으로는 모자란다 —
// 시도는 했지만 브라우저가 거절했을 수 있다.
function isAudioReady() {
  if (!audioUnlocked) return false;
  // 컨텍스트가 자고 있으면 audio 는 돌아도 소리가 안 나온다
  if (audioCtx && audioCtx.state !== "running") return false;
  // 나야 할 트랙이 멈춰 있으면 아직 안 풀린 것이다
  return !Object.keys(SOUND).some((name) => {
    const t = tracks[name];
    return t && t.audio && !t.failed && soundLevel[name] > 0 && t.audio.paused;
  });
}

function unlockAudio(reason) {
  if (isAudioReady()) return;
  trace("잠금 해제 시도", reason || "");

  // 이 입력 안에서 만들어야 브라우저가 AudioContext 를 살려둔다
  routeThroughGain();
  resumeAudioCtx();
  audioUnlocked = true;

  // tracks 가 아니라 SOUND 를 돈다. 트랙 하나가 안 만들어졌더라도
  // 그 사실이 로그에 남고 나머지는 그대로 풀린다.
  //
  // rain·breath 를 둘 다 풀어야 한다. 잠금은 트랙(요소)마다 따로 걸려서,
  // 빗소리만 풀면 호흡 트랙은 잠긴 채 남고 나중에 호흡 화면에서 처음
  // play() 할 때 그 순간 사용자 입력이 없어 막힌다.
  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t || !t.audio) {
      logAudioError(name, "잠금 해제", "트랙이 만들어지지 않았습니다 (buildTracks 확인)");
      return;
    }
    // 이미 돌고 있는 트랙은 건드리지 않는다. 볼륨을 0 으로 되돌리면
    // 들리던 소리가 끊긴다.
    if (!t.audio.paused || t.playPending) return;

    // 지금 필요 없는 트랙은 소리 없이 잠깐 재생해 잠금만 푼다
    if (soundLevel[name] === 0) setTrackVolume(t, 0);

    playTrack(name, t, "unlockAudio 잠금 해제", () => {
      if (soundLevel[name] === 0) {
        trace("트랙 정지 — " + name, "잠금만 풀고 도로 멈춘다");
        t.audio.pause();
      }
    });
  });

  applyAudio();
}

// 사용자 입력으로 인정되는 이벤트에 모두 건다.
// 계속 붙여 둔다 — 한 번에 성공하지 못했을 때(첫 입력이 인정되지 않는
// 종류였거나 컨텍스트가 다시 잠들었을 때) 다음 입력에서 저절로 회복된다.
// isAudioReady() 가 true 면 곧바로 빠져나오므로 비용은 없다.
["pointerup", "touchend", "click", "keydown"].forEach((type) => {
  document.addEventListener(type, () => unlockAudio(type), { passive: true });
});

// 화면을 벗어났다 돌아왔을 때의 처리는 파일 맨 아래
// "앱이 화면에서 벗어났을 때" 에 모아 두었다. 소리뿐 아니라 호흡 사이클까지
// 같이 멈춰야 해서, 상태 변수들이 다 선언된 뒤라야 한다.

// ===== 화면에 띄우는 소리 로그 (?audiodebug=1) =====
//
// 안드로이드 폰은 콘솔을 볼 수가 없다. USB 디버깅을 붙이지 않으면
// console.log 는 아무 데도 남지 않는다. 그래서 화면에 직접 띄운다.
//
// 이 패널은 pointer-events: none 이라 손가락이 그대로 앱까지 통과한다.
// 로그를 띄운 채로 평소처럼 눌러 봐야 원인이 보이기 때문이다.
// (윗줄 막대만 눌린다 — 접기·복사)
// 지금 이 순간의 상태. 소리가 안 날 때 어디가 0 인지 한눈에 보라고 만든 것이다.
function dbgSnapshot() {
  const rows = [];
  const ctx = audioCtx
    ? audioCtx.state + "  " + audioCtx.sampleRate + "Hz  t=" + audioCtx.currentTime.toFixed(1)
    : "없음 (아직 안 만듦)";
  rows.push("AudioContext : " + ctx);
  rows.push("잠금         : audioUnlocked=" + audioUnlocked + "  준비됨=" + isAudioReady());

  const ua = navigator.userActivation;
  rows.push("사용자입력   : " + (ua ? "지금=" + ua.isActive + "  이전에=" + ua.hasBeenActive : "userActivation 없음"));

  const standalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
  rows.push("표시모드     : " + (standalone ? "standalone (설치된 앱)" : "브라우저 탭"));
  rows.push("음소거       : " + (isMuted ? "켜짐" : "꺼짐") + "   화면=" + currentState);
  rows.push(
    "백그라운드   : " + (inBackground ? "나가 있음 (소리 내림)" : "앱 안") +
    "   visibility=" + document.visibilityState
  );

  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t || !t.audio) { rows.push(name.padEnd(7) + ": 트랙 없음"); return; }
    const a = t.audio;
    rows.push(
      name.padEnd(7) + ": " + (a.paused ? "멈춤  " : "재생중") +
      "  목표 " + soundLevel[name].toFixed(2) +
      "  gain " + (t.gain ? t.gain.gain.value.toFixed(3) : "없음 ") +
      "  el.volume " + a.volume.toFixed(2) +
      (a.muted ? " (muted)" : "")
    );
    rows.push(
      "         t=" + a.currentTime.toFixed(1) +
      "  ready=" + a.readyState + "  net=" + a.networkState +
      (t.failed ? "  [읽기 실패]" : "") +
      (t.playPending ? "  [재생 요청 처리중]" : "") +
      (a.error ? "\n         오류 " + describeMediaError(a.error) : "")
    );
  });

  // el.volume 이 0 인데 gain 이 있으면 크롬에서는 소리가 절대 안 난다.
  // 이번 버그가 정확히 그것이었다. 눈에 띄게 따로 적어 준다.
  const muteBug = Object.keys(SOUND).some((name) => {
    const t = tracks[name];
    return t && t.audio && t.gain && t.audio.volume === 0;
  });
  if (muteBug) rows.push("!! el.volume 이 0 이다 — 크롬은 이걸 그래프 앞에서 곱한다. 무조건 무음.");

  return rows.join("\n");
}

function buildAudioDebugPanel() {
  if (!audioDebug || dbg.root) return;

  const root = document.createElement("div");
  root.className = "audiodbg";

  const bar = document.createElement("div");
  bar.className = "audiodbg__bar";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "audiodbg__btn";
  toggle.textContent = "소리 로그 접기";
  toggle.addEventListener("click", () => {
    const off = root.dataset.collapsed === "true";
    root.dataset.collapsed = off ? "false" : "true";
    toggle.textContent = off ? "소리 로그 접기" : "소리 로그 펴기";
  });

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "audiodbg__btn";
  copy.textContent = "복사";
  copy.addEventListener("click", () => {
    const text = dbgSnapshot() + "\n\n" + dbg.lines.join("\n") + "\n\nUA: " + navigator.userAgent;
    const done = () => { copy.textContent = "복사됨"; setTimeout(() => { copy.textContent = "복사"; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { copy.textContent = "복사 실패"; });
    } else {
      copy.textContent = "복사 안 됨";
    }
  });

  // 설치한 앱에는 주소창이 없어서 ?audiodebug=1 을 손으로 지울 수가 없다.
  // 그래서 화면에서 끌 수 있게 해 둔다. 주소에서도 같이 지우므로
  // 새로고침해도 다시 뜨지 않는다.
  const off = document.createElement("button");
  off.type = "button";
  off.className = "audiodbg__btn";
  off.textContent = "끄기";
  off.addEventListener("click", () => {
    audioDebug = false; // trace·dbgPush 가 여기서부터 아무것도 안 한다
    if (dbg.timer) { clearInterval(dbg.timer); dbg.timer = null; }
    root.remove();
    dbg.root = null;
    dbg.now = null;
    dbg.log = null;
    try {
      const u = new URL(location.href);
      u.searchParams.delete("audiodebug");
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) {
      /* 주소를 못 고쳐도 패널은 이미 사라졌다 */
    }
  });

  bar.appendChild(toggle);
  bar.appendChild(copy);
  bar.appendChild(off);

  dbg.now = document.createElement("pre");
  dbg.now.className = "audiodbg__now";

  dbg.log = document.createElement("pre");
  dbg.log.className = "audiodbg__log";

  root.appendChild(bar);
  root.appendChild(dbg.now);
  root.appendChild(dbg.log);
  document.body.appendChild(root);
  dbg.root = root;

  // 상태는 계속 바뀐다. 페이드가 도는 것도 보여야 해서 자주 고쳐 그린다.
  dbg.timer = setInterval(() => { dbg.now.textContent = dbgSnapshot(); }, 250);

  // 소리와 무관한 오류도 소리를 멈추게 할 수 있다. 같이 띄운다.
  window.addEventListener("error", (e) => dbgPush("!! 오류 " + e.message + " (" + (e.filename || "").split("/").pop() + ":" + e.lineno + ")"));
  window.addEventListener("unhandledrejection", (e) => dbgPush("!! 처리 안 된 거절 " + ((e.reason && e.reason.message) || e.reason)));

  dbgPush("소리 로그 시작 — " + navigator.userAgent);
}

if (audioDebug) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildAudioDebugPanel);
  } else {
    buildAudioDebugPanel();
  }
}

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
  trace("startFromTap", "화면을 눌러 시작");

  // 순서가 중요하다. 목표 볼륨을 먼저 정해 두고 잠금을 푼다.
  // 반대로 하면 잠금 해제 직후의 applyAudio 가 "빗소리 목표는 0" 인 상태로
  // 돌면서 방금 재생한 트랙을 도로 멈춰버린다.
  startRainPreroll();

  // 여기서 unlockAudio 를 부르지 않는다. 이 함수는 pointerdown 에서 오는데
  // 터치에서는 pointerdown 이 사용자 입력으로 인정되지 않아 반드시 실패한다.
  // 잠금 해제는 document 에 걸어둔 pointerup/touchend/click 이 맡는다.
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
      // 손가락을 누른 채로 넘어가는 전환이다. 이 자리에 "숨쉬러 가기" 가
      // 새로 생기므로, 손을 뗄 때 그 뗌이 그 버튼의 click 이 되지 않게 막는다.
      if (pressActive) heldThroughTransition = true;
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

// ===== 포인터 캡처 =====
// 손가락이 버튼 밖으로 나가도 뗄 때까지 계속 우는 상태를 유지한다.
//
// 캡처를 버튼에 걸면 안 된다. 누르는 즉시 화면이 CRYING 으로 바뀌면서
// 방금 누른 버튼(homeButton/releasedButton)이 화면에서 사라지는데,
// 캡처를 가진 요소가 문서에서 빠지면 캡처도 그 자리에서 풀린다.
// 그래서 어느 화면에서도 사라지지 않는 #app 이 포인터를 잡는다.
// 캡처를 걸면 이후 그 포인터의 이벤트는 전부 #app 에서 나므로,
// window 에 걸어둔 pointerup 은 그대로(버블링으로) 받는다.
let capturedPointerId = null;

// ===== 손 떼는 동작이 새 버튼을 눌러버리는 것 막기 =====
// 하트가 0 이 되면 누르고 있는 도중에 CRY_DONE 으로 넘어간다.
// 방금까지 울기 버튼이 있던 자리에 "숨쉬러 가기" 가 새로 생기므로,
// 손가락을 그대로 떼면 그 뗌이 그대로 그 버튼의 click 이 되어
// "조금 더 울기" 를 볼 새도 없이 호흡 화면으로 넘어가 버린다.
//
// 그래서 누른 채로 화면이 바뀌면, 그 손가락을 뗄 때까지 새 화면의 버튼을
// 받지 않는다. 손을 떼고 "다시 눌러야" 반응한다.
//
// 뗀 즉시 풀면 소용이 없다. click 은 pointerup 바로 뒤에 따라오므로
// 그때 이미 풀려 있으면 그대로 눌린다. 그래서 뗀 뒤로 잠깐 더 잠가 둔다.
// 전환 시각이 아니라 "손을 뗀 시각" 이 기준이다 — 하트가 빈 뒤에도
// 한참 누르고 있다가 떼는 경우가 있어서, 전환 기준으로는 막지 못한다.
const REARM_AFTER_RELEASE_MS = 300;
let pressActive = false;           // 지금 버튼을 누르고 있는가
let heldThroughTransition = false; // 누른 채로 화면이 바뀌었는가
let rearmAt = 0;                   // 이 시각이 지나야 버튼을 받는다

// 누른 채로 넘어온 화면의 버튼이면 아직 받지 않는다
function buttonBlocked() {
  if (!heldThroughTransition) return false;
  if (pressActive) return true;                  // 아직 손가락이 붙어 있다
  if (performance.now() < rearmAt) return true;  // 뗀 직후 따라온 click 이다
  heldThroughTransition = false;                 // 이제부터 정상으로 받는다
  return false;
}

function capturePointer(event) {
  if (!appEl || typeof appEl.setPointerCapture !== "function") return;
  if (event.pointerId === undefined) return;
  try {
    appEl.setPointerCapture(event.pointerId);
    capturedPointerId = event.pointerId;
  } catch (e) {
    // 캡처에 실패해도 누르기 자체는 그대로 동작한다 (버튼 안에서만 유지)
  }
}

function releasePointer() {
  if (capturedPointerId === null) return;
  const id = capturedPointerId;
  capturedPointerId = null;
  try {
    if (appEl.hasPointerCapture && appEl.hasPointerCapture(id)) {
      appEl.releasePointerCapture(id);
    }
  } catch (e) {
    // 이미 풀렸으면 무시
  }
}

function handlePressStart(event) {
  event.preventDefault();
  if (currentState !== "HOME") return;
  // 화면이 바뀌기 전에 잡아 둔다
  capturePointer(event);
  pressActive = true;
  hasStartedCrying = true;
  cryPressStartTs = typeof event.timeStamp === "number" ? event.timeStamp : performance.now();
  renderScreen("CRYING");
}

// 주의 : 이 핸들러는 window 에 걸려 있어 화면 어디를 눌러도 실행된다.
// 터치 기기에서 pointerup 에 preventDefault() 를 하면 뒤따르는 click 이 취소된다.
// 그래서 상태를 먼저 확인하고, 우는 중일 때만 기본 동작을 막는다.
// (먼저 막아버리면 상단 소리·속도 아이콘의 click 이 영영 오지 않는다.)
//
// 캡처 해제는 상태와 관계없이 먼저 한다. 상태 검사에 걸려 일찍 빠져나가면
// 캡처가 남아 그다음 터치들이 전부 #app 으로 끌려간다.
function handlePressEnd(event) {
  releasePointer();

  // 상태와 관계없이 기록한다. 누른 채로 화면이 바뀌었다면 지금이 그 손가락을
  // 뗀 순간이고, 바로 뒤에 따라올 click 을 막아야 한다.
  if (pressActive) {
    pressActive = false;
    rearmAt = performance.now() + REARM_AFTER_RELEASE_MS;
  }

  if (currentState !== "CRYING") return;
  event.preventDefault();
  renderScreen("HOME");
}

["homeButton", "releasedButton"].forEach((id) => {
  el(id).addEventListener("pointerdown", handlePressStart);
});

// 누르는 순간 화면이 바뀌면서 방금 누른 버튼이 사라지므로 떼는 이벤트는 window 에서 받는다.
// 손을 떼는(pointerup) 것과 시스템이 끊는(pointercancel) 것, 이 둘로만 끝난다.
// pointerleave 로는 끝내지 않는다 — 그게 있으면 손가락이 버튼 밖으로
// 조금만 미끄러져도 울음이 멈춰버린다. 그래서 캡처를 쓰는 것이다.
window.addEventListener("pointerup", handlePressEnd);
window.addEventListener("pointercancel", handlePressEnd);

["homeButton", "releasedButton", "cryingButton"].forEach((id) => {
  el(id).addEventListener("contextmenu", (event) => event.preventDefault());
});

el("cryDoneButton").addEventListener("click", () => {
  if (currentState !== "CRY_DONE") return;
  if (buttonBlocked()) return; // 울다가 손 떼는 동작으로는 넘어가지 않는다
  renderScreen("BREATH_INTRO");
});

el("cryMoreButton").addEventListener("click", () => {
  if (currentState !== "CRY_DONE" || refillRafId) return;
  if (buttonBlocked()) return;
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

  startBreathIntroWait(BREATH_INTRO_MS);
}

// 준비 화면에서 호흡이 시작되기까지 기다리는 시간.
// 백그라운드에서 돌아왔을 때 남은 시간만 다시 걸 수 있게 따로 뺐다.
function startBreathIntroWait(remainMs) {
  breathIntroStartTs = performance.now() - (BREATH_INTRO_MS - remainMs);
  breathStepTimer = setTimeout(() => {
    if (currentState !== "BREATH_INTRO") return;
    breathSetIndex = 0;
    renderScreen("BREATHING");
  }, remainMs);
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

  warmPercent = 0;
  restartBreathCycle();
}

// 들이쉬기부터 다시 시작한다. 온기(warmPercent)는 건드리지 않는다 —
// 처음 시작할 때는 renderBreathing 이 이미 0 으로 맞춰 두고,
// 백그라운드에서 돌아올 때는 나가기 전 값을 그대로 이어야 하기 때문이다.
function restartBreathCycle() {
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

// startAtMs 를 주면 그 단계를 처음부터가 아니라 그 지점부터 이어서 한다.
// 백그라운드에서 돌아왔을 때만 쓴다. 평소에는 항상 0 이다.
function runBreathStep(stepIndex, startAtMs) {
  const step = BREATH_STEPS[stepIndex];
  const durationMs = Number(step.duration);

  // 남은 시간이 0 이 되면 transition 이 아예 안 걸리므로 최소값을 둔다
  const from = Math.max(0, Math.min(durationMs - 50, startAtMs || 0));
  const remainMs = durationMs - from;

  breathStepIndex = stepIndex;
  breathStepStartTs = performance.now() - from;

  el("breathingHelper").textContent = step.label;
  el("breathingCircle").style.transitionDuration = remainMs + "ms";
  el("breathingMouth").style.transitionDuration = remainMs + "ms";

  if (step.id === "inhale") {
    setBreathState(true);
  } else if (step.id === "exhale") {
    setBreathState(false);
    // 내쉬기가 시작되면 짧은 간격으로 우르르 쏟아지고, 간격이 점점 벌어져 잦아든다
    let at = BLOB_START_MS;
    for (let i = 0; i < BLOB_COUNT; i += 1) {
      const spawnAt = at;
      // 이어서 시작하는 경우, 이미 지나간 덩어리는 다시 뱉지 않는다
      if (spawnAt >= from) {
        blobTimers.push(setTimeout(() => spitBlob(i), spawnAt - from));
      }
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
  }, remainMs);
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

// ================= 앱이 화면에서 벗어났을 때 =================
//
// 다른 앱으로 넘어가거나, 홈 버튼을 누르거나, 화면이 꺼지면 소리를 내린다.
// 돌아오면 나가기 전 화면에 맞는 소리를 그대로 되살린다.
//
// ===== 왜 requestAnimationFrame 으로 페이드를 못 거는가 =====
// 화면이 숨는 순간 브라우저는 rAF 를 그 자리에서 멈춘다.
// fadeTo 로 볼륨을 내리면 다음 콜백이 영영 오지 않아서 볼륨이 중간에
// 멈춘 채로 남고, 소리는 백그라운드에서 계속 난다. 정확히 지금 고치려는 증상이다.
// 그래서 나갈 때의 페이드는 GainNode 의 AudioParam 자동화로 건다.
// 자동화는 오디오 스레드가 돌리므로 화면이 숨어도 끝까지 간다.
// (돌아올 때는 rAF 가 다시 도니까 평소의 fadeTo 를 그대로 쓴다.)

const BACKGROUND_FADE_MS = 300;
let bgPauseTimer = null;
let bgCheckTimer = null;
// 호흡 사이클을 멈춰 둔 상태인가
let bgFrozenState = null;
// 나갈 때의 호흡 단계·진행 시간·원과 입의 실제 크기
let bgBreath = null;

// AudioParam 에 자동화가 걸린 채로 두면 fadeTo 가 넣는 값과 서로 덮어쓴다.
// 돌아올 때 예약을 지우고 지금 값에서 다시 출발시킨다.
function clearGainAutomation(t) {
  if (!t || !t.gain || !audioCtx) return;
  const now = audioCtx.currentTime;
  const v = t.gain.gain.value;
  try {
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(v, now);
  } catch (e) {
    /* 자동화가 없으면 그냥 넘어간다 */
  }
}

// 볼륨이 0 으로 다 내려간 뒤에 요소를 멈춘다.
// 숨은 뒤의 setTimeout 은 1 초 단위로 느려질 수 있지만, 그때는 이미
// 무음이라 늦어도 들리는 차이가 없다.
function pauseTracksForBackground() {
  bgPauseTimer = null;
  let pending = false;

  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t || !t.audio) return;

    // 재생 요청이 아직 처리 중이면 지금 멈출 수 없다. 멈추면 그 play() 가
    // 통째로 취소되어(AbortError) 잠금이 안 풀린 것으로 남는다.
    if (t.playPending) { pending = true; return; }

    if (!t.audio.paused) {
      t.audio.pause();
      trace("백그라운드 정지 — " + name, "t=" + t.audio.currentTime.toFixed(1));
    }
    // 컨텍스트가 잠들어 램프가 끝까지 못 갔을 수 있다. 예약을 지우고 0 으로 못 박는다.
    clearGainAutomation(t);
    setTrackVolume(t, 0);
  });

  if (pending) bgPauseTimer = setTimeout(pauseTracksForBackground, 200);
}

// ===== 화면 상태도 같이 멈춘다 =====
//
// 우는 중 : 손을 뗀 것으로 본다. 백그라운드에서는 버튼을 누르고 있을 수
//   없으므로 계속 우는 상태로 두면 앞뒤가 맞지 않는다. 하트는 지금까지
//   줄어든 만큼 그대로 남고, 돌아오면 HOME 에서 다시 누르면 된다.
//   (하트가 저절로 줄지는 않는다 — rAF 라 숨는 즉시 멈춘다.)
//
// 호흡 중 : 사이클을 멈춘다. 단계 전환은 setTimeout 이라 숨어도 계속 돌지만
//   온기 게이지는 rAF 라 멈춘다. 그냥 두면 게이지는 그대로인데 들숨·날숨만
//   혼자 몇 바퀴 돌아, 돌아왔을 때 아무 데서나 이어진다.
function freezeScreenForBackground() {
  bgFrozenState = null;

  if (currentState === "CRYING") {
    releasePointer();
    pressActive = false;
    rearmAt = performance.now() + REARM_AFTER_RELEASE_MS;
    trace("백그라운드 — 울기 중단", "하트 " + Math.round(heartPercent) + "% 로 HOME 복귀");
    renderScreen("HOME"); // clearAllTimers 가 타이머를 전부 정리한다
    return;
  }

  if (currentState === "BREATH_INTRO" || currentState === "BREATHING") {
    bgFrozenState = currentState;

    // ===== 어디까지 했는지 기록해 둔다 =====
    // 단계와 진행 시간뿐 아니라 원·입이 지금 실제로 어떤 크기인지도 같이
    // 남긴다. transition 이 도는 중간에 멈춘 것이라 style.transform 에는
    // 도착 지점만 적혀 있고, 눈에 보이는 크기는 그 중간이기 때문이다.
    // 계산한 값이 아니라 브라우저가 그리고 있던 값을 그대로 가져온다.
    const circle = el("breathingCircle");
    const mouth = el("breathingMouth");
    if (bgFrozenState === "BREATHING") {
      bgBreath = {
        step: breathStepIndex,
        elapsed: breathStepStartTs === null ? 0 : performance.now() - breathStepStartTs,
        circle: getComputedStyle(circle).transform,
        mouth: getComputedStyle(mouth).transform,
      };
    } else {
      bgBreath = {
        intro: true,
        elapsed: breathIntroStartTs === null ? 0 : performance.now() - breathIntroStartTs,
      };
    }

    if (breathStepTimer) { clearTimeout(breathStepTimer); breathStepTimer = null; }
    if (warmRafId) { cancelAnimationFrame(warmRafId); warmRafId = null; }
    warmLastTs = null;
    blobTimers.forEach(clearTimeout);
    blobTimers = [];
    // 날아가던 덩어리는 지운다. 두면 허공에 멈춘 채로 남는다.
    document.querySelectorAll(".breath__emit").forEach((n) => { n.innerHTML = ""; });

    // 멈춘 그 크기에서 더 움직이지 않게 못 박는다. 이렇게 하지 않으면
    // 화면이 숨어 있는 동안에도 transition 이 끝까지 가버려서,
    // 돌아왔을 때 이미 다 부푼 원이 보인다.
    if (bgBreath.circle && bgBreath.circle !== "none") {
      circle.style.transition = "none";
      mouth.style.transition = "none";
      circle.style.transform = bgBreath.circle;
      mouth.style.transform = bgBreath.mouth;
    }

    trace("백그라운드 — 호흡 멈춤",
      bgFrozenState + " / 온기 " + Math.round(warmPercent) + "%" +
      (bgBreath.intro ? "" : " / " + BREATH_STEPS[bgBreath.step].id +
        " " + (bgBreath.elapsed / 1000).toFixed(1) + "초 지점"));
  }
}

function thawScreenAfterBackground() {
  const was = bgFrozenState;
  const b = bgBreath;
  bgFrozenState = null;
  bgBreath = null;
  if (!was || currentState !== was) return;

  if (was === "BREATH_INTRO") {
    const remain = Math.max(300, BREATH_INTRO_MS - ((b && b.elapsed) || 0));
    trace("복귀 — 호흡 준비 이어서", (remain / 1000).toFixed(1) + "초 남음");
    startBreathIntroWait(remain);
    return;
  }

  if (!b) { restartBreathCycle(); return; }

  // ===== 나간 지점 그대로 이어 붙인다 =====
  // 온기(warmPercent)는 건드리지 않는다. 원과 입은 멈춰 있던 크기에서
  // 출발해 그 단계의 남은 시간 동안 도착 지점까지 마저 간다.
  const circle = el("breathingCircle");
  const mouth = el("breathingMouth");

  circle.style.transition = "none";
  mouth.style.transition = "none";
  if (b.circle && b.circle !== "none") circle.style.transform = b.circle;
  if (b.mouth && b.mouth !== "none") mouth.style.transform = b.mouth;

  // 멈춰 있던 크기가 여기서 실제로 커밋되어야 다음 변경이 transition 을 탄다
  void circle.getBoundingClientRect().width;
  void mouth.getBoundingClientRect().width;

  circle.style.transition = "";
  mouth.style.transition = "";

  const step = BREATH_STEPS[b.step] || BREATH_STEPS[0];
  trace("복귀 — 호흡 이어서",
    step.id + " " + (b.elapsed / 1000).toFixed(1) + "초 지점부터 / 온기 " +
    Math.round(warmPercent) + "%");

  startWarmRise();
  runBreathStep(b.step, b.elapsed);
}

function goBackground(reason) {
  if (inBackground) return;
  inBackground = true;
  trace("백그라운드 진입", reason);

  if (bgCheckTimer) { clearTimeout(bgCheckTimer); bgCheckTimer = null; }

  // 화면부터 정리한다. renderScreen 이 소리 목표를 다시 정할 수 있으므로
  // 볼륨을 내리는 것은 그다음이어야 한다.
  freezeScreenForBackground();

  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t || !t.audio) return;

    // 도는 중이던 rAF 페이드는 어차피 멈춘다. 핸들만 정리한다.
    if (t.rafId) { cancelAnimationFrame(t.rafId); t.rafId = null; }

    if (t.gain && audioCtx) {
      const now = audioCtx.currentTime;
      try {
        t.gain.gain.cancelScheduledValues(now);
        t.gain.gain.setValueAtTime(t.gain.gain.value, now);
        t.gain.gain.linearRampToValueAtTime(0, now + BACKGROUND_FADE_MS / 1000);
      } catch (e) {
        setTrackVolume(t, 0);
      }
    } else {
      // GainNode 를 못 쓰는 환경. 페이드 없이 곧바로 내린다.
      setTrackVolume(t, 0);
    }
  });

  if (bgPauseTimer) clearTimeout(bgPauseTimer);
  bgPauseTimer = setTimeout(pauseTracksForBackground, BACKGROUND_FADE_MS + 60);
}

function goForeground(reason) {
  if (!inBackground) return;
  inBackground = false;
  trace("포그라운드 복귀", reason + " / 화면 " + currentState);

  if (bgPauseTimer) { clearTimeout(bgPauseTimer); bgPauseTimer = null; }

  // 예약된 자동화를 지우고 0 에서 다시 올라가게 맞춘다
  Object.keys(SOUND).forEach((name) => {
    const t = tracks[name];
    if (!t || !t.audio) return;
    clearGainAutomation(t);
    setTrackVolume(t, 0);
  });

  // ===== 돌아올 때 잠금이 다시 필요한가 =====
  // 크롬(안드로이드) : 필요 없다. 한 번 누른 문서는 그 문서가 살아 있는 동안
  //   계속 "사용자 입력이 있었던" 것으로 남는다(sticky activation).
  //   play() 도 resume() 도 그대로 통과한다.
  // 사파리(iOS) : 백그라운드로 가면 AudioContext 를 재워 버린다. 돌아와서
  //   resume() 을 부르면 대개 풀리지만 항상은 아니다. 그래서
  //   ① 여기서 먼저 resume 을 시도하고
  //   ② 실패하면 pointerup/touchend/click 에 걸어 둔 unlockAudio 가
  //      그다음 터치에서 저절로 회복시킨다 (isAudioReady() 가 false 라 다시 돈다).
  resumeAudioCtx();

  // 음소거였다면 applyAudio 가 목표를 0 으로 잡으므로 그대로 음소거가 유지된다.
  setScreenAudio(currentState, BACKGROUND_FADE_MS);

  thawScreenAfterBackground();

  // 그래도 안 살아났으면 화면 로그에 남긴다. 폰에서 눈으로 확인할 수 있게.
  if (bgCheckTimer) clearTimeout(bgCheckTimer);
  bgCheckTimer = setTimeout(() => {
    bgCheckTimer = null;
    if (!audioUnlocked || inBackground) return;
    if (isAudioReady()) { trace("복귀 확인", "소리 정상 — " + trackSummary()); return; }
    logAudioError(
      "복귀",
      "소리가 되살아나지 않았습니다",
      "화면을 한 번 누르면 다시 풀립니다. " + trackSummary() +
        " / AudioContext=" + (audioCtx ? audioCtx.state : "없음")
    );
  }, 800);
}

// visibilitychange 하나면 안드로이드는 다 잡힌다 (앱 전환·홈·화면 끄기 모두).
document.addEventListener("visibilitychange", () => {
  if (document.hidden) goBackground("visibilitychange");
  else goForeground("visibilitychange");
});

// iOS 사파리 대응. 페이지를 bfcache 에 넣을 때는 visibilitychange 없이
// pagehide 만 오는 경우가 있어서 같이 건다. 둘 다 와도 안쪽에서 한 번만 돈다.
window.addEventListener("pagehide", () => goBackground("pagehide"));
window.addEventListener("pageshow", (e) => {
  goForeground("pageshow" + (e && e.persisted ? " (bfcache 복원)" : ""));
});

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
