/* Vercel Serverless — 서버사이드 자동 수집 (젬 + 정산)
 * 저장된 ADMIN_TOKEN(admin2 쿠키 grip.admin.sessiona, 수명 약 15일)으로
 * admin-api를 직접 호출(서버사이드라 CORS 없음) → 집계 → GitHub 커밋 → Vercel 자동 재배포.
 *
 * 호출 방법:
 *  - 대시보드 '새로고침' 버튼 → POST /api/collect  (헤더 X-Sync-Key)
 *  - Vercel Cron(매일)        → GET  /api/collect  (헤더 x-vercel-cron 자동)
 *
 * 필요 env (Vercel → Settings → Environment Variables):
 *   GITHUB_TOKEN : repo 권한 PAT
 *   GITHUB_REPO  : "Moowillbedone/sponsorship-dashboard"
 *   ADMIN_TOKEN  : admin2 로그인 토큰(쿠키 grip.admin.sessiona 값) — 약 15일마다 갱신
 *   SYNC_SECRET  : (선택) 버튼 호출 인증용 비밀 문자열
 *
 *  ※ 광고(adpopcorn)는 토큰이 단기/httpOnly라 서버 보관이 불가 → 북마클릿(sync-all.js) 유지.
 */
const ADMIN = 'https://admin-api.grip.show';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');
const dStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

const ADMIN_HEADERS = tok => ({ Authorization: 'Bearer ' + tok, Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Origin: 'https://admin2.grip.show', Referer: 'https://admin2.grip.show/' });
async function fc(url, tok) {
  for (let k = 0; k < 6; k++) {
    try {
      const res = await fetch(url, { headers: ADMIN_HEADERS(tok) });
      if (res.status === 401 || res.status === 403) throw new Error('UNAUTHORIZED');
      if (!res.ok) throw new Error('http ' + res.status);
      return await res.json();
    } catch (e) { if (e.message === 'UNAUTHORIZED') throw e; await sleep(600 * (k + 1)); }
  }
  return null;
}
async function coll(tok, build, len, conc) {
  const first = await fc(build(0, len), tok); if (!first) return null;
  const total = first.recordsTotal; const arr = (first.data || []).slice();
  const starts = []; for (let s = len; s < total; s += len) starts.push(s);
  for (let i = 0; i < starts.length; i += conc) {
    const bt = starts.slice(i, i + conc);
    const rs = await Promise.all(bt.map(s => fc(build(s, len), tok)));
    rs.forEach(j => { if (j && j.data) j.data.forEach(x => arr.push(x)); });
  }
  return arr;
}

/* ===== 젬 전체 집계 (sync-all.js aggSnapshot 과 동일 로직) ===== */
function aggSnapshot(G, S, P) {
  const topN = (o, n, key) => Object.entries(o).map(e => Object.assign({ userSeq: +e[0] }, e[1])).sort((a, b) => b[key] - a[key]).slice(0, n);
  const tm = { ACCRUAL: '적립', USE: '사용', EXPIRED: '만료', CANCEL_ACCRUAL: '적립취소', CANCEL_USE: '사용취소', RETURN: '회수' };
  const byType = {}, byReason = {}, byRef = {}, gD = {}, hourly = [], weekday = [], uAcc = {}, uUse = {};
  let aAmt = 0, uAmt = 0, eAmt = 0, ca = 0, cu = 0, ret = 0;
  for (let h = 0; h < 24; h++) hourly.push({ count: 0, amount: 0 });
  for (let w = 0; w < 7; w++) weekday.push({ count: 0 });
  for (let i = 0; i < G.length; i++) {
    const r = G[i], t = r.gemHistoryType, amt = r.amount || 0, dt = new Date(r.issuedAt), d = dStr(dt);
    (byType[t] = byType[t] || { count: 0, amount: 0 }).count++; byType[t].amount += amt;
    byReason[r.reason] = (byReason[r.reason] || 0) + 1;
    if (!byRef[r.referrerType]) byRef[r.referrerType] = { count: 0, accrual: 0 };
    byRef[r.referrerType].count++;
    if (t === 'ACCRUAL' && !(r.referrerType === 'MANUAL_GEM' && d.slice(0, 7) === '2025-12')) byRef[r.referrerType].accrual += amt;
    const dd = gD[d] = gD[d] || { ACCRUAL: 0, USE: 0, EXPIRED: 0, CANCEL_ACCRUAL: 0, CANCEL_USE: 0, RETURN: 0, count: 0 };
    dd[t] = (dd[t] || 0) + Math.abs(amt); dd.count++;
    hourly[dt.getHours()].count++; hourly[dt.getHours()].amount += Math.abs(amt); weekday[dt.getDay()].count++;
    if (t === 'ACCRUAL') { aAmt += amt; const u = uAcc[r.userSeq] = uAcc[r.userSeq] || { name: r.userName, amount: 0, count: 0 }; u.amount += amt; u.count++; }
    else if (t === 'USE') { uAmt += Math.abs(amt); const u2 = uUse[r.userSeq] = uUse[r.userSeq] || { name: r.userName, amount: 0, count: 0 }; u2.amount += Math.abs(amt); u2.count++; }
    else if (t === 'EXPIRED') eAmt += Math.abs(amt);
    else if (t === 'CANCEL_ACCRUAL') ca += Math.abs(amt);
    else if (t === 'CANCEL_USE') cu += Math.abs(amt);
    else if (t === 'RETURN') ret += Math.abs(amt);
  }
  const gDaily = Object.entries(gD).map(e => Object.assign({ date: e[0] }, e[1])).sort((a, b) => a.date < b.date ? -1 : 1);
  const gems = { kpi: { total: G.length, accrualAmt: aAmt, useAmt: uAmt, expireAmt: eAmt, cancAcc: ca, cancUse: cu, retAmt: ret, netCirc: aAmt - uAmt - eAmt - ret - ca + cu }, byType: Object.entries(byType).map(e => Object.assign({ type: e[0], label: tm[e[0]] || e[0] }, e[1])), byReason: Object.entries(byReason).map(e => ({ reason: e[0], count: e[1] })).sort((a, b) => b.count - a.count), byReferrer: Object.entries(byRef).map(e => ({ referrer: e[0], count: e[1].count, accrual: e[1].accrual })).sort((a, b) => b.count - a.count), daily: gDaily, hourly: hourly.map((v, h) => Object.assign({ hour: h }, v)), weekday: weekday.map((v, d) => Object.assign({ day: d }, v)), topAccrual: topN(uAcc, 50, 'amount'), topUse: topN(uUse, 50, 'amount') };
  const sSt = {}, sD = {}, grip = {}, spon = {}, aDist = {}; let spA = 0, cfA = 0, cnA = 0;
  const bks = [[1, 9, '1-9'], [10, 49, '10-49'], [50, 99, '50-99'], [100, 499, '100-499'], [500, 999, '500-999'], [1000, 4999, '1K-5K'], [5000, 1e15, '5K+']];
  for (let i2 = 0; i2 < S.length; i2++) {
    const r2 = S[i2], st = r2.state, d2 = dStr(new Date(r2.sponsoredAt));
    sSt[st] = (sSt[st] || 0) + 1; spA += r2.sponsoredGemAmount || 0; cfA += r2.confirmedGemAmount || 0; cnA += r2.canceledGemAmount || 0;
    const dd2 = sD[d2] = sD[d2] || { count: 0, amount: 0, canceled: 0 }; dd2.count++; dd2.amount += r2.sponsoredGemAmount || 0; if (st !== 'SPONSORED') dd2.canceled++;
    const gg = r2.targetUser || {}, gp = grip[gg.userSeq] = grip[gg.userSeq] || { name: gg.userName, amount: 0, count: 0 }; gp.amount += r2.confirmedGemAmount || 0; gp.count++;
    const uu = r2.user || {}, sp = spon[uu.userSeq] = spon[uu.userSeq] || { name: uu.userName, amount: 0, count: 0 }; sp.amount += r2.confirmedGemAmount || 0; sp.count++;
    const a2 = r2.sponsoredGemAmount || 0; for (let bi = 0; bi < bks.length; bi++) { if (a2 >= bks[bi][0] && a2 <= bks[bi][1]) { aDist[bks[bi][2]] = (aDist[bks[bi][2]] || 0) + 1; break; } }
  }
  const cc = (sSt.ALL_CANCELED || 0) + (sSt.PARTIAL_CANCELED || 0);
  const spons = { kpi: { total: S.length, sponsoredAmt: spA, confirmedAmt: cfA, canceledAmt: cnA, cancelRate: S.length ? cc / S.length : 0, sponsoredCount: sSt.SPONSORED || 0, uniqueGrippers: Object.keys(grip).length, uniqueSponsors: Object.keys(spon).length }, byState: Object.entries(sSt).map(e => ({ state: e[0], count: e[1] })), daily: Object.entries(sD).map(e => Object.assign({ date: e[0] }, e[1])).sort((a, b) => a.date < b.date ? -1 : 1), amountDist: bks.map(b => ({ bucket: b[2], count: aDist[b[2]] || 0 })), topGrippers: topN(grip, 50, 'amount'), topSponsors: topN(spon, 50, 'amount') };
  const pSt = {}, pStr = {}, pBn = {}, pD = {}, buy = {}; let tP = 0, tG = 0;
  for (let i3 = 0; i3 < P.length; i3++) {
    const r3 = P[i3], d3 = dStr(new Date(r3.orderedAt || r3.purchasedAt));
    const ps = pStr[r3.storeType] = pStr[r3.storeType] || { count: 0, price: 0 }; ps.count++; ps.price += r3.price || 0;
    pSt[r3.state] = (pSt[r3.state] || 0) + 1;
    const bl = (r3.gemBundle && (r3.gemBundle.productName || r3.gemBundle.productId || r3.gemBundle.productSeq)) || '기타', pb = pBn[bl] = pBn[bl] || { count: 0, price: 0, gem: 0 }; pb.count++; pb.price += r3.price || 0; pb.gem += r3.gemAmount || 0;
    const dd3 = pD[d3] = pD[d3] || { count: 0, price: 0 }; dd3.count++; dd3.price += r3.price || 0;
    tP += r3.price || 0; tG += r3.gemAmount || 0;
    const bu = r3.user || {}, bb = buy[bu.userSeq] = buy[bu.userSeq] || { name: bu.userName, price: 0, count: 0 }; bb.price += r3.price || 0; bb.count++;
  }
  const purch = { kpi: { total: P.length, totalPrice: tP, totalGem: tG, avgPrice: P.length ? Math.round(tP / P.length) : 0, purchasedCount: pSt.PURCHASED || 0, uniqueBuyers: Object.keys(buy).length }, byStore: Object.entries(pStr).map(e => Object.assign({ store: e[0] }, e[1])), byState: Object.entries(pSt).map(e => ({ state: e[0], count: e[1] })), byBundle: Object.entries(pBn).map(e => Object.assign({ bundle: e[0] }, e[1])).sort((a, b) => b.count - a.count), daily: Object.entries(pD).map(e => Object.assign({ date: e[0] }, e[1])).sort((a, b) => a.date < b.date ? -1 : 1), topBuyers: topN(buy, 50, 'price') };
  return { meta: { generatedAt: Date.now(), gemsCount: G.length, sponsCount: S.length, purchCount: P.length, dateRange: { from: gDaily[0] && gDaily[0].date, to: gDaily[gDaily.length - 1] && gDaily[gDaily.length - 1].date } }, gems, spons, purch };
}

/* ===== 정산 집계 (sync-all.js collectSettle 과 동일 로직) ===== */
function aggSettle(all) {
  const sm = { 1: '대기중', 2: '진행중', 3: '완료', 4: '보류' };
  let tFee = 0, tGem = 0, tEx = 0, ind = 0, biz = 0; const byState = {}, byMonth = {}, grip = {};
  for (let i = 0; i < all.length; i++) {
    const x = all[i], fee = x.advertisementFee || 0, gem = x.gemAmount || 0, ex = x.exchangeAmount || 0, st = sm[x.state] || String(x.state);
    if (x._b) biz++; else ind++;
    tFee += fee; tGem += gem; tEx += ex;
    (byState[st] = byState[st] || { count: 0, fee: 0 }); byState[st].count++; byState[st].fee += fee;
    const dt = new Date(x.createdAt), mk = dt.getFullYear() + '-' + pad(dt.getMonth() + 1);
    (byMonth[mk] = byMonth[mk] || { fee: 0, gem: 0, count: 0 }); byMonth[mk].fee += fee; byMonth[mk].gem += gem; byMonth[mk].count++;
    const g = grip[x.userSeq] = grip[x.userSeq] || { name: x.userName, biz: x._b, gem: 0, fee: 0, exchange: 0, count: 0 }; g.gem += gem; g.fee += fee; g.exchange += ex; g.count++;
  }
  const comp = byState['완료'] || { count: 0, fee: 0 }, pend = byState['대기중'] || { count: 0, fee: 0 }, hold = byState['보류'] || { count: 0, fee: 0 };
  const toM = dStr(new Date()).slice(0, 7);
  return {
    meta: { collectedAt: dStr(new Date()), from: '2025-12', to: toM },
    kpi: { totalFee: tFee, totalGem: tGem, totalExchange: tEx, count: all.length, indivCount: ind, bizCount: biz, uniqueGrippers: Object.keys(grip).length, completedFee: comp.fee, completedCount: comp.count, pendingFee: pend.fee, pendingCount: pend.count, holdFee: hold.fee, holdCount: hold.count },
    byState: Object.keys(byState).map(s => ({ state: s, count: byState[s].count, fee: byState[s].fee })).sort((a, b) => b.fee - a.fee),
    byMonth: Object.keys(byMonth).sort().map(m => ({ month: m, fee: byMonth[m].fee, gem: byMonth[m].gem, count: byMonth[m].count })),
    topGrippers: Object.keys(grip).map(k => grip[k]).sort((a, b) => b.fee - a.fee).slice(0, 20)
  };
}

async function ghCommit(REPO, TOKEN, path, dataObj) {
  const api = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const gh = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'collect' };
  let sha; const cur = await fetch(api + '?ref=main', { headers: gh }); if (cur.ok) sha = (await cur.json()).sha;
  const content = Buffer.from(JSON.stringify(dataObj)).toString('base64');
  const put = await fetch(api, { method: 'PUT', headers: { ...gh, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `data: 서버 자동 수집 (${path})`, content, sha, branch: 'main' }) });
  if (!put.ok) throw new Error('github ' + path + ': ' + (await put.text()).slice(0, 200));
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const TOKEN = process.env.GITHUB_TOKEN, REPO = process.env.GITHUB_REPO, ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim(), SECRET = process.env.SYNC_SECRET;
  if (!TOKEN || !REPO || !ADMIN_TOKEN) return res.status(500).json({ error: 'env 미설정: GITHUB_TOKEN, GITHUB_REPO, ADMIN_TOKEN 필요' });
  if ((req.url || '').includes('debug=1')) {
    try {
      const tr = await fetch(`${ADMIN}/gems?draw=1&start=0&length=1&search%5BfromDate%5D=2026-01-01&search%5BtoDate%5D=2026-01-02&search%5BdateTarget%5D=ISSUED_AT&search%5BqueryTarget%5D=GEM_HISTORY_SEQ&search%5Bquery%5D=`, { headers: ADMIN_HEADERS(ADMIN_TOKEN) });
      const bodyHead = (await tr.text()).slice(0, 200);
      return res.status(200).json({ debug: true, adminStatus: tr.status, server: tr.headers.get('server'), cfRay: tr.headers.get('cf-ray'), bodyHead, tokenLen: ADMIN_TOKEN.length });
    } catch (e) { return res.status(200).json({ debug: true, err: e.message }); }
  }
  const isCron = !!req.headers['x-vercel-cron'];
  if (SECRET && !isCron && req.headers['x-sync-key'] !== SECRET) return res.status(401).json({ error: 'unauthorized (bad sync key)' });

  try {
    const fD = '2025-01-01', tD = '2026-12-31', sS = '2025-01-01T00:00:00.000Z', sE = '2026-12-31T23:59:59.000Z';
    const G = await coll(ADMIN_TOKEN, (s, l) => `${ADMIN}/gems?draw=1&start=${s}&length=${l}&search%5BfromDate%5D=${fD}&search%5BtoDate%5D=${tD}&search%5BdateTarget%5D=ISSUED_AT&search%5BqueryTarget%5D=GEM_HISTORY_SEQ&search%5Bquery%5D=`, 5000, 6);
    if (!G) return res.status(502).json({ error: 'gems 수집 실패' });
    const Sp = await coll(ADMIN_TOKEN, (s, l) => `${ADMIN}/sponsorships/list?draw=1&start=${s}&length=${l}&search%5BsearchDateField%5D=sponsoredAt&search%5BsearchStartAt%5D=${sS}&search%5BsearchEndAt%5D=${sE}&search%5BsearchTarget%5D=userName&search%5BsearchQuery%5D=&search%5Bstates%5D%5B0%5D=ALL_CANCELED&search%5Bstates%5D%5B1%5D=PARTIAL_CANCELED&search%5Bstates%5D%5B2%5D=SPONSORED`, 1500, 8) || [];
    const P = await coll(ADMIN_TOKEN, (s, l) => `${ADMIN}/gem-purchases/list?draw=1&start=${s}&length=${l}&search%5BsearchDateField%5D=orderedAt&search%5BsearchTarget%5D=transactionId&search%5BsearchStartAt%5D=${sS}&search%5BsearchEndAt%5D=${sE}&search%5BsearchQuery%5D=`, 3000, 4) || [];
    const snap = aggSnapshot(G, Sp, P);

    const toM = dStr(new Date()).slice(0, 7);
    const sb = (bt, tid) => `${ADMIN}/settlement/sponsorship/result/exchange/list?draw=1&start=0&length=5000&tid=${tid}&search%5BfromMonth%5D=2025-12&search%5BtoMonth%5D=${toM}&search%5BuserSeq%5D=0&search%5BbusinessRegistrationNumber%5D=&search%5BbusinessType%5D=${bt}&search%5BsettlementType%5D=sponsorship&search%5BexchangeState%5D=1&search%5BexchangeState%5D=2&search%5BexchangeState%5D=3&search%5BexchangeState%5D=4`;
    const indRows = (await fc(sb(1, 0), ADMIN_TOKEN)) || {}, bizRows = (await fc(sb(2, 1), ADMIN_TOKEN)) || {};
    const settle = aggSettle((indRows.data || []).map(x => Object.assign({ _b: false }, x)).concat((bizRows.data || []).map(x => Object.assign({ _b: true }, x))));

    await ghCommit(REPO, TOKEN, 'data/snapshot.json', snap);
    await ghCommit(REPO, TOKEN, 'data/spons-settlement.json', settle);
    return res.status(200).json({ ok: true, gems: G.length, spons: Sp.length, purch: P.length, settle: settle.kpi.count, at: dStr(new Date()) });
  } catch (e) {
    if (String(e.message).includes('UNAUTHORIZED')) return res.status(401).json({ error: 'ADMIN_TOKEN 만료 — admin2 재로그인 후 토큰 갱신 필요' });
    return res.status(500).json({ error: e.message });
  }
}
