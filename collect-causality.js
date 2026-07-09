/* ============================================================
 * 후원-팔로우 인과 분석 자동 수집기 (collect-causality.js)
 *
 * 목적: "팔로우가 먼저냐 후원이 먼저냐"를 후원하기 런칭일(2025-12-09) 기준으로
 *       정확히 분리해 재분석한다.
 *   ① 후원 먼저 → 팔로우      (후원이 팬덤을 유발 · 핵심)
 *   ② 같은 날
 *   ③ 팔로우 먼저 (런칭 이후)
 *   ④ 팔로우 먼저 (런칭 이전 = 기존 팬 · 후원하기와 무관 → 제외 대상)
 *   ⑤ 팔로우 안 함
 *
 * 동작: 버튼 한 번 → 후원 전수 수집 → 팔로우 API 자동 감지 → 유저별 팔로우
 *       시점 자동 수집(수천 명 자동 루프) → 버킷 집계 → causality.json 다운로드.
 *
 * 사용: admin2.grip.show 로그인 상태에서 북마클릿 클릭.
 *  - 팔로우 API를 자동으로 못 찾으면, 유저 상세(팔로우 목록 보이는 화면) 한 번만
 *    열어주세요. 감지되면 나머지는 전부 자동입니다.
 * ============================================================ */
(async function () {
  'use strict';
  if (!location.host.includes('grip.show')) { alert('admin2.grip.show 에 로그인한 탭에서 실행해주세요.'); return; }
  if (window.__causalityRunning) { alert('이미 실행 중입니다. 우측 상단 진행창을 확인하세요.'); return; }
  window.__causalityRunning = true;

  const LAUNCH = new Date('2025-12-09T00:00:00+09:00').getTime();  // 후원하기 런칭
  const API = 'https://admin-api.grip.show';
  const ck = {}; document.cookie.split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) ck[c.slice(0, i).trim()] = c.slice(i + 1).trim(); });
  const token = decodeURIComponent(ck['grip.admin.sessiona'] || '');
  if (!token) { alert('로그인 토큰을 찾지 못했습니다. admin2.grip.show 에 다시 로그인 해주세요.'); window.__causalityRunning = false; return; }
  const H = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const dayKST = ms => { const d = new Date(ms + 9 * 3600 * 1000); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); };

  // ---- 진행 UI ----
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999999;background:#0c1a14;color:#e9f1ed;border:1px solid #2fb87f;border-radius:14px;padding:16px 20px;font:13px/1.6 -apple-system,Pretendard,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);min-width:300px;max-width:420px';
  document.body.appendChild(box);
  const setBox = html => { box.innerHTML = html; };
  const status = (msg, sub) => setBox('<b style="color:#3ddc97">🔗 인과 분석 수집</b><div style="margin-top:8px;color:#cfe0da">' + msg + '</div>' + (sub ? '<div style="margin-top:6px;color:#9fb4ab;font-size:12px">' + sub + '</div>' : ''));
  const fail = (msg) => { setBox('<b style="color:#ff6b6b">수집 실패</b><div style="margin-top:8px;color:#cfe0da">' + msg + '</div>'); window.__causalityRunning = false; };

  async function getJSON(url) {
    for (let r = 0; r < 5; r++) {
      try { const res = await fetch(url, H); if (!res.ok) throw new Error('s' + res.status); return await res.json(); }
      catch (e) { await sleep(600 * (r + 1)); }
    }
    return null;
  }

  // ---- 1) 후원 전수 수집 → (유저,그리퍼) 첫 후원 시점 ----
  status('후원 내역 수집 중… (전수)');
  const ISO_S = '2025-01-01T00:00:00.000Z', ISO_E = '2027-12-31T23:59:59.000Z';
  const sB = (s, l) => API + '/sponsorships/list?draw=1&start=' + s + '&length=' + l + '&search%5BsearchDateField%5D=sponsoredAt&search%5BsearchStartAt%5D=' + ISO_S + '&search%5BsearchEndAt%5D=' + ISO_E + '&search%5BsearchTarget%5D=userName&search%5BsearchQuery%5D=&search%5Bstates%5D%5B0%5D=SPONSORED';
  const first = await getJSON(sB(0, 2000));
  if (!first) return fail('후원 데이터 접근 실패 (권한/세션 확인).');
  const total = first.recordsTotal || (first.data || []).length;
  let recs = (first.data || []).slice();
  const starts = []; for (let s = 2000; s < total; s += 2000) starts.push(s);
  for (let i = 0; i < starts.length; i += 6) {
    const batch = starts.slice(i, i + 6);
    const res = await Promise.all(batch.map(s => getJSON(sB(s, 2000))));
    res.forEach(j => { if (j && j.data) for (const x of j.data) recs.push(x); });
    status('후원 내역 수집 중…', recs.length.toLocaleString() + ' / ' + total.toLocaleString());
  }
  // (유저 → 그리퍼 → 첫 후원시점)
  const pairFirst = {};        // u -> { g -> firstSponsoredMs }
  const userSeqs = new Set();
  for (const r of recs) {
    const u = r.user && r.user.userSeq, g = r.targetUser && r.targetUser.userSeq, t = new Date(r.sponsoredAt).getTime();
    if (!u || !g || !t) continue;
    userSeqs.add(u);
    (pairFirst[u] = pairFirst[u] || {});
    if (pairFirst[u][g] == null || t < pairFirst[u][g]) pairFirst[u][g] = t;
  }
  const users = [...userSeqs];
  status('후원 ' + recs.length.toLocaleString() + '건 · 유저 ' + users.length.toLocaleString() + '명 확보', '이제 팔로우 API를 찾습니다…');

  // ---- 2) 팔로우 API 자동 감지 ----
  // 응답에서 (그리퍼 식별자 + 팔로우 시점)을 가진 배열을 찾아 추출기를 만든다.
  function analyzeFollowResponse(j) {
    const arr = Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : (j && j.data && Array.isArray(j.data.list) ? j.data.list : null));
    if (!arr || !arr.length) return null;
    const it = arr[0];
    const flat = {}; (function walk(o, p) { for (const k in o) { const v = o[k], key = p ? p + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key); else flat[key] = v; } })(it, '');
    const keys = Object.keys(flat);
    const tsKey = keys.find(k => /follow.*at$|followedat|followingat/i.test(k)) || keys.find(k => /createdat$/i.test(k) && /follow/i.test(JSON.stringify(it)));
    const gKey = keys.find(k => /(target|followee|gripper|to|follow).*userseq$/i.test(k)) || keys.find(k => /userseq$/i.test(k));
    if (!tsKey || !gKey) return null;
    return { arrPath: Array.isArray(j) ? '' : (j.data && Array.isArray(j.data) ? 'data' : 'data.list'), gKey, tsKey };
  }
  function getArr(j, path) { if (!path) return j; return path.split('.').reduce((o, k) => (o ? o[k] : null), j); }
  function getFlat(it, key) { return key.split('.').reduce((o, k) => (o ? o[k] : null), it); }

  // 후보 엔드포인트(유저당 팔로잉 목록) 자동 시도
  const sample = users[0];
  const candidates = [
    s => API + '/user/' + s + '/following?draw=1&start=0&length=2000',
    s => API + '/user/' + s + '/followings?draw=1&start=0&length=2000',
    s => API + '/user/' + s + '/follow/list?draw=1&start=0&length=2000',
    s => API + '/user/' + s + '/follow?draw=1&start=0&length=2000',
    s => API + '/user/following/list?userSeq=' + s + '&draw=1&start=0&length=2000',
    s => API + '/following/list?userSeq=' + s + '&draw=1&start=0&length=2000',
    s => API + '/follow/list?userSeq=' + s + '&draw=1&start=0&length=2000',
    s => API + '/user/' + s + '/detail',
    s => API + '/user/' + s
  ];
  let followUrl = null, shape = null, discoverySample = null;
  status('팔로우 API 자동 탐색 중…', '후보 ' + candidates.length + '개 시도');
  for (const c of candidates) {
    const j = await getJSON(c(sample));
    if (!j) continue;
    const sh = analyzeFollowResponse(j);
    if (sh) { followUrl = c; shape = sh; discoverySample = j; break; }
  }

  // 후보 실패 시: 네트워크 후킹으로 감지 (유저 상세 페이지를 열면 자동 포착)
  if (!followUrl) {
    status('⚠️ 팔로우 API 자동탐색 실패 — <b style="color:#f5c451">유저 아무나 1명의 상세 페이지를 열어주세요</b>', '팔로우 목록이 보이는 화면이면 됩니다. 감지되면 자동 진행됩니다.');
    const captured = await new Promise(resolve => {
      let done = false; const finish = v => { if (!done) { done = true; resolve(v); } };
      const oF = window.fetch;
      window.fetch = function () {
        const a = arguments, u = (a[0] && a[0].url) || a[0]; const p = oF.apply(this, a);
        try { if (String(u).indexOf('admin-api.grip.show') >= 0) p.then(r => { try { r.clone().json().then(j => { const sh = analyzeFollowResponse(j); if (sh) finish({ url: String(u), shape: sh, sample: j }); }).catch(() => { }); } catch (e) { } }); } catch (e) { }
        return p;
      };
      const OX = window.XMLHttpRequest.prototype.open, OS = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; return OX.apply(this, arguments); };
      window.XMLHttpRequest.prototype.send = function () { const x = this; this.addEventListener('load', function () { try { if (String(x.__u).indexOf('admin-api.grip.show') >= 0) { const j = JSON.parse(x.responseText); const sh = analyzeFollowResponse(j); if (sh) finish({ url: String(x.__u), shape: sh, sample: j }); } } catch (e) { } }); return OS.apply(this, arguments); };
      setTimeout(() => finish(null), 180000); // 3분 대기
    });
    if (!captured) return fail('팔로우 API를 찾지 못했습니다. 팔로우 목록이 보이는 화면을 열고 다시 시도하거나, 그 화면의 Network 탭 요청 URL을 건무에게 알려주세요.');
    // 포착된 URL을 유저별 템플릿으로 변환 (sample 유저 seq 자리 치환)
    const capUrl = captured.url; shape = captured.shape; discoverySample = captured.sample;
    // URL에 등장하는 어떤 seq를 찾아 치환 지점으로 삼는다
    let capUserSeq = null;
    const qm = capUrl.match(/[?&]userSeq=(\d+)/); if (qm) capUserSeq = qm[1];
    if (!capUserSeq) { const pm = capUrl.match(/\/user\/(\d+)/); if (pm) capUserSeq = pm[1]; }
    if (!capUserSeq) { const anym = capUrl.match(/(\d{4,})/); if (anym) capUserSeq = anym[1]; }
    if (!capUserSeq) return fail('감지된 팔로우 API에서 유저 식별자를 못 찾았습니다. URL: ' + capUrl);
    followUrl = s => capUrl.split(capUserSeq).join(String(s));
    status('✅ 팔로우 API 감지됨 — 자동 수집 시작', capUrl.replace(/[?].*$/, ''));
    await sleep(800);
  }

  // ---- 3) 유저별 팔로우 시점 자동 수집 (동시성 루프) ----
  const followMap = {}; // u -> { g -> followMs }
  let done = 0;
  async function fetchUserFollows(u) {
    const j = await getJSON(followUrl(u));
    followMap[u] = {};
    if (j) {
      const arr = getArr(j, shape.arrPath) || [];
      for (const it of (Array.isArray(arr) ? arr : [])) {
        const g = getFlat(it, shape.gKey), ts = getFlat(it, shape.tsKey);
        if (g != null && ts != null) { const ms = new Date(ts).getTime(); if (ms) followMap[u][g] = ms; }
      }
    }
    done++;
    if (done % 25 === 0 || done === users.length) status('팔로우 시점 수집 중… (자동)', done.toLocaleString() + ' / ' + users.length.toLocaleString() + '명');
  }
  const CONC = 6;
  for (let i = 0; i < users.length; i += CONC) {
    await Promise.all(users.slice(i, i + CONC).map(fetchUserFollows));
  }

  // ---- 4) 버킷 집계 (초 단위 정확 시각 비교 · 런칭 기준 분리) ----
  const B = { sponsorFirst: 0, followPost: 0, followPre: 0, noFollow: 0, pairs: 0 };
  const dmap = {}; // 첫 후원일(KST) -> {followFirst, sponsorFirst} · 런칭 후 관계만 (추이 차트용)
  const bump = (d, k) => { (dmap[d] = dmap[d] || { followFirst: 0, sponsorFirst: 0 })[k]++; };
  for (const u of users) {
    const gm = pairFirst[u]; if (!gm) continue;
    for (const g in gm) {
      const S = gm[g], F = (followMap[u] || {})[g];
      B.pairs++;
      if (F == null) { B.noFollow++; continue; }
      if (F <= S) { if (F < LAUNCH) B.followPre++; else { B.followPost++; bump(dayKST(S), 'followFirst'); } }  // 팔로우가 후원보다 먼저(또는 동시) · 런칭 후
      else { B.sponsorFirst++; bump(dayKST(S), 'sponsorFirst'); }                                             // 후원이 팔로우보다 먼저
    }
  }
  const p = n => B.pairs ? +(n / B.pairs * 100).toFixed(2) : 0;
  // 후원하기와 관련된 모집단 = 기존 팬(followPre) 제외
  const rel = B.pairs - B.followPre;
  const relPct = n => rel ? +(n / rel * 100).toFixed(2) : 0;
  // 후원 시점에 미팔로우였던 유저의 후원→팔로우 전환율
  const notFollowedYet = B.sponsorFirst + B.noFollow;
  const convPct = notFollowedYet ? +(B.sponsorFirst / notFollowedYet * 100).toFixed(2) : 0;

  const out = {
    method: '후원 유저 전수의 (유저·그리퍼) 쌍에 대해 팔로우 시점 vs 첫 후원 시점을 초 단위 정확 시각으로 비교. 후원하기 런칭일(2025-12-09) 기준으로 선(先)팔로우를 런칭 이전(기존 팬)/이후로 분리. 같은 날도 정확 시각으로 순서 구분. 자동 수집.',
    collectedAt: new Date().toISOString(),
    launch: '2025-12-09',
    precision: 'exact',
    sampleUsers: users.length,
    pairs: B.pairs,
    sponsorFirst: B.sponsorFirst, sponsorFirstPct: p(B.sponsorFirst),
    followPost: B.followPost, followPostPct: p(B.followPost),
    followPre: B.followPre, followPrePct: p(B.followPre),
    noFollow: B.noFollow, noFollowPct: p(B.noFollow),
    relevantPairs: rel,
    followPostPctRel: relPct(B.followPost), sponsorFirstPctRel: relPct(B.sponsorFirst),
    noFollowPctRel: relPct(B.noFollow),
    notFollowedYet: notFollowedYet, sponsorToFollowConvPct: convPct,
    daily: Object.keys(dmap).sort().map(d => ({ date: d, followFirst: dmap[d].followFirst, sponsorFirst: dmap[d].sponsorFirst })),
    _debug: { followUrlSample: followUrl(sample), shape: shape }
  };

  // ---- 5) 다운로드 ----
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'causality.json';
  document.body.appendChild(a); a.click(); a.remove();
  setBox('<b style="color:#3ddc97">✓ 인과 분석 완료</b>'
    + '<div style="margin-top:8px;color:#cfe0da;font-size:12.5px">쌍 ' + B.pairs.toLocaleString() + '건 · 유저 ' + users.length.toLocaleString() + '명</div>'
    + '<div style="margin-top:8px;color:#9fb4ab;font-size:12px;line-height:1.7">'
    + '① 후원먼저→팔로우 <b style="color:#3ddc97">' + B.sponsorFirst.toLocaleString() + '</b> (' + p(B.sponsorFirst) + '%)<br>'
    + '② 팔로우먼저(런칭후) ' + B.followPost.toLocaleString() + '<br>'
    + '③ 팔로우먼저(런칭전=기존팬) <b style="color:#f5c451">' + B.followPre.toLocaleString() + '</b><br>'
    + '④ 팔로우안함 ' + B.noFollow.toLocaleString() + '<br>'
    + '<b style="color:#3ddc97">후원→팔로우 전환율 ' + convPct + '%</b> (미팔로우 유저 기준)'
    + '</div><div style="margin-top:8px;color:#3ddc97;font-size:12px">causality.json 다운로드됨 → 건무에게 전달</div>');
  window.__causalityRunning = false;
})();
