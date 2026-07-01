/* Vercel Serverless — 데이터 동기화 엔드포인트
 * 북마클릿이 수집한 데이터를 받아 GitHub에 자동 커밋 → Vercel 자동 재배포.
 *
 * 필요 환경변수 (Vercel → Settings → Environment Variables):
 *   GITHUB_TOKEN : repo 권한 Personal Access Token
 *   GITHUB_REPO  : "owner/repo" (예: kmlee-ai/sponsorship-dashboard)
 *   SYNC_SECRET  : 임의 비밀 문자열 (북마클릿과 공유, 무단 업로드 방지)
 */
const FILES = {
  gems: 'data/snapshot.json',
  sdk: 'data/ads-sdk.json',
  ssp: 'data/ads-ssp.json',
  coupang: 'data/ads-coupang.json',
  settle: 'data/spons-settlement.json',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Sync-Key');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const TOKEN = process.env.GITHUB_TOKEN;
  const REPO = process.env.GITHUB_REPO;
  const SECRET = process.env.SYNC_SECRET;
  if (!TOKEN || !REPO) return res.status(500).json({ error: 'server not configured: set GITHUB_TOKEN & GITHUB_REPO' });

  if (SECRET && req.headers['x-sync-key'] !== SECRET) return res.status(401).json({ error: 'unauthorized (bad sync key)' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'bad json' }); } }
  const { type, data } = body || {};
  const path = FILES[type];
  if (!path) return res.status(400).json({ error: 'invalid type (gems|sdk|ssp|coupang|settle)' });
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid data' });
  const valid = type === 'gems' ? (data.gems && data.spons && data.purch)
    : type === 'settle' ? (data.kpi && data.byMonth && data.topGrippers)
    : (data.kpi && data.daily);
  if (!valid) return res.status(400).json({ error: 'data shape mismatch for type ' + type });

  const api = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const gh = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sponsorship-sync' };

  // 광고(sdk/ssp/coupang)는 애드팝콘이 과거 데이터를 보존만료로 안 주는 경우가 있어,
  // '신규 우선' 병합: 신규에 있는 날짜는 최신값으로 교체하고, 신규에 없는 과거(만료분)만 기존 보존.
  // (이전 '월 경계(cutoff)' 방식은 지난달 후반 데이터가 다음 달이 되면 영구 누락되는 버그가 있어 폐기)
  const ADS = { sdk: 1, ssp: 1, coupang: 1 };
  function mergeMonthly(existing, incoming) {
    if (!existing || !existing.daily || !incoming || !incoming.daily) return incoming;
    const map = {};
    existing.daily.forEach(function (d) { map[d.date] = d; });   // 기존 전부 먼저 (만료된 과거 보존)
    incoming.daily.forEach(function (d) { map[d.date] = d; });   // 신규로 덮어써 최신 반영 (신규 우선)
    const daily = Object.keys(map).sort().map(function (k) { return map[k]; });
    const sum = function (k) { return daily.reduce(function (a, x) { return a + (Number(x[k]) || 0); }, 0); };
    const kpi = Object.assign({}, incoming.kpi);
    if (type === 'sdk') Object.assign(kpi, { totalRevenue: sum('revenue'), totalVisit: sum('visit'), totalParticipation: sum('participation'), totalComplete: sum('complete'), days: daily.length });
    else if (type === 'ssp') Object.assign(kpi, { totalCost: sum('cost'), totalImpression: sum('impression'), totalClick: sum('click'), totalRequest: sum('request'), totalResponse: sum('response'), days: daily.length });
    else if (type === 'coupang') Object.assign(kpi, { totalClick: sum('click'), totalConversion: sum('conversion'), totalConvRevenue: sum('convRevenue'), totalRevenue: sum('grossRevenue'), totalClientCommission: sum('revenue'), days: daily.length });
    return Object.assign({}, incoming, { kpi: kpi, daily: daily });
  }

  try {
    let put, lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      let sha, existing = null;
      const cur = await fetch(api + '?ref=main', { headers: gh });
      if (cur.ok) { const j = await cur.json(); sha = j.sha; try { existing = JSON.parse(Buffer.from(j.content, 'base64').toString('utf8')); } catch (e) {} }
      const finalData = ADS[type] ? mergeMonthly(existing, data) : data;
      const content = Buffer.from(JSON.stringify(finalData)).toString('base64');
      put = await fetch(api, {
        method: 'PUT', headers: { ...gh, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `data: ${type} 동기화 (월단위 병합)`, content, sha, branch: 'main' }),
      });
      if (put.ok) {
        const _k = finalData.kpi || (finalData.gems && finalData.gems.kpi) || {};
        return res.status(200).json({ ok: true, type, path, days: _k.days || _k.count || null, merged: !!ADS[type] });
      }
      lastErr = (await put.text()).slice(0, 300);
      if (put.status !== 409) break;            // 409(SHA 충돌)일 때만 최신 SHA로 재시도
      await new Promise(function (r) { setTimeout(r, 500 * (attempt + 1)); });
    }
    return res.status(502).json({ error: 'github commit failed (after retries): ' + lastErr });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
