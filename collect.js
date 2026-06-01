/* ============================================================
 * 후원하기 대시보드 — 데이터 수집기 (collect.js)
 *
 * 사용법:
 *  1) admin2.grip.show 에 로그인한 상태로 접속
 *  2) F12 → Console 탭 → 이 파일 내용 전체를 붙여넣고 Enter
 *     (또는 북마클릿/스니펫으로 실행)
 *  3) 우측 상단 진행창이 끝나면 gem-snapshot.json 이 자동 다운로드됨
 *  4) 다운로드된 파일을 레포의 data/snapshot.json 으로 교체 후 git push
 *     → Vercel 이 자동 재배포하여 대시보드가 최신 데이터로 갱신됨
 * ============================================================ */
(async function () {
  'use strict';
  if (!location.host.includes('grip.show')) {
    alert('admin2.grip.show 에 로그인한 탭에서 실행해주세요.');
    return;
  }
  // ---- 토큰 (쿠키) ----
  const ck = {};
  document.cookie.split(';').forEach(c => { const i = c.indexOf('='); if (i > 0) ck[c.slice(0, i).trim()] = c.slice(i + 1).trim(); });
  const token = decodeURIComponent(ck['grip.admin.sessiona'] || '');
  if (!token) { alert('로그인 토큰을 찾지 못했습니다. admin2.grip.show 에 다시 로그인 해주세요.'); return; }
  const H = { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
  const API = 'https://admin-api.grip.show';

  // ---- 진행 UI ----
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:16px;right:16px;z-index:999999;background:#0c1a14;color:#e9f1ed;border:1px solid #2fb87f;border-radius:14px;padding:16px 20px;font:13px/1.6 -apple-system,Pretendard,sans-serif;box-shadow:0 8px 40px rgba(0,0,0,.5);min-width:260px';
  box.innerHTML = '<b style="color:#3ddc97">젬 데이터 수집 중…</b><div id="cl-log" style="margin-top:8px;color:#9fb4ab;font-variant-numeric:tabular-nums"></div>';
  document.body.appendChild(box);
  const P = {}; const logEl = box.querySelector('#cl-log');
  const draw = () => { logEl.innerHTML = Object.entries(P).map(([k, v]) => `${k}: ${v}`).join('<br>'); };
  const set = (k, v) => { P[k] = v; draw(); };

  // ---- fetch with retry ----
  async function fetchChunk(url) {
    for (let r = 0; r < 6; r++) {
      try { const res = await fetch(url, H); if (!res.ok) throw new Error('s' + res.status); return await res.json(); }
      catch (e) { await new Promise(s => setTimeout(s, 800 * (r + 1))); }
    }
    return null;
  }
  async function collect(label, build, len, conc) {
    set(label, '시작…');
    const first = await fetchChunk(build(0, len));
    if (!first) { set(label, '실패'); throw new Error(label + ' 첫 요청 실패'); }
    const total = first.recordsTotal; const arr = (first.data || []).slice();
    const starts = []; for (let s = len; s < total; s += len) starts.push(s);
    for (let i = 0; i < starts.length; i += conc) {
      const batch = starts.slice(i, i + conc);
      const res = await Promise.all(batch.map(s => fetchChunk(build(s, len))));
      res.forEach(j => { if (j && j.data) for (const x of j.data) arr.push(x); });
      set(label, arr.length.toLocaleString() + ' / ' + total.toLocaleString());
    }
    set(label, '완료 ' + arr.length.toLocaleString() + '건');
    return arr;
  }

  // 데이터 범위: 충분히 넓게 (서비스 시작 전 ~ 미래)
  const FROM = '2025-01-01', TO = '2027-12-31';
  const ISO_S = '2025-01-01T00:00:00.000Z', ISO_E = '2027-12-31T23:59:59.000Z';
  const gB = (s, l) => `${API}/gems?draw=1&start=${s}&length=${l}&search%5BfromDate%5D=${FROM}&search%5BtoDate%5D=${TO}&search%5BdateTarget%5D=ISSUED_AT&search%5BqueryTarget%5D=GEM_HISTORY_SEQ&search%5Bquery%5D=`;
  const sB = (s, l) => `${API}/sponsorships/list?draw=1&start=${s}&length=${l}&search%5BsearchDateField%5D=sponsoredAt&search%5BsearchStartAt%5D=${ISO_S}&search%5BsearchEndAt%5D=${ISO_E}&search%5BsearchTarget%5D=userName&search%5BsearchQuery%5D=&search%5Bstates%5D%5B0%5D=ALL_CANCELED&search%5Bstates%5D%5B1%5D=PARTIAL_CANCELED&search%5Bstates%5D%5B2%5D=SPONSORED`;
  const pB = (s, l) => `${API}/gem-purchases/list?draw=1&start=${s}&length=${l}&search%5BsearchDateField%5D=orderedAt&search%5BsearchTarget%5D=transactionId&search%5BsearchStartAt%5D=${ISO_S}&search%5BsearchEndAt%5D=${ISO_E}&search%5BsearchQuery%5D=`;

  let G, S, Pp;
  try {
    G = await collect('유저젬', gB, 5000, 6);
    S = await collect('그리퍼젬', sB, 1500, 8);
    Pp = await collect('결제', pB, 3000, 4);
  } catch (e) { box.innerHTML = '<b style="color:#ff6b6b">수집 실패</b><div style="margin-top:6px;color:#9fb4ab">' + e.message + '</div>'; return; }

  set('집계', '계산 중…');
  const snapshot = aggregate(G, S, Pp);

  // ---- 다운로드 ----
  const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'gem-snapshot.json';
  document.body.appendChild(a); a.click(); a.remove();
  box.innerHTML = '<b style="color:#3ddc97">✓ 수집 완료</b><div style="margin-top:8px;color:#9fb4ab">유저젬 ' + G.length.toLocaleString() + ' · 그리퍼젬 ' + S.length.toLocaleString() + ' · 결제 ' + Pp.length.toLocaleString() + '<br><br>gem-snapshot.json 다운로드됨.<br>레포 <code style="color:#3ddc97">data/snapshot.json</code> 으로 교체 후 push 하세요.</div>';
  setTimeout(() => { box.style.transition = 'opacity .5s'; box.style.opacity = '.85'; }, 1000);

  /* ---- 집계 (대시보드 snapshot 포맷) ---- */
  function aggregate(G, S, P) {
    const pad = n => String(n).padStart(2, '0');
    const dstr = ms => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    const hourOf = ms => new Date(ms).getHours(), wdayOf = ms => new Date(ms).getDay();
    const topN = (obj, n, key) => Object.entries(obj).map(([seq, v]) => ({ userSeq: +seq, ...v })).sort((a, b) => b[key] - a[key]).slice(0, n);

    // GEMS
    const typeMap = { ACCRUAL: '적립', USE: '사용', EXPIRED: '만료', CANCEL_ACCRUAL: '적립취소', CANCEL_USE: '사용취소', RETURN: '회수' };
    const byType = {}, byReason = {}, byRef = {}, gDaily = {}, hourly = Array.from({ length: 24 }, () => ({ count: 0, amount: 0 })), weekday = Array.from({ length: 7 }, () => ({ count: 0 }));
    const uAcc = {}, uUse = {}; let accrualAmt = 0, useAmt = 0, expireAmt = 0, cancAcc = 0, cancUse = 0, retAmt = 0;
    for (let i = 0; i < G.length; i++) {
      const r = G[i], t = r.gemHistoryType, amt = r.amount || 0, d = dstr(r.issuedAt);
      (byType[t] = byType[t] || { count: 0, amount: 0 }).count++; byType[t].amount += amt;
      byReason[r.reason] = (byReason[r.reason] || 0) + 1; byRef[r.referrerType] = (byRef[r.referrerType] || 0) + 1;
      const dd = gDaily[d] = gDaily[d] || { ACCRUAL: 0, USE: 0, EXPIRED: 0, CANCEL_ACCRUAL: 0, CANCEL_USE: 0, RETURN: 0, count: 0 }; dd[t] = (dd[t] || 0) + Math.abs(amt); dd.count++;
      hourly[hourOf(r.issuedAt)].count++; hourly[hourOf(r.issuedAt)].amount += Math.abs(amt); weekday[wdayOf(r.issuedAt)].count++;
      if (t === 'ACCRUAL') { accrualAmt += amt; const u = uAcc[r.userSeq] = uAcc[r.userSeq] || { name: r.userName, amount: 0, count: 0 }; u.amount += amt; u.count++; }
      else if (t === 'USE') { useAmt += Math.abs(amt); const u = uUse[r.userSeq] = uUse[r.userSeq] || { name: r.userName, amount: 0, count: 0 }; u.amount += Math.abs(amt); u.count++; }
      else if (t === 'EXPIRED') expireAmt += Math.abs(amt); else if (t === 'CANCEL_ACCRUAL') cancAcc += Math.abs(amt); else if (t === 'CANCEL_USE') cancUse += Math.abs(amt); else if (t === 'RETURN') retAmt += Math.abs(amt);
    }
    const gems = { kpi: { total: G.length, accrualAmt, useAmt, expireAmt, cancAcc, cancUse, retAmt, netCirc: accrualAmt - useAmt - expireAmt - retAmt - cancAcc + cancUse },
      byType: Object.entries(byType).map(([k, v]) => ({ type: k, label: typeMap[k] || k, ...v })),
      byReason: Object.entries(byReason).map(([k, v]) => ({ reason: k, count: v })).sort((a, b) => b.count - a.count),
      byReferrer: Object.entries(byRef).map(([k, v]) => ({ referrer: k, count: v })).sort((a, b) => b.count - a.count),
      daily: Object.entries(gDaily).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date < b.date ? -1 : 1),
      hourly: hourly.map((v, h) => ({ hour: h, ...v })), weekday: weekday.map((v, d) => ({ day: d, ...v })),
      topAccrual: topN(uAcc, 50, 'amount'), topUse: topN(uUse, 50, 'amount') };

    // SPONS
    const sState = {}, sDaily = {}, gripper = {}, sponsor = {}, amtDist = {}; let spAmt = 0, confAmt = 0, canAmt = 0;
    const bks = [[1, 9, '1-9'], [10, 49, '10-49'], [50, 99, '50-99'], [100, 499, '100-499'], [500, 999, '500-999'], [1000, 4999, '1K-5K'], [5000, 1e15, '5K+']];
    for (let i = 0; i < S.length; i++) {
      const r = S[i], st = r.state, d = dstr(r.sponsoredAt);
      sState[st] = (sState[st] || 0) + 1; spAmt += r.sponsoredGemAmount || 0; confAmt += r.confirmedGemAmount || 0; canAmt += r.canceledGemAmount || 0;
      const dd = sDaily[d] = sDaily[d] || { count: 0, amount: 0, canceled: 0 }; dd.count++; dd.amount += r.sponsoredGemAmount || 0; if (st !== 'SPONSORED') dd.canceled++;
      const g = r.targetUser || {}; const gp = gripper[g.userSeq] = gripper[g.userSeq] || { name: g.userName, amount: 0, count: 0 }; gp.amount += r.confirmedGemAmount || 0; gp.count++;
      const u = r.user || {}; const sp = sponsor[u.userSeq] = sponsor[u.userSeq] || { name: u.userName, amount: 0, count: 0 }; sp.amount += r.confirmedGemAmount || 0; sp.count++;
      const a = r.sponsoredGemAmount || 0; for (const b of bks) { if (a >= b[0] && a <= b[1]) { amtDist[b[2]] = (amtDist[b[2]] || 0) + 1; break; } }
    }
    const canCnt = (sState.ALL_CANCELED || 0) + (sState.PARTIAL_CANCELED || 0);
    const spons = { kpi: { total: S.length, sponsoredAmt: spAmt, confirmedAmt: confAmt, canceledAmt: canAmt, cancelRate: S.length ? canCnt / S.length : 0, sponsoredCount: sState.SPONSORED || 0, uniqueGrippers: Object.keys(gripper).length, uniqueSponsors: Object.keys(sponsor).length },
      byState: Object.entries(sState).map(([k, v]) => ({ state: k, count: v })),
      daily: Object.entries(sDaily).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date < b.date ? -1 : 1),
      amountDist: bks.map(b => ({ bucket: b[2], count: amtDist[b[2]] || 0 })),
      topGrippers: topN(gripper, 50, 'amount'), topSponsors: topN(sponsor, 50, 'amount') };

    // PURCH
    const pStore = {}, pState = {}, pBundle = {}, pDaily = {}, buyer = {}; let totPrice = 0, totGem = 0;
    for (let i = 0; i < P.length; i++) {
      const r = P[i], d = dstr(r.orderedAt || r.purchasedAt);
      const ps = pStore[r.storeType] = pStore[r.storeType] || { count: 0, price: 0 }; ps.count++; ps.price += r.price || 0;
      pState[r.state] = (pState[r.state] || 0) + 1;
      const bl = (r.gemBundle && (r.gemBundle.productName || r.gemBundle.productId || r.gemBundle.productSeq)) || '기타'; const pb = pBundle[bl] = pBundle[bl] || { count: 0, price: 0, gem: 0 }; pb.count++; pb.price += r.price || 0; pb.gem += r.gemAmount || 0;
      const dd = pDaily[d] = pDaily[d] || { count: 0, price: 0 }; dd.count++; dd.price += r.price || 0;
      totPrice += r.price || 0; totGem += r.gemAmount || 0;
      const u = r.user || {}; const b = buyer[u.userSeq] = buyer[u.userSeq] || { name: u.userName, price: 0, count: 0 }; b.price += r.price || 0; b.count++;
    }
    const purch = { kpi: { total: P.length, totalPrice: totPrice, totalGem: totGem, avgPrice: P.length ? Math.round(totPrice / P.length) : 0, purchasedCount: pState.PURCHASED || 0, uniqueBuyers: Object.keys(buyer).length },
      byStore: Object.entries(pStore).map(([k, v]) => ({ store: k, ...v })),
      byState: Object.entries(pState).map(([k, v]) => ({ state: k, count: v })),
      byBundle: Object.entries(pBundle).map(([k, v]) => ({ bundle: k, ...v })).sort((a, b) => b.count - a.count),
      daily: Object.entries(pDaily).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date < b.date ? -1 : 1),
      topBuyers: topN(buyer, 50, 'price') };

    return { meta: { generatedAt: Date.now(), gemsCount: G.length, sponsCount: S.length, purchCount: P.length, dateRange: { from: gems.daily[0] && gems.daily[0].date, to: gems.daily[gems.daily.length - 1] && gems.daily[gems.daily.length - 1].date } }, gems, spons, purch };
  }
})();
