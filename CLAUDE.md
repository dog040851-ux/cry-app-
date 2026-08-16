# 프로젝트: 같이 울어주는 앱 (cry-app)

## 기술 스택 — 예외 없음
- 파일은 index.html, style.css, script.js 3개만. 새 파일 만들지 말 것.
- 바닐라 HTML/CSS/JS만. React, Vue, jQuery, GSAP, Tailwind, 빌드 도구 전부 금지.
- index.html을 더블클릭하면 바로 동작해야 함.

## 디자인 원칙 — 가장 중요
- 디자인을 창작하지 않는다. Figma 시안에 있는 것만 구현한다.
- 시안에 없는 요소를 추가하지 않는다. 시안에 있는 요소를 빼지 않는다.
- "더 예쁘게", "더 자연스럽게" 같은 판단으로 값을 바꾸지 않는다.
- 값을 모르면 추측하지 말고 질문한다.

## Figma MCP 사용 규칙
- 모든 수치는 MCP로 읽은 값만 사용한다. 눈대중 금지.
- 구현 전 반드시 get_variable_defs로 색상/간격 변수를 먼저 확인한다.
- 레이어의 X/Y/W/H, 색상 HEX, 폰트 크기/자간/행간을 그대로 옮긴다.

## 레이아웃 방식
- 375x812 고정 디자인. 최상위 컨테이너는
  width:375px; height:812px; position:relative; margin:0 auto; overflow:hidden
- 내부 요소는 position:absolute + Figma의 left/top/width/height 값 그대로.
- flex/grid로 "비슷하게" 배치 금지. 화면 대응은 컨테이너 transform:scale()로만.

## 에셋
- 눈물, 빗방울, 검정 덩어리, 캐릭터 얼굴, 하트, 물결은 시안에 디자인이 있다.
- CSS의 border-radius/clip-path로 흉내내지 말 것.
- 이모지나 유니코드 문자(💧🌧️❤️)로 대체 절대 금지.
- assets 폴더의 SVG를 쓰거나, 없으면 어떤 파일이 필요한지 물어볼 것.

## 폰트
- index.html <head>에 Pretendard CDN (동적 서브셋. 통짜는 굵기당 766KB라 안 쓴다):
  <link rel="stylesheet" crossorigin
    href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard-dynamic-subset.min.css" />
- style.css 상단에 온글잎 긍정 (CDN 원본 3.15MB → 쓰는 글자만 뽑은 13.8KB 서브셋):
  @font-face {
    font-family: 'Ownglyph_positive';
    src: url('assets/Ownglyph_positive-subset.woff2') format('woff2');
    font-weight: normal; font-display: block;
  }
- 손글씨 문구(스플래시 제목·부제목, 시작 화면 문구)를 바꾸면
  서브셋에 없는 글자는 기본 고딕으로 나온다. 문구를 바꾸면 서브셋도 다시 만들 것.
- :root 변수:
  --font-hand: 'Ownglyph_positive', sans-serif;
  --font-ui: 'Pretendard', sans-serif;
- 기본값은 전체 --font-ui. 손글씨(--font-hand)는 스플래시 제목(48px)과 부제목(24px)만.
- 스플래시 하단 로딩 % 숫자도 Pretendard다.
- 감성적인 문구라는 이유로 임의로 손글씨체를 적용하지 말 것.
- 온글잎 긍정은 굵기 1종. font-weight는 normal 고정.

## 호흡 애니메이션
- 호흡 애니메이션은 버튼 scale뿐 아니라 캐릭터 입 크기, 검정 덩어리까지 함께 변한다. 세 요소가 동기화되어야 한다.

## 작업 방식
- 한 번에 한 화면만 작업한다. 여러 화면 동시 수정 금지.
- 작업 후 추측한 부분이 있으면 반드시 목록으로 보고한다.
