import express from 'express';
import * as manseryeok from 'manseryeok';

let fullstackManseryeok = {};
try {
  fullstackManseryeok = await import('@fullstackfamily/manseryeok');
} catch (error) {
  fullstackManseryeok = {};
}

const app = express();
const PORT = process.env.PORT || 3000;
const API_VERSION = 'RENDER_MANSERYEOK_API_V1_0_7_1';

app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'YM Manseryeok API',
    version: API_VERSION,
    endpoints: ['/health', '/api/v1/manseryeok/bazi']
  });
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: API_VERSION,
    node: process.version,
    primaryPackage: 'manseryeok',
    primaryFunctions: Object.keys(manseryeok || {}).sort(),
    fallbackPackage: '@fullstackfamily/manseryeok',
    fallbackFunctions: Object.keys(fullstackManseryeok || {}).sort()
  });
});

app.post('/api/v1/manseryeok/bazi', async (req, res) => {
  try {
    const payload = req.body || {};
    const normalizedInput = normalizePayload(payload);
    const result = calculateWithPrimaryManseryeok(normalizedInput, payload);

    res.json({
      ok: true,
      version: API_VERSION,
      data: result,
      options: normalizedInput.options
    });
  } catch (primaryError) {
    try {
      const payload = req.body || {};
      const normalizedInput = normalizePayload(payload);
      const result = calculateWithFallbackFullstack(normalizedInput, payload, primaryError);

      res.json({
        ok: true,
        version: API_VERSION,
        data: result,
        options: normalizedInput.options,
        warnings: ['primary manseryeok failed; fallback @fullstackfamily/manseryeok used', primaryError.message]
      });
    } catch (fallbackError) {
      res.status(500).json({
        ok: false,
        version: API_VERSION,
        error: fallbackError.message,
        primaryError: primaryError ? primaryError.message : '',
        stack: process.env.NODE_ENV === 'production' ? undefined : fallbackError.stack
      });
    }
  }
});

function normalizePayload(payload) {
  const birth = payload.birth || {};
  const solar = payload.solar || {};
  const location = payload.location || {};
  const options = payload.options || {};

  const originalDate = splitDate(payload.birthDate);
  const year = Number(birth.year || originalDate.year || solar.year || payload.year);
  const month = Number(birth.month || originalDate.month || solar.month || payload.month);
  const day = Number(birth.day || originalDate.day || solar.day || payload.day);
  const time = parseTime(payload.birthTime || `${birth.hour || 0}:${birth.minute || 0}`);

  assertValidNumber(year, 'year');
  assertValidNumber(month, 'month');
  assertValidNumber(day, 'day');

  return {
    year,
    month,
    day,
    hour: time.hour,
    minute: time.minute,
    isLunar: payload.isLunar === true || payload.calendarType === 'lunar',
    isLeapMonth: payload.isLeapMonth === true || payload.leapMonth === 'leap',
    gender: normalizeGender(payload.gender),
    location: {
      city: location.city || payload.birthCity || '',
      longitude: Number(location.longitude || location.lon || 127.5),
      latitude: Number(location.latitude || location.lat || 37.5665),
      timezone: location.timezone || 'Asia/Seoul'
    },
    options: {
      dayBoundary: ['midnight', 'jasi', 'splitJasi'].includes(options.dayBoundary) ? options.dayBoundary : 'midnight',
      applyTrueSolarTime: options.applyTrueSolarTime !== false,
      applyEquationOfTime: options.applyEquationOfTime !== false,
      applyHistoricalDst: options.applyHistoricalDst !== false
    }
  };
}

function calculateWithPrimaryManseryeok(input, originalPayload) {
  if (!manseryeok || typeof manseryeok.calculateFourPillars !== 'function') {
    throw new Error('manseryeok.calculateFourPillars is not available');
  }

  const params = {
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute,
    isLunar: input.isLunar,
    isLeapMonth: input.isLeapMonth,
    gender: input.gender,
    dayBoundary: input.options.dayBoundary
  };

  if (input.options.applyTrueSolarTime) {
    params.trueSolarTime = {
      longitude: input.location.longitude,
      applyEquationOfTime: input.options.applyEquationOfTime,
      applyHistoricalDst: input.options.applyHistoricalDst
    };
  }

  const rawResult = manseryeok.calculateFourPillars(params);
  const normalized = normalizePrimaryResult(rawResult, input, originalPayload);

  return {
    engine: API_VERSION,
    source: 'manseryeok.calculateFourPillars',
    library: 'manseryeok',
    input: safeInputEcho(input),
    ...normalized,
    raw: safeRaw(rawResult)
  };
}

function calculateWithFallbackFullstack(input, originalPayload, primaryError) {
  if (!fullstackManseryeok || typeof fullstackManseryeok.calculateSaju !== 'function') {
    throw new Error('fallback calculateSaju is not available; primary error=' + (primaryError ? primaryError.message : ''));
  }

  let solar = { year: input.year, month: input.month, day: input.day };
  if (input.isLunar) {
    if (typeof fullstackManseryeok.lunarToSolar !== 'function') {
      throw new Error('fallback lunarToSolar is not available for lunar input');
    }
    const converted = fullstackManseryeok.lunarToSolar(input.year, input.month, input.day, input.isLeapMonth);
    solar = converted.solar || converted;
  }

  const options = {
    longitude: input.location.longitude,
    applyTimeCorrection: input.options.applyTrueSolarTime
  };

  const rawResult = fullstackManseryeok.calculateSaju(
    Number(solar.year),
    Number(solar.month),
    Number(solar.day),
    input.hour,
    input.minute,
    options
  );

  const normalized = normalizeFallbackResult(rawResult, input, solar);

  return {
    engine: API_VERSION,
    source: '@fullstackfamily/manseryeok.calculateSaju',
    library: '@fullstackfamily/manseryeok',
    input: safeInputEcho(input),
    ...normalized,
    raw: safeRaw(rawResult)
  };
}

function normalizePrimaryResult(result, input, originalPayload) {
  const obj = typeof result.toObject === 'function' ? result.toObject() : result;
  const hanjaText = typeof result.toHanjaString === 'function' ? result.toHanjaString() : '';
  const parsedHanja = parseHanjaPillarsFromText(hanjaText);

  const yearPillar = normalizePillarHanja(parsedHanja.year || obj.year || result.yearPillar || result.year || '');
  const monthPillar = normalizePillarHanja(parsedHanja.month || obj.month || result.monthPillar || result.month || '');
  const dayPillar = normalizePillarHanja(parsedHanja.day || obj.day || result.dayPillar || result.day || '');
  const hourPillar = normalizePillarHanja(parsedHanja.hour || obj.hour || result.hourPillar || result.hour || '');

  ensurePillars({ yearPillar, monthPillar, dayPillar, hourPillar });

  const pillars = { year: yearPillar, month: monthPillar, day: dayPillar, hour: hourPillar };

  return {
    pillars,
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    dayMaster: dayPillar.charAt(0),
    tenGods: result.tenGods || obj.tenGods || null,
    voidBranches: result.voidBranches || obj.voidBranches || null,
    luckPillars: result.luckPillars || obj.luckPillars || null,
    dayElement: result.dayElement || obj.dayElement || null,
    dayYinYang: result.dayYinYang || obj.dayYinYang || null,
    fiveElements: countFiveElements(pillars),
    solarDate: extractSolarDate(result, obj, originalPayload),
    lunarDate: extractLunarDate(result, obj, originalPayload),
    dayBoundary: input.options.dayBoundary,
    timeCheck: {
      trueSolarTime: extractTrueSolarTime(result, obj),
      changed: !!(result.isTimeCorrected || obj.isTimeCorrected),
      options: input.options
    },
    calendarCrossCheck: {
      appsScriptSolarDate: originalPayload.solarDate || '',
      apiSolarDate: extractSolarDate(result, obj, originalPayload),
      apiLunarDate: extractLunarDate(result, obj, originalPayload)
    }
  };
}

function normalizeFallbackResult(result, input, solar) {
  const yearPillar = normalizePillarHanja(result.yearPillarHanja || result.yearPillar || '');
  const monthPillar = normalizePillarHanja(result.monthPillarHanja || result.monthPillar || '');
  const dayPillar = normalizePillarHanja(result.dayPillarHanja || result.dayPillar || '');
  const hourPillar = normalizePillarHanja(result.hourPillarHanja || result.hourPillar || '');

  ensurePillars({ yearPillar, monthPillar, dayPillar, hourPillar });
  const pillars = { year: yearPillar, month: monthPillar, day: dayPillar, hour: hourPillar };

  return {
    pillars,
    yearPillar,
    monthPillar,
    dayPillar,
    hourPillar,
    dayMaster: dayPillar.charAt(0),
    tenGods: null,
    voidBranches: null,
    luckPillars: null,
    fiveElements: countFiveElements(pillars),
    solarDate: `${solar.year}-${pad2(solar.month)}-${pad2(solar.day)}`,
    lunarDate: '',
    dayBoundary: input.options.dayBoundary,
    timeCheck: {
      trueSolarTime: result.correctedTime ? `${pad2(result.correctedTime.hour)}:${pad2(result.correctedTime.minute)}` : '',
      changed: !!result.isTimeCorrected,
      options: input.options
    },
    calendarCrossCheck: {
      apiSolarDate: `${solar.year}-${pad2(solar.month)}-${pad2(solar.day)}`,
      apiLunarDate: ''
    }
  };
}

function parseHanjaPillarsFromText(text) {
  const matches = String(text || '').match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/g) || [];
  return {
    year: matches[0] || '',
    month: matches[1] || '',
    day: matches[2] || '',
    hour: matches[3] || ''
  };
}

function normalizePillarHanja(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return normalizePillarHanja(value.hanja || value.han || value.pillarHanja || value.combinedHanja || value.pillar || value.combined || value.value || value.display || value.name || '');
  }

  let text = String(value || '').trim();
  const hanja = text.match(/[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/);
  if (hanja) return hanja[0];

  text = text.replace(/년주|월주|일주|시주|年柱|月柱|日柱|時柱|년|월|일|시|\s/g, '');
  const ko = text.match(/[갑을병정무기경신임계][자축인묘진사오미신유술해]/);
  if (ko) return koreanPillarToHanja(ko[0]);

  return text.slice(0, 2);
}

function koreanPillarToHanja(text) {
  const stemMap = { 갑: '甲', 을: '乙', 병: '丙', 정: '丁', 무: '戊', 기: '己', 경: '庚', 신: '辛', 임: '壬', 계: '癸' };
  const branchMap = { 자: '子', 축: '丑', 인: '寅', 묘: '卯', 진: '辰', 사: '巳', 오: '午', 미: '未', 신: '申', 유: '酉', 술: '戌', 해: '亥' };
  const chars = String(text || '').split('');
  return (stemMap[chars[0]] || '') + (branchMap[chars[1]] || '');
}

function ensurePillars(p) {
  const values = [p.yearPillar, p.monthPillar, p.dayPillar, p.hourPillar];
  if (!values.every(v => /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(v))) {
    throw new Error('invalid normalized pillars: ' + JSON.stringify(p));
  }
}

function countFiveElements(pillars) {
  const stemElement = { 甲: '목', 乙: '목', 丙: '화', 丁: '화', 戊: '토', 己: '토', 庚: '금', 辛: '금', 壬: '수', 癸: '수' };
  const branchElement = { 子: '수', 丑: '토', 寅: '목', 卯: '목', 辰: '토', 巳: '화', 午: '화', 未: '토', 申: '금', 酉: '금', 戌: '토', 亥: '수' };
  const out = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  Object.values(pillars || {}).forEach(p => {
    const stem = String(p || '').charAt(0);
    const branch = String(p || '').charAt(1);
    if (stemElement[stem]) out[stemElement[stem]] += 1;
    if (branchElement[branch]) out[branchElement[branch]] += 1;
  });
  return out;
}

function extractSolarDate(result, obj, payload) {
  const solar = result.solar || obj.solar || result.solarDate || obj.solarDate || payload.solar || null;
  if (typeof solar === 'string') return solar;
  if (solar && solar.year) return `${solar.year}-${pad2(solar.month)}-${pad2(solar.day)}`;
  return payload.solarDate || '';
}

function extractLunarDate(result, obj) {
  const lunar = result.lunar || obj.lunar || result.lunarDate || obj.lunarDate || null;
  if (typeof lunar === 'string') return lunar;
  if (lunar && lunar.year) return `${lunar.year}-${pad2(lunar.month)}-${pad2(lunar.day)}${lunar.isLeapMonth ? ' 윤달' : ''}`;
  return '';
}

function extractTrueSolarTime(result, obj) {
  const candidates = [
    result.trueSolarTime,
    obj.trueSolarTime,
    result.correctedTime,
    obj.correctedTime,
    result.timeCorrection,
    obj.timeCorrection
  ].filter(Boolean);

  for (const v of candidates) {
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && Number.isFinite(Number(v.hour))) return `${pad2(v.hour)}:${pad2(v.minute || 0)}`;
  }
  return '';
}

function normalizeGender(gender) {
  const text = String(gender || '').toLowerCase();
  if (text.includes('남') || text.includes('male') || text === 'm') return 'male';
  if (text.includes('여') || text.includes('female') || text === 'f') return 'female';
  return undefined;
}

function splitDate(dateText) {
  const m = String(dateText || '').match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})$/);
  if (!m) return {};
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function parseTime(timeText) {
  const m = String(timeText || '00:00').match(/^(\d{1,2}):(\d{1,2})$/);
  return { hour: m ? Number(m[1]) : 0, minute: m ? Number(m[2]) : 0 };
}

function assertValidNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error('invalid ' + label);
}

function pad2(value) {
  return String(Number(value || 0)).padStart(2, '0');
}

function safeInputEcho(input) {
  return {
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hour,
    minute: input.minute,
    isLunar: input.isLunar,
    isLeapMonth: input.isLeapMonth,
    gender: input.gender,
    location: input.location,
    options: input.options
  };
}

function safeRaw(raw) {
  try {
    return JSON.parse(JSON.stringify(raw));
  } catch (error) {
    return String(raw || '');
  }
}

app.listen(PORT, () => {
  console.log(`YM Manseryeok API listening on port ${PORT}`);
});
