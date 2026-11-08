// Korean string table — the full second language (Requirement 9.1, steering).
//
// Keys match `en.ts` exactly through the shared `Strings` contract and the
// key-parity test. The family/side/trend phrases match what the WebVTT export
// emitted for Korean in task 6.

import type { Strings } from './strings.ts';

export const ko: Strings = {
  languageName: '한국어',

  family: {
    footsteps: '발소리',
    door: '문소리',
    knock: '노크 소리',
    scream: '비명',
    laughter: '웃음소리',
    crying: '울음소리',
    tenseMusic: '긴장된 음악',
    calmMusic: '잔잔한 음악',
    singing: '노랫소리',
    impact: '충격음',
    gunshot: '총성',
    vehicle: '차량 소리',
    siren: '사이렌',
    animal: '동물 소리',
    wind: '바람 소리',
    rain: '빗소리',
    thunder: '천둥',
    fire: '불 소리',
    glass: '유리 깨지는 소리',
    unknown: '알 수 없는 소리',
  },
  side: {
    left: '왼쪽에서',
    right: '오른쪽에서',
  },
  trend: {
    rising: '점점 커짐',
    falling: '점점 작아짐',
  },
  join: ', ',

  loudness: {
    quiet: '조용함',
    medium: '보통',
    loud: '큼',
  },
  ominous: {
    calm: '평온',
    uneasy: '불안',
    dread: '공포',
  },

  licence: {
    CC0: 'CC0 1.0',
    'CC-BY-3': 'CC BY 3.0',
    'CC-BY-4': 'CC BY 4.0',
    'public-domain': '퍼블릭 도메인',
  },

  ui: {
    appName: '소리의 유령',
    tagline: '자막이 빠뜨리는 소리를 보여 줍니다 — 소리를 끄면 유령이 나옵니다.',

    dropPrompt: '영상이나 오디오 파일을 여기에 놓으세요',
    dropHint: '모든 처리는 기기 안에서만 이루어지며, 아무것도 업로드되지 않습니다.',
    chooseFile: '파일 선택',
    orPickDemo: '또는 데모 클립을 고르세요',

    demoHeading: '데모 클립',
    demoBy: '제작:',
    demoLicencePrefix: '라이선스:',
    demoSource: '출처',
    demoLoadError: '이 데모 클립을 불러오지 못했습니다. 다른 클립을 선택해 주세요.',

    analysing: '유령을 찾는 중…',
    analysingHint: '유령이 정확한 순간에 나타나도록 오디오를 분석하고 있습니다.',

    monoNotice: '이 클립은 모노라서 방향을 알 수 없습니다. 모든 유령이 가운데에 나타납니다.',
    labelsUnavailable: '소리 이름을 사용할 수 없어, 소리를 알 수 없는 유령으로 표시합니다.',
    decodeErrorPrefix: '열 수 없는 파일',
    decodeErrorSuggest: 'MP4(H.264 + AAC)나 WebM 같은 일반적인 형식을 사용해 보세요.',

    timeline: '타임라인',
    eventList: '소리 목록',
    exportCaptions: '자막 내보내기',
    settings: '설정',
    aboutGhosts: '유령에 대하여',
    reducedMotion: '모션 줄이기',
    ghostSize: '유령 크기',
    sizeSmall: '작게',
    sizeNormal: '보통',
    sizeLarge: '크게',
    muteFamily: '이 소리 숨기기',
    language: '언어',
    hideSoundTypes: '소리 종류 숨기기',
    showSoundList: '소리 목록 보기',

    addSubtitles: '대사 자막 추가',
    replaceSubtitles: '대사 자막 교체',
    burnedInSubtitles: '영상에 자막이 입혀져 있음',

    showGhostsWhen: '유령 표시',
    showWhenAlways: '항상 (소리를 들을 수 없음)',
    showWhenAuto: '소리를 껐을 때만',
    showWhenNever: '표시 안 함',
    showWhenHelp:
      '소리가 재생돼도 들을 수 없다면 “항상”을 선택하세요. 기본값은 영상이 음소거일 때만 유령이 나타나고, 소리를 켜면 쉽니다.',
    chipAlways: '유령 항상 켜짐',
    chipSoundOff: '🔇 소리 꺼짐 — 유령 등장',
    chipSoundOn: '🔊 소리 켜짐 — 유령 쉬는 중',
    fullscreen: '전체 화면(유령 포함)',
    exitFullscreen: '전체 화면 나가기',
    play: '재생',
    pause: '일시정지',
    seek: '탐색',

    missedCount: '자막이 놓친 소리: {n}',
    missedPlusOne: '+1 {sound}',
    missedEndCard: '자막만 봤다면 이 영상에서 소리 {n}개를 놓쳤습니다.',
    missedBasisDialogueOnly: '대사 자막 기준으로 셌습니다.',
    missedBasisWithFile: '불러온 자막과 대조했습니다.',
    missedListHeading: '센 소리',
    watchAgain: '다시 보기',
    compare: '비교해 보기',
    compareCaptionsOnly: '자막만',
    compareWithGhosts: '소리의 유령과 함께',
    compareCaptionsOnlyPlate: '자막만 — 이 장면의 자막에는 이 소리가 없습니다.',
    compareStep: '{step}/{total}',
    compareClosing: '방금 본 「{label}」는 자막만으로는 알 수 없던 소리입니다.',
    tryThisFirst: '먼저 눌러 보세요',
    compareFirst: '먼저 비교',
    missedBasisDemoNoFile:
      '이 데모에는 자막 파일이 없어, 대사만 적힌 자막을 가정하고 셌습니다.',

    colTime: '시간',
    colSound: '소리',
    colDirection: '방향',
    colLoudness: '크기',
    colOminous: '분위기',
    speechMarker: '말소리',

    aboutMeasured:
      '방향, 크기, 긴장감, 리듬은 기기 안에서 오디오 신호로부터 측정됩니다.',
    aboutGuessed:
      '각 소리가 무엇인지는 기기 안의 분류기가 추정한 것이라 틀릴 수 있습니다. 확신이 없는 소리는 지어낸 이름 대신 알 수 없는 유령으로 표시됩니다.',
    aboutLimits:
      '혼합된 영화 사운드트랙은 방향을 숨기는 경우가 많고, 겹치는 소리는 하나의 유령으로 표시됩니다.',
    aboutNotReplacement:
      '소리의 유령은 전문 자막이나 화면 해설을 대체하지 않습니다.',
  },
};
