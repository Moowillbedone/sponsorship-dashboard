# 후원하기 대시보드 · Gem Analytics

라이브 커머스 **후원하기(젬)** 기능의 유저·그리퍼·결제 활동을 한눈에 보는 대시보드.
`admin2.grip.show` 데이터를 집계하여 시각화한다. (디자인 참고: raoni.xyz)

## 화면 구성

| 탭 | 내용 |
|---|---|
| **유저 젬** | 적립/사용/만료/회수 흐름, 유형·경로 분포, 시간대 활동, Top 적립·사용 유저 |
| **그리퍼 젬** | 후원 추이, 상태 분포, 금액대 분포, Top 그리퍼·후원 유저 |
| **젬 결제** | 매출 추이, 스토어별 매출, 번들별 판매, Top 결제 유저 |

## 데이터 구조

- `data/snapshot.json` — 집계 스냅샷 (대시보드가 읽는 단일 데이터 파일)
- 원본(raw)은 보관하지 않으며, 갱신 시 어드민에서 전체를 다시 수집해 집계한다.

### 데이터 출처 (admin-api.grip.show)
- 유저 젬: `GET /gems`
- 그리퍼 젬: `GET /sponsorships/list`
- 젬 결제: `GET /gem-purchases/list`
- 인증: 어드민 로그인 쿠키 `grip.admin.sessiona` (Bearer JWT)

## 데이터 갱신 방법 (반자동)

> 어드민 API는 사내 인증을 요구하므로, **어드민에 로그인한 브라우저에서** 수집한다.

1. `admin2.grip.show` 에 로그인
2. **F12 → Console** 탭 열기
3. `collect.js` 파일 내용 전체를 콘솔에 붙여넣고 Enter
   - (콘솔이 붙여넣기를 막으면 `allow pasting` 입력 후 다시 시도)
4. 우측 상단 진행창이 끝나면 `gem-snapshot.json` 자동 다운로드
5. 다운로드 파일을 이 레포의 `data/snapshot.json` 으로 교체
6. `git add . && git commit -m "data: refresh snapshot" && git push`
   → Vercel 이 자동 재배포 (1~2분 내 최신 데이터 반영)

소요 시간: 약 2~3분 (그리퍼젬 API가 느려 병렬 수집으로 처리).

## 로컬 실행

```bash
cd sponsorship-dashboard
python3 -m http.server 4173
# http://localhost:4173
```

## 배포

- Vercel (정적) + GitHub private 레포
- 민감 데이터 포함 → `noindex` / `no-referrer` 헤더, 비공개 운영

## 기술 스택

순수 HTML/CSS/Vanilla JS + [Chart.js](https://www.chartjs.org/) (CDN) + Pretendard. 빌드 불필요.
