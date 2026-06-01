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
  if (!path) return res.status(400).json({ error: 'invalid type (gems|sdk|ssp|coupang)' });
  if (!data || typeof data !== 'object') return res.status(400).json({ error: 'invalid data' });
  const valid = type === 'gems' ? (data.gems && data.spons && data.purch) : (data.kpi && data.daily);
  if (!valid) return res.status(400).json({ error: 'data shape mismatch for type ' + type });

  const api = `https://api.github.com/repos/${REPO}/contents/${path}`;
  const gh = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sponsorship-sync' };
  try {
    let sha;
    const cur = await fetch(api + '?ref=main', { headers: gh });
    if (cur.ok) sha = (await cur.json()).sha;
    const content = Buffer.from(JSON.stringify(data)).toString('base64');
    const put = await fetch(api, {
      method: 'PUT', headers: { ...gh, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `data: ${type} 자동 동기화 (북마클릿)`, content, sha, branch: 'main' }),
    });
    if (!put.ok) return res.status(502).json({ error: 'github commit failed: ' + (await put.text()).slice(0, 300) });
    return res.status(200).json({ ok: true, type, path, days: data.kpi.days || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
