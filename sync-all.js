/* ============================================================
 * 통합 데이터 동기화 — sync-all.js  (북마클릿/콘솔 공용)
 *
 * 현재 열려 있는 사이트를 자동 감지해 데이터를 수집하고,
 * 대시보드 서버(/api/sync)로 전송 → GitHub 자동 커밋 → 자동 재배포.
 *
 * 사람이 할 일: 사이트 로그인 → 이 스크립트(북마클릿) 실행. 끝.
 *
 * 지원: admin2.grip.show(젬) / partners.adpopcorn.com(SDK) /
 *       console.adpopcorn.com/report/app(SSP) /
 *       console.adpopcorn.com/report/partner(쿠팡)
 * ============================================================ */
(async function () {
  'use strict';
  var SYNC_URL = 'https://sponsorship-dashboard-tau.vercel.app/api/sync';
  var SYNC_KEY = 'REPLACE_WITH_SYNC_SECRET'; // ← 배포 시 실제 값으로 치환됨

  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#0c1a14;color:#e9f1ed;border:1px solid #2fb87f;border-radius:14px;padding:16px 20px;font:13px/1.6 -apple-system,Pretendard,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);min-width:260px;max-width:340px';
  document.body.appendChild(box);
  var log = function (m) { box.innerHTML = '<b style="color:#3ddc97">🔄 데이터 동기화</b><div style="margin-top:8px;color:#9fb4ab">' + m + '</div>'; };
  var done = function (t, n, extra) { box.innerHTML = '<b style="color:#3ddc97">✓ ' + t + ' 동기화 완료</b><div style="margin-top:8px;color:#9fb4ab">' + n + '건 반영 · 1~2분 후 대시보드 자동 갱신' + (extra || '') + '</div>'; };
  var err = function (m) { box.innerHTML = '<b style="color:#ff6b6b">동기화 실패</b><div style="margin-top:8px;color:#9fb4ab">' + m + '</div>'; };

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var dStr = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var ymd = function (d) { return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); };
  function ranges(startStr, fmt) { var out = [], s = new Date(startStr + 'T00:00:00'), E = new Date(); while (s <= E) { var e = new Date(s); e.setDate(e.getDate() + 61); if (e > E) e.setTime(E.getTime()); out.push([fmt(s), fmt(e)]); s = new Date(e); s.setDate(s.getDate() + 1); } return out; }

  var host = location.host, path = location.pathname;
  try {
    if (host.indexOf('admin2.grip.show') >= 0) {
      // admin2 한 번 실행으로 젬(적립·후원·결제) + 정산(환전 10% 순수익) 모두 수집·전송
      var gd = await collectGems(); if (!gd) return;
      if (!(await send('gems', gd))) return;
      log('정산(환전 10% 순수익) 수집 중…');
      var sd = await collectSettle();
      if (sd) await send('settle', sd);
      done('젬 + 정산', (gd.spons ? gd.spons.kpi.total.toLocaleString() + '건 후원' : '') + (sd ? ' · ' + sd.kpi.count + '건 정산' : ''));
      return;
    }
    var type = null, data = null;
    if (host.indexOf('partners.adpopcorn.com') >= 0) { type = 'sdk'; data = await collectSDK(); }
    else if (host.indexOf('console.adpopcorn.com') >= 0) {
      if (path.indexOf('/report/partner') >= 0) { type = 'coupang'; data = await collectCoupang(); }
      else { type = 'ssp'; data = await collectSSP(); }
    } else { err('지원하지 않는 사이트입니다.<br>admin2.grip.show / partners.adpopcorn.com / console.adpopcorn.com 에서 실행하세요.'); return; }

    if (!data) return; // collect 단계에서 이미 에러 표시
    var j = await send(type, data);
    if (j) done(typeLabel(type), j.days || (data.daily ? data.daily.length : ''));
  } catch (e) { err(e.message); }

  function typeLabel(t) { return { gems: '젬', sdk: '광고 SDK', ssp: '광고 SSP', coupang: '쿠팡', settle: '정산' }[t] || t; }
  async function send(type, data) {
    if (!data) return null;
    log(typeLabel(type) + ' 서버로 전송 중…');
    try {
      var r = await fetch(SYNC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sync-Key': SYNC_KEY }, body: JSON.stringify({ type: type, data: data }) });
      var j = await r.json();
      if (!j.ok) { err('서버: ' + (j.error || r.status)); return null; }
      return j;
    } catch (e) { err(e.message); return null; }
  }

  /* ---------- 젬 전체 snapshot (admin2.grip.show) : 적립·후원·결제 ---------- */
  async function collectGems() {
    var ck = {}; document.cookie.split(';').forEach(function (c) { var i = c.indexOf('='); if (i > 0) ck[c.slice(0, i).trim()] = c.slice(i + 1).trim(); });
    var tok = decodeURIComponent(ck['grip.admin.sessiona'] || ''); if (!tok) { err('admin2.grip.show 로그인이 필요합니다.'); return null; }
    var H = { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' } };
    async function fc(url) { for (var r = 0; r < 6; r++) { try { var res = await fetch(url, H); if (!res.ok) throw 0; return await res.json(); } catch (e) { await sleep(800 * (r + 1)); } } return null; }
    async function coll(label, build, len, conc) { var first = await fc(build(0, len)); if (!first) return null; var total = first.recordsTotal, arr = (first.data || []).slice(); var starts = []; for (var s = len; s < total; s += len) starts.push(s); for (var i = 0; i < starts.length; i += conc) { var bt = starts.slice(i, i + conc); var rs = await Promise.all(bt.map(function (st) { return fc(build(st, len)); })); rs.forEach(function (j) { if (j && j.data) j.data.forEach(function (x) { arr.push(x); }); }); log(label + ' ' + arr.length.toLocaleString() + ' / ' + total.toLocaleString()); } return arr; }
    var fD = '2025-01-01', tD = '2026-12-31', sS = '2025-01-01T00:00:00.000Z', sE = '2026-12-31T23:59:59.000Z';
    var G = await coll('적립·사용', function (s, l) { return 'https://admin-api.grip.show/gems?draw=1&start=' + s + '&length=' + l + '&search%5BfromDate%5D=' + fD + '&search%5BtoDate%5D=' + tD + '&search%5BdateTarget%5D=ISSUED_AT&search%5BqueryTarget%5D=GEM_HISTORY_SEQ&search%5Bquery%5D='; }, 5000, 6); if (!G) { err('젬 수집 실패'); return null; }
    var S = await coll('후원', function (s, l) { return 'https://admin-api.grip.show/sponsorships/list?draw=1&start=' + s + '&length=' + l + '&search%5BsearchDateField%5D=sponsoredAt&search%5BsearchStartAt%5D=' + sS + '&search%5BsearchEndAt%5D=' + sE + '&search%5BsearchTarget%5D=userName&search%5BsearchQuery%5D=&search%5Bstates%5D%5B0%5D=ALL_CANCELED&search%5Bstates%5D%5B1%5D=PARTIAL_CANCELED&search%5Bstates%5D%5B2%5D=SPONSORED'; }, 1500, 8) || [];
    var P = await coll('결제', function (s, l) { return 'https://admin-api.grip.show/gem-purchases/list?draw=1&start=' + s + '&length=' + l + '&search%5BsearchDateField%5D=orderedAt&search%5BsearchTarget%5D=transactionId&search%5BsearchStartAt%5D=' + sS + '&search%5BsearchEndAt%5D=' + sE + '&search%5BsearchQuery%5D='; }, 3000, 4) || [];
    log('집계 중…'); return aggSnapshot(G, S, P);
  }
  function aggSnapshot(G, S, P) {
    var topN = function (o, n, key) { return Object.entries(o).map(function (e) { return Object.assign({ userSeq: +e[0] }, e[1]); }).sort(function (a, b) { return b[key] - a[key]; }).slice(0, n); };
    var tm = { ACCRUAL: '적립', USE: '사용', EXPIRED: '만료', CANCEL_ACCRUAL: '적립취소', CANCEL_USE: '사용취소', RETURN: '회수' };
    var byType = {}, byReason = {}, byRef = {}, gD = {}, hourly = [], weekday = [], uAcc = {}, uUse = {}, aAmt = 0, uAmt = 0, eAmt = 0, ca = 0, cu = 0, ret = 0;
    for (var h = 0; h < 24; h++) hourly.push({ count: 0, amount: 0 }); for (var w = 0; w < 7; w++) weekday.push({ count: 0 });
    for (var i = 0; i < G.length; i++) { var r = G[i], t = r.gemHistoryType, amt = r.amount || 0, dt = new Date(r.issuedAt), d = dStr(dt); (byType[t] = byType[t] || { count: 0, amount: 0 }).count++; byType[t].amount += amt; byReason[r.reason] = (byReason[r.reason] || 0) + 1; if (!byRef[r.referrerType]) byRef[r.referrerType] = { count: 0, accrual: 0 }; byRef[r.referrerType].count++; if (t === 'ACCRUAL') byRef[r.referrerType].accrual += amt; var dd = gD[d] = gD[d] || { ACCRUAL: 0, USE: 0, EXPIRED: 0, CANCEL_ACCRUAL: 0, CANCEL_USE: 0, RETURN: 0, count: 0 }; dd[t] = (dd[t] || 0) + Math.abs(amt); dd.count++; hourly[dt.getHours()].count++; hourly[dt.getHours()].amount += Math.abs(amt); weekday[dt.getDay()].count++; if (t === 'ACCRUAL') { aAmt += amt; var u = uAcc[r.userSeq] = uAcc[r.userSeq] || { name: r.userName, amount: 0, count: 0 }; u.amount += amt; u.count++; } else if (t === 'USE') { uAmt += Math.abs(amt); var u2 = uUse[r.userSeq] = uUse[r.userSeq] || { name: r.userName, amount: 0, count: 0 }; u2.amount += Math.abs(amt); u2.count++; } else if (t === 'EXPIRED') eAmt += Math.abs(amt); else if (t === 'CANCEL_ACCRUAL') ca += Math.abs(amt); else if (t === 'CANCEL_USE') cu += Math.abs(amt); else if (t === 'RETURN') ret += Math.abs(amt); }
    var gDaily = Object.entries(gD).map(function (e) { return Object.assign({ date: e[0] }, e[1]); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var gems = { kpi: { total: G.length, accrualAmt: aAmt, useAmt: uAmt, expireAmt: eAmt, cancAcc: ca, cancUse: cu, retAmt: ret, netCirc: aAmt - uAmt - eAmt - ret - ca + cu }, byType: Object.entries(byType).map(function (e) { return Object.assign({ type: e[0], label: tm[e[0]] || e[0] }, e[1]); }), byReason: Object.entries(byReason).map(function (e) { return { reason: e[0], count: e[1] }; }).sort(function (a, b) { return b.count - a.count; }), byReferrer: Object.entries(byRef).map(function (e) { return { referrer: e[0], count: e[1].count, accrual: e[1].accrual }; }).sort(function (a, b) { return b.count - a.count; }), daily: gDaily, hourly: hourly.map(function (v, h) { return Object.assign({ hour: h }, v); }), weekday: weekday.map(function (v, d) { return Object.assign({ day: d }, v); }), topAccrual: topN(uAcc, 50, 'amount'), topUse: topN(uUse, 50, 'amount') };
    var sSt = {}, sD = {}, grip = {}, spon = {}, aDist = {}, spA = 0, cfA = 0, cnA = 0, bks = [[1, 9, '1-9'], [10, 49, '10-49'], [50, 99, '50-99'], [100, 499, '100-499'], [500, 999, '500-999'], [1000, 4999, '1K-5K'], [5000, 1e15, '5K+']];
    for (var i2 = 0; i2 < S.length; i2++) { var r2 = S[i2], st = r2.state, d2 = dStr(new Date(r2.sponsoredAt)); sSt[st] = (sSt[st] || 0) + 1; spA += r2.sponsoredGemAmount || 0; cfA += r2.confirmedGemAmount || 0; cnA += r2.canceledGemAmount || 0; var dd2 = sD[d2] = sD[d2] || { count: 0, amount: 0, canceled: 0 }; dd2.count++; dd2.amount += r2.sponsoredGemAmount || 0; if (st !== 'SPONSORED') dd2.canceled++; var gg = r2.targetUser || {}, gp = grip[gg.userSeq] = grip[gg.userSeq] || { name: gg.userName, amount: 0, count: 0 }; gp.amount += r2.confirmedGemAmount || 0; gp.count++; var uu = r2.user || {}, sp = spon[uu.userSeq] = spon[uu.userSeq] || { name: uu.userName, amount: 0, count: 0 }; sp.amount += r2.confirmedGemAmount || 0; sp.count++; var a2 = r2.sponsoredGemAmount || 0; for (var bi = 0; bi < bks.length; bi++) { if (a2 >= bks[bi][0] && a2 <= bks[bi][1]) { aDist[bks[bi][2]] = (aDist[bks[bi][2]] || 0) + 1; break; } } }
    var cc = (sSt.ALL_CANCELED || 0) + (sSt.PARTIAL_CANCELED || 0);
    var spons = { kpi: { total: S.length, sponsoredAmt: spA, confirmedAmt: cfA, canceledAmt: cnA, cancelRate: S.length ? cc / S.length : 0, sponsoredCount: sSt.SPONSORED || 0, uniqueGrippers: Object.keys(grip).length, uniqueSponsors: Object.keys(spon).length }, byState: Object.entries(sSt).map(function (e) { return { state: e[0], count: e[1] }; }), daily: Object.entries(sD).map(function (e) { return Object.assign({ date: e[0] }, e[1]); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }), amountDist: bks.map(function (b) { return { bucket: b[2], count: aDist[b[2]] || 0 }; }), topGrippers: topN(grip, 50, 'amount'), topSponsors: topN(spon, 50, 'amount') };
    var pSt = {}, pStr = {}, pBn = {}, pD = {}, buy = {}, tP = 0, tG = 0;
    for (var i3 = 0; i3 < P.length; i3++) { var r3 = P[i3], d3 = dStr(new Date(r3.orderedAt || r3.purchasedAt)); var ps = pStr[r3.storeType] = pStr[r3.storeType] || { count: 0, price: 0 }; ps.count++; ps.price += r3.price || 0; pSt[r3.state] = (pSt[r3.state] || 0) + 1; var bl = (r3.gemBundle && (r3.gemBundle.productName || r3.gemBundle.productId || r3.gemBundle.productSeq)) || '기타', pb = pBn[bl] = pBn[bl] || { count: 0, price: 0, gem: 0 }; pb.count++; pb.price += r3.price || 0; pb.gem += r3.gemAmount || 0; var dd3 = pD[d3] = pD[d3] || { count: 0, price: 0 }; dd3.count++; dd3.price += r3.price || 0; tP += r3.price || 0; tG += r3.gemAmount || 0; var bu = r3.user || {}, bb = buy[bu.userSeq] = buy[bu.userSeq] || { name: bu.userName, price: 0, count: 0 }; bb.price += r3.price || 0; bb.count++; }
    var purch = { kpi: { total: P.length, totalPrice: tP, totalGem: tG, avgPrice: P.length ? Math.round(tP / P.length) : 0, purchasedCount: pSt.PURCHASED || 0, uniqueBuyers: Object.keys(buy).length }, byStore: Object.entries(pStr).map(function (e) { return Object.assign({ store: e[0] }, e[1]); }), byState: Object.entries(pSt).map(function (e) { return { state: e[0], count: e[1] }; }), byBundle: Object.entries(pBn).map(function (e) { return Object.assign({ bundle: e[0] }, e[1]); }).sort(function (a, b) { return b.count - a.count; }), daily: Object.entries(pD).map(function (e) { return Object.assign({ date: e[0] }, e[1]); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; }), topBuyers: topN(buy, 50, 'price') };
    return { meta: { generatedAt: Date.now(), gemsCount: G.length, sponsCount: S.length, purchCount: P.length, dateRange: { from: gDaily[0] && gDaily[0].date, to: gDaily[gDaily.length - 1] && gDaily[gDaily.length - 1].date } }, gems: gems, spons: spons, purch: purch };
  }

  /* ---------- 그리퍼 젬 정산 (admin2.grip.show) : 환전 시 10% 수수료(후원하기 이용료) ---------- */
  async function collectSettle() {
    var ck = {}; document.cookie.split(';').forEach(function (c) { var i = c.indexOf('='); if (i > 0) ck[c.slice(0, i).trim()] = c.slice(i + 1).trim(); });
    var tok = decodeURIComponent(ck['grip.admin.sessiona'] || ''); if (!tok) return null;
    var H = { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' } };
    var toM = dStr(new Date()).slice(0, 7);
    async function ft(bt, tid) { var url = 'https://admin-api.grip.show/settlement/sponsorship/result/exchange/list?draw=1&start=0&length=5000&tid=' + tid + '&search%5BfromMonth%5D=2025-12&search%5BtoMonth%5D=' + toM + '&search%5BuserSeq%5D=0&search%5BbusinessRegistrationNumber%5D=&search%5BbusinessType%5D=' + bt + '&search%5BsettlementType%5D=sponsorship&search%5BexchangeState%5D=1&search%5BexchangeState%5D=2&search%5BexchangeState%5D=3&search%5BexchangeState%5D=4'; for (var r = 0; r < 5; r++) { try { var res = await fetch(url, H); if (!res.ok) throw 0; var j = await res.json(); return j.data || []; } catch (e) { await sleep(800 * (r + 1)); } } return []; }
    var indiv = await ft(1, 0), biz = await ft(2, 1);
    var all = indiv.map(function (x) { x._b = false; return x; }).concat(biz.map(function (x) { x._b = true; return x; }));
    var sm = { 1: '대기중', 2: '진행중', 3: '완료', 4: '보류' };
    var tFee = 0, tGem = 0, tEx = 0, byState = {}, byMonth = {}, grip = {};
    for (var i = 0; i < all.length; i++) { var x = all[i], fee = x.advertisementFee || 0, gem = x.gemAmount || 0, ex = x.exchangeAmount || 0, st = sm[x.state] || String(x.state); tFee += fee; tGem += gem; tEx += ex; (byState[st] = byState[st] || { count: 0, fee: 0 }); byState[st].count++; byState[st].fee += fee; var dt = new Date(x.createdAt), mk = dt.getFullYear() + '-' + pad(dt.getMonth() + 1); (byMonth[mk] = byMonth[mk] || { fee: 0, gem: 0, count: 0 }); byMonth[mk].fee += fee; byMonth[mk].gem += gem; byMonth[mk].count++; var g = grip[x.userSeq] = grip[x.userSeq] || { name: x.userName, biz: x._b, gem: 0, fee: 0, exchange: 0, count: 0 }; g.gem += gem; g.fee += fee; g.exchange += ex; g.count++; }
    var comp = byState['완료'] || { count: 0, fee: 0 }, pend = byState['대기중'] || { count: 0, fee: 0 }, hold = byState['보류'] || { count: 0, fee: 0 };
    return {
      meta: { collectedAt: dStr(new Date()), from: '2025-12', to: toM },
      kpi: { totalFee: tFee, totalGem: tGem, totalExchange: tEx, count: all.length, indivCount: indiv.length, bizCount: biz.length, uniqueGrippers: Object.keys(grip).length, completedFee: comp.fee, completedCount: comp.count, pendingFee: pend.fee, pendingCount: pend.count, holdFee: hold.fee, holdCount: hold.count },
      byState: Object.keys(byState).map(function (s) { return { state: s, count: byState[s].count, fee: byState[s].fee }; }).sort(function (a, b) { return b.fee - a.fee; }),
      byMonth: Object.keys(byMonth).sort().map(function (m) { return { month: m, fee: byMonth[m].fee, gem: byMonth[m].gem, count: byMonth[m].count }; }),
      topGrippers: Object.keys(grip).map(function (k) { return grip[k]; }).sort(function (a, b) { return b.fee - a.fee; }).slice(0, 20)
    };
  }

  /* ---------- 광고 SDK (partners.adpopcorn.com) ---------- */
  async function collectSDK() {
    window.__TK = null; var of = window.fetch;
    window.fetch = function (input, init) { try { var u = typeof input === 'string' ? input : (input && input.url); if (u && String(u).indexOf('partners-api') >= 0) { var hh = (init && init.headers) || {}, ho = {}; if (hh instanceof Headers) hh.forEach(function (v, k) { ho[k] = v; }); else ho = Object.assign({}, hh); var a = ho.authorization || ho.Authorization; if (a) window.__TK = a; } } catch (e) { } return of.apply(this, arguments); };
    log('토큰 확인 중…'); var lk = document.querySelector('a[href*="/medias-dashboard/"]'); if (lk) { lk.click(); await sleep(1600); history.back(); await sleep(2000); } else { history.back(); await sleep(1500); history.forward(); await sleep(1500); }
    if (!window.__TK) { err('대시보드에서 날짜를 한 번 [조회]한 뒤 다시 실행하세요.'); return null; }
    var H = { headers: { Authorization: window.__TK, accept: 'application/json' } }, SDK = {};
    var rs = ranges('2025-12-01', dStr);
    for (var k = 0; k < rs.length; k++) { log('SDK 수집 ' + rs[k][0] + '~' + rs[k][1]); for (var r = 0; r < 4; r++) { try { var j = await (await fetch('https://partners-api.adpopcorn.com/v1/publisher/report/company/daily?startDate=' + rs[k][0] + '&endDate=' + rs[k][1], H)).json(); if (j.Data) Object.assign(SDK, j.Data); break; } catch (e) { await sleep(1000); } } }
    var pm = { 1: 'iOS', 2: 'Android' }, tR = 0, tV = 0, tP = 0, tC = 0, daily = [], byOS = {};
    Object.keys(SDK).sort().forEach(function (d) { var dR = 0, dV = 0, dP = 0, dC = 0, oR = {}; SDK[d].forEach(function (m) { var os = pm[m.PlatformType] || ('P' + m.PlatformType); dR += m.Revenue || 0; dV += m.VisitValue || 0; dP += m.ParticipationValue || 0; dC += m.CompleteValue || 0; oR[os] = (oR[os] || 0) + (m.Revenue || 0); (byOS[os] = byOS[os] || { revenue: 0, visit: 0, participation: 0, complete: 0 }); byOS[os].revenue += m.Revenue || 0; byOS[os].visit += m.VisitValue || 0; byOS[os].participation += m.ParticipationValue || 0; byOS[os].complete += m.CompleteValue || 0; }); daily.push({ date: d, revenue: Math.round(dR), visit: dV, participation: dP, complete: dC, android: Math.round(oR.Android || 0), ios: Math.round(oR.iOS || 0) }); tR += dR; tV += dV; tP += dP; tC += dC; });
    return { kpi: { totalRevenue: Math.round(tR), totalVisit: tV, totalParticipation: tP, totalComplete: tC, days: daily.length }, byOS: Object.entries(byOS).map(function (e) { return { os: e[0], revenue: Math.round(e[1].revenue), visit: e[1].visit, participation: e[1].participation, complete: e[1].complete }; }), daily: daily };
  }

  /* ---------- 광고 SSP (console.adpopcorn.com/report/app) ---------- */
  async function collectSSP() {
    var req = await captureXHR('/report', '[조회하기]'); if (!req) return null;
    var base = JSON.parse(req.body), mk = { method: 'POST', headers: { Authorization: req.token, 'Content-Type': 'application/json', Accept: 'application/json' } };
    var rs = ranges('2025-12-01', ymd), daily = {}, tC = 0, tI = 0, tCl = 0, tReq = 0, tRes = 0;
    for (var k = 0; k < rs.length; k++) { log('SSP 수집 ' + rs[k][0] + '~' + rs[k][1]); var b = Object.assign({}, base, { since: rs[k][0], until: rs[k][1] }); for (var r = 0; r < 4; r++) { try { var j = await (await fetch('https://sspi-op-prod.adpopcorn.com/report', Object.assign({}, mk, { body: JSON.stringify(b) }))).json(); ((j.data && j.data.report) || []).forEach(function (row) { var d = row.ymd, c = parseFloat(row.media_cost) || 0, im = parseInt(row.impression) || 0, cl = parseInt(row.click) || 0, rq = parseInt(row.request) || 0, rp = parseInt(row.response) || 0; if (!daily[d]) daily[d] = { cost: 0, impression: 0, click: 0, request: 0, response: 0 }; daily[d].cost += c; daily[d].impression += im; daily[d].click += cl; daily[d].request += rq; daily[d].response += rp; tC += c; tI += im; tCl += cl; tReq += rq; tRes += rp; }); break; } catch (e) { await sleep(1000); } } }
    return { kpi: { totalCost: tC, totalImpression: tI, totalClick: tCl, totalRequest: tReq, totalResponse: tRes, days: Object.keys(daily).length }, daily: Object.keys(daily).sort().map(function (d) { return { date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), cost: daily[d].cost, impression: daily[d].impression, click: daily[d].click, request: daily[d].request, response: daily[d].response }; }) };
  }

  /* ---------- 광고 쿠팡 (console.adpopcorn.com/report/partner) ---------- */
  async function collectCoupang() {
    var req = await captureXHR('coupang/report', '[조회하기]'); if (!req) return null;
    var base = JSON.parse(req.body), mk = { method: 'POST', headers: { Authorization: req.token, 'Content-Type': 'application/json', Accept: 'application/json' } };
    var rs = ranges('2026-04-01', ymd), daily = {}, tCl = 0, tCv = 0, tCR = 0, tR = 0, tCm = 0, tCC = 0;
    for (var k = 0; k < rs.length; k++) { log('쿠팡 수집 ' + rs[k][0] + '~' + rs[k][1]); var b = Object.assign({}, base, { start_date: rs[k][0], end_date: rs[k][1] }); for (var r = 0; r < 4; r++) { try { var j = await (await fetch('https://allapi-live.adpopcorn.com/operation/management/coupang/report', Object.assign({}, mk, { body: JSON.stringify(b) }))).json(); (j.report || []).forEach(function (row) { var d = row.report_date; if (!daily[d]) daily[d] = { click: 0, conversion: 0, convRevenue: 0, grossRevenue: 0, revenue: 0 }; daily[d].click += row.click || 0; daily[d].conversion += row.conversion || 0; daily[d].convRevenue += row.conversion_revenue || 0; daily[d].grossRevenue += row.total_revenue || 0; daily[d].revenue += row.client_commission || 0; tCl += row.click || 0; tCv += row.conversion || 0; tCR += row.conversion_revenue || 0; tR += row.total_revenue || 0; tCm += row.commission || 0; tCC += row.client_commission || 0; }); break; } catch (e) { await sleep(1000); } } }
    return { kpi: { totalClick: tCl, totalConversion: tCv, totalConvRevenue: tCR, totalRevenue: tR, totalCommission: tCm, totalClientCommission: tCC, days: Object.keys(daily).length }, daily: Object.keys(daily).sort().map(function (d) { return { date: d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8), click: daily[d].click, conversion: daily[d].conversion, convRevenue: daily[d].convRevenue, grossRevenue: daily[d].grossRevenue, revenue: daily[d].revenue }; }) };
  }

  /* XHR/fetch 후킹 + [조회하기] 자동 클릭으로 토큰+body 캡처 */
  async function captureXHR(urlPart, btnText) {
    window.__RQ = null;
    var oS = XMLHttpRequest.prototype.send, oO = XMLHttpRequest.prototype.open, oH = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return oO.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return oH.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) { try { if (String(this.__u).indexOf(urlPart) >= 0) window.__RQ = { token: this.__h.Authorization || this.__h.authorization, body: b ? String(b) : null }; } catch (e) { } return oS.apply(this, arguments); };
    var of = window.fetch; window.fetch = function (input, init) { try { var u = typeof input === 'string' ? input : (input && input.url); if (u && String(u).indexOf(urlPart) >= 0) { var hh = (init && init.headers) || {}, ho = {}; if (hh instanceof Headers) hh.forEach(function (v, k) { ho[k] = v; }); else ho = Object.assign({}, hh); window.__RQ = { token: ho.Authorization || ho.authorization, body: init && init.body ? String(init.body) : null }; } } catch (e) { } return of.apply(this, arguments); };
    log('필터 정보 확인 중… (조회 자동 클릭)');
    var go = [].slice.call(document.querySelectorAll('button')).find(function (b) { return b.textContent.trim().indexOf('조회') >= 0; });
    if (go) go.click();
    await sleep(3000);
    if (!window.__RQ || !window.__RQ.body) { err(btnText + ' 를 한 번 누른 뒤 다시 실행하세요.'); return null; }
    return window.__RQ;
  }
})();
