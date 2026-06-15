# Render Manseryeok API

## 목적
Apps Script의 근사 사주 계산을 대체하기 위해 Render에서 Node.js 기반 만세력 API를 실행합니다.

## 배포
1. GitHub에 이 폴더(`render-manseryeok-api`)를 업로드합니다.
2. Render에서 New > Web Service를 생성합니다.
3. Root Directory를 `render-manseryeok-api`로 지정합니다.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. 배포 후 `/health` 접속으로 상태를 확인합니다.

## Apps Script Script Properties
- `MANSERYEOK_API_ENABLED=true`
- `MANSERYEOK_API_BASE_URL=https://<your-service>.onrender.com`

선택값:
- `MANSERYEOK_DAY_BOUNDARY=midnight` 또는 `jasi`, `splitJasi`
- `MANSERYEOK_TRUE_SOLAR_TIME=true`
- `MANSERYEOK_EQUATION_OF_TIME=true`
- `MANSERYEOK_HISTORICAL_DST=true`

## Endpoint
POST `/api/v1/manseryeok/bazi`

```json
{
  "name": "최영민",
  "gender": "남자",
  "birthDate": "1988-05-07",
  "birthTime": "10:30",
  "calendarType": "lunar",
  "leapMonth": "normal",
  "location": { "city": "울산", "longitude": 129.3114, "latitude": 35.5395, "timezone": "Asia/Seoul" },
  "options": { "dayBoundary": "midnight", "applyTrueSolarTime": true }
}
```
