'use strict';
/**
 * 투석효율도.html 의 <script id="hd-core"> 를 그대로 추출해 실행하고 계산 로직을 검증한다.
 *   node --test test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HTML_PATH = path.join(__dirname, '..', '투석효율도.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const m = html.match(/<script id="hd-core">([\s\S]*?)<\/script>/);
assert.ok(m, 'hd-core 스크립트 블록을 찾을 수 없음');
const sandbox = {};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(m[1], sandbox, { filename: 'hd-core.js' });
const C = sandbox.HDCore;

/** 테스트 쪽 독립 구현 (코어 함수 재사용 금지) */
function refKtv(pre, post, tH, uf, w) {
  const R = post / pre;
  return -Math.log(R - 0.008 * tH) + (4 - 3.5 * R) * (uf / w);
}
const base = { preBun: '70', postBun: '21', preWt: '62.5', postWt: '60', hours: '4', minutes: '0' };
const run = (over) => C.compute(Object.assign({}, base, over));

test('코어가 노출되고 기준값이 KDOQI 수치와 일치', () => {
  assert.equal(typeof C.compute, 'function');
  assert.equal(C.CRITERIA.urrMin, 65);
  assert.equal(C.CRITERIA.urrTarget, 70);
  assert.equal(C.CRITERIA.ktvMin, 1.2);
  assert.equal(C.CRITERIA.ktvTarget, 1.4);
});

test('parseNumber: 빈칸/쉼표 소수/전각/잘못된 입력', () => {
  assert.equal(C.parseNumber(''), null);
  assert.equal(C.parseNumber('   '), null);
  assert.equal(C.parseNumber(undefined), null);
  assert.equal(C.parseNumber(' 70 '), 70);
  assert.equal(C.parseNumber('62.5'), 62.5);
  assert.equal(C.parseNumber('62,5'), 62.5);
  assert.equal(C.parseNumber('62,55'), 62.55);
  assert.equal(C.parseNumber('６２．５'), 62.5);
  assert.equal(C.parseNumber('.5'), 0.5);
  assert.equal(C.parseNumber('5.'), 5);
  assert.equal(C.parseNumber('+4'), 4);
  assert.ok(Number.isNaN(C.parseNumber('1,234')), '천 단위 쉼표는 거부');
  assert.ok(Number.isNaN(C.parseNumber('-5')));
  assert.ok(Number.isNaN(C.parseNumber('1e3')));
  assert.ok(Number.isNaN(C.parseNumber('7O')));
  assert.ok(Number.isNaN(C.parseNumber('1.2.3')));
  assert.ok(Number.isNaN(C.parseNumber('abc')));
});

test('roundTo: 사사오입과 부동소수 오차', () => {
  assert.equal(C.roundTo(1.005, 2), 1.01);
  assert.equal(C.roundTo(2.675, 2), 2.68);
  assert.equal(C.roundTo(1.195, 2), 1.2);
  assert.equal(C.roundTo(1.1949, 2), 1.19);
  assert.equal(C.roundTo(64.95, 1), 65);
  assert.equal(C.roundTo(64.9499, 1), 64.9);
  assert.equal(C.roundTo(-1.005, 2), -1.01);
  assert.equal(C.roundTo(0, 2), 0);
  assert.equal(C.formatNumber(1.4396854, 2), '1.44');
  assert.equal(C.formatNumber(70, 1), '70.0');
  assert.equal(C.formatNumber(NaN, 1), '—');
  assert.equal(C.formatDuration(240), '4:00');
  assert.equal(C.formatDuration(215), '3:35');
  assert.equal(C.formatDuration(null), '—');
});

test('URR 공식: (1 − 후/전) × 100', () => {
  assert.ok(Math.abs(C.urr(70, 21) - 70) < 1e-9);
  assert.ok(Math.abs(C.urr(80, 28) - 65) < 1e-9);
  assert.ok(Math.abs(C.urr(60, 27) - 55) < 1e-9);
});

test('Daugirdas 2세대: 손계산 예시와 일치', () => {
  // R=0.3, t=4 → −ln(0.268)=1.3167687, (4−1.05)×2.5/60=0.1229167 → 1.4396854
  assert.ok(Math.abs(C.ktvDaugirdas(0.3, 4, 2.5, 60) - 1.4396854) < 1e-6);
  // R=0.45, t=3.5, UF=2, W=70 → 0.862750 + 0.069286 = 0.932036
  assert.ok(Math.abs(C.ktvDaugirdas(0.45, 3.5, 2, 70) - 0.932036) < 1e-5);
  assert.ok(Number.isNaN(C.ktvDaugirdas(0.05, 8, 0, 60)), 'ln 인자가 0 이하면 NaN');
  assert.ok(Number.isNaN(C.ktvDaugirdas(0.3, 4, 2, 0)), '체중 0이면 NaN');
});

test('무작위 입력 500건: compute() 결과가 독립 구현과 일치', () => {
  let s = 20260930;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 500; i++) {
    const pre = 40 + rnd() * 120;
    const post = pre * (0.2 + rnd() * 0.5);
    const postWt = 40 + rnd() * 50;
    const uf = rnd() * 4;
    const hours = 3 + Math.floor(rnd() * 3);
    const minutes = Math.floor(rnd() * 60);
    const r = C.compute({
      preBun: pre.toFixed(1), postBun: post.toFixed(1),
      preWt: (postWt + uf).toFixed(1), postWt: postWt.toFixed(1),
      hours: String(hours), minutes: String(minutes),
    });
    const P = +pre.toFixed(1), Q = +post.toFixed(1), W = +postWt.toFixed(1), UF = +(postWt + uf).toFixed(1) - W;
    const tH = (hours * 60 + minutes) / 60;
    assert.ok(r.hasUrr && r.hasKtv, 'case ' + i);
    assert.ok(Math.abs(r.urr - (1 - Q / P) * 100) < 1e-9, 'urr ' + i);
    assert.ok(Math.abs(r.ktv - refKtv(P, Q, tH, UF, W)) < 1e-9, 'ktv ' + i);
    const up = C.roundTo(r.urr, 1) >= 65, kp = C.roundTo(r.ktv, 2) >= 1.2;
    const exp = up && kp ? 'ok' : up || kp ? 'warn' : 'bad';
    assert.equal(r.state, exp, 'state ' + i);
  }
});

test('판정 색상 규칙: 둘 다 충족=ok, 하나 미달=warn, 둘 다 미달=bad', () => {
  assert.equal(C.classify(true, true), 'ok');
  assert.equal(C.classify(true, false), 'warn');
  assert.equal(C.classify(false, true), 'warn');
  assert.equal(C.classify(false, false), 'bad');

  const ok = run({});
  assert.equal(ok.urrR, 70);
  assert.equal(ok.ktvR, 1.44);
  assert.equal(ok.state, 'ok');
  assert.equal(ok.failCount, 0);

  // URR 63.3 미달 · Kt/V 1.26 충족 → 노랑
  const w1 = run({ preBun: '60', postBun: '22', preWt: '61.5', postWt: '58' });
  assert.equal(w1.urrR, 63.3);
  assert.equal(w1.ktvR, 1.26);
  assert.equal(w1.urrPass, false);
  assert.equal(w1.ktvPass, true);
  assert.equal(w1.state, 'warn');
  assert.equal(w1.failCount, 1);

  // URR 65.0(경계, 충족) · Kt/V 1.12 미달 → 노랑
  const w2 = run({ preBun: '80', postBun: '28', preWt: '60', postWt: '60', hours: '3' });
  assert.equal(w2.urrR, 65);
  assert.equal(w2.urrPass, true);
  assert.equal(w2.ktvR, 1.12);
  assert.equal(w2.ktvPass, false);
  assert.equal(w2.state, 'warn');

  // URR 55.0 · Kt/V 0.93 → 빨강
  const b = run({ preBun: '60', postBun: '27', preWt: '72', postWt: '70', hours: '3', minutes: '30' });
  assert.equal(b.urrR, 55);
  assert.equal(b.ktvR, 0.93);
  assert.equal(b.state, 'bad');
  assert.equal(b.failCount, 2);
});

test('경계값은 표시값(반올림) 기준으로 판정', () => {
  const a = run({ preBun: '100', postBun: '35.04' }); // 64.96 → 65.0
  assert.equal(a.urrR, 65);
  assert.equal(a.urrPass, true);
  const b = run({ preBun: '100', postBun: '35.06' }); // 64.94 → 64.9
  assert.equal(b.urrR, 64.9);
  assert.equal(b.urrPass, false);
});

test('부분 입력: BUN만 있으면 URR만 계산(partial)', () => {
  const r = C.compute({ preBun: '70', postBun: '21', hours: '4', minutes: '0' });
  assert.equal(r.hasUrr, true);
  assert.equal(r.hasKtv, false);
  assert.equal(r.state, 'partial');
  assert.deepEqual(Array.from(r.missing).sort(), ['postWt', 'preWt']);
  const empty = C.compute({});
  assert.equal(empty.state, 'idle');
  assert.equal(empty.hasUrr, false);
});

test('입력 검증 메시지', () => {
  assert.equal(run({ postBun: '70' }).errors.postBun, C.MSG.bunOrder);
  assert.equal(run({ postBun: '80' }).errors.postBun, C.MSG.bunOrder);
  assert.equal(run({ preBun: 'abc' }).errors.preBun, C.MSG.num);
  assert.equal(run({ preBun: '0' }).errors.preBun, C.MSG.bun);
  assert.equal(run({ preBun: '401' }).errors.preBun, C.MSG.bun);
  assert.equal(run({ preWt: '2' }).errors.preWt, C.MSG.wt);
  assert.equal(run({ postWt: '301' }).errors.postWt, C.MSG.wt);
  assert.equal(run({ hours: '13' }).errors.hours, C.MSG.hours);
  assert.equal(run({ minutes: '60' }).errors.minutes, C.MSG.minutes);
  assert.equal(run({ hours: '0', minutes: '0' }).errors.time, C.MSG.timeZero);
  assert.equal(run({ hours: '12', minutes: '30' }).errors.time, C.MSG.timeMax);
  const bad = run({ postBun: '90' });
  assert.equal(bad.hasUrr, false);
  assert.equal(bad.state, 'idle');
});

test('투석 시간 조합', () => {
  assert.equal(run({ hours: '4', minutes: '' }).tMin, 240);
  assert.equal(run({ hours: '', minutes: '215' }).errors.minutes, C.MSG.minutes);
  assert.equal(run({ hours: '3', minutes: '35' }).tMin, 215);
  assert.equal(run({ hours: '3.5', minutes: '0' }).tMin, 210);
  assert.equal(run({ hours: '0', minutes: '45' }).tMin, 45);
  const r = run({ hours: '', minutes: '' });
  assert.ok(r.missing.includes('time'));
  assert.equal(r.hasKtv, false);
});

test('ln 인자 ≤ 0 이면 spKt/V 계산 불가로 처리', () => {
  const r = run({ preBun: '100', postBun: '5', hours: '8', minutes: '0' });
  assert.equal(r.hasUrr, true);
  assert.equal(r.hasKtv, false);
  assert.equal(r.errors.ktv, C.MSG.ktv);
  assert.equal(r.state, 'partial');
});

test('체중 이상 알림(음수 제수량 / 10% 초과)', () => {
  const neg = run({ preWt: '59', postWt: '60' });
  assert.ok(neg.notes.includes(C.MSG.ufNegative));
  assert.equal(neg.hasKtv, true, '음수 UF도 공식대로 계산은 수행');
  assert.ok(Math.abs(neg.ktv - refKtv(70, 21, 4, -1, 60)) < 1e-9);
  const big = run({ preWt: '67', postWt: '60' });
  assert.ok(big.notes.includes(C.MSG.ufLarge));
  assert.equal(run({}).notes.length, 0);
});

test('기록 생성·검증', () => {
  const raw = Object.assign({ name: '  홍길동 ', regNo: 'A-001', date: '2026-09-30' }, base);
  const r = C.compute(raw);
  const rec = C.makeRecord(raw, r, { now: 1790000000000, id: 'x1' });
  assert.equal(rec.name, '홍길동');
  assert.equal(rec.urr, 70);
  assert.equal(rec.ktv, 1.44);
  assert.equal(rec.uf, 2.5);
  assert.equal(rec.tMin, 240);
  assert.equal(rec.state, 'ok');
  assert.equal(C.isRecord(rec), true);
  assert.equal(C.makeRecord({}, C.compute({ preBun: '70', postBun: '21' })), null);
  assert.equal(C.isRecord({ id: 'a', state: 'ok' }), false);
  assert.equal(C.isRecord(Object.assign({}, rec, { state: 'weird' })), false);
  assert.equal(C.isRecord(Object.assign({}, rec, { urr: 'x' })), false);
  assert.equal(C.isRecord(Object.assign({}, rec, { date: 20260930 })), false, '날짜가 문자열이 아니면 거부');
  assert.equal(C.isRecord(Object.assign({}, rec, { name: { x: 1 } })), false);
  assert.equal(C.isRecord(Object.assign({}, rec, { urrPass: 'yes' })), false);
  assert.equal(C.isRecord(null), false);
});

test('CSV: 머리글·수식 주입 방지·따옴표 처리', () => {
  const raw = Object.assign({ name: '=HYPERLINK("x")', regNo: '12,34', date: '2026-09-30' }, base);
  const rec = C.makeRecord(raw, C.compute(raw), { now: 1, id: 'a' });
  const csv = C.toCSV([rec]);
  const lines = csv.split('\r\n');
  assert.equal(lines.length, 3, '머리글 + 1행 + 끝 개행');
  assert.equal(lines[2], '');
  assert.ok(lines[0].startsWith('검사일,환자명,등록번호'));
  assert.ok(lines[1].includes('"\'=HYPERLINK(""x"")"'), '수식은 작은따옴표로 무력화하고 따옴표는 이스케이프');
  assert.ok(lines[1].includes('"12,34"'), '쉼표 포함 셀은 따옴표로 감쌈');
  assert.ok(lines[1].includes(',70.0,1.44,충족,충족,적정'));
  assert.ok(C.toCSV([]).split('\r\n').length === 2);
});

test('HTML에 필수 표기(기준치·공식·출처·제작자) 포함', () => {
  const text = html.replace(/<[^>]+>/g, ' ');
  assert.ok(text.includes('주양현'), '제작자');
  assert.ok(/≥ 65\.0 %/.test(text) && /≥ 1\.20/.test(text), '결과 옆 기준치');
  assert.ok(text.includes('0.008') && text.includes('3.5'), 'Daugirdas 공식');
  assert.ok(text.includes('1993;4(5):1205–1213'), 'Daugirdas 출처');
  assert.ok(text.includes('2015;66(5):884–930'), 'KDOQI 2015 출처');
  assert.ok(text.includes('2006;48(Suppl 1):S2–S90'), 'KDOQI 2006 출처');
  assert.ok(!/https?:\/\/(fonts|cdn)/i.test(html), '외부 CDN 의존 없음(오프라인 동작)');
});
