# ACNow 파트너 웹 (`acnow-partner`)

기사·운영이 **일감·예약·자재·정산**을 보는 Vite React 앱입니다. API는 **`airconeCallServer`** Nest 백엔드와 통신합니다.

## 필수 환경 변수 (프로덕션)

| 변수 | 설명 |
|------|------|
| **`VITE_API_BASE_URL`** | Nest API의 **origin만** (예: `https://api.example.com`). **`/api` 붙이지 않음.** 빌드 시 주입되므로 Vercel에서 저장 후 **재배포** 필요. |

로컬 `npm run dev`에서는 설정이 없을 때 개발 기본값으로 `http://127.0.0.1:4000` 근처로 붙도록 되어 있습니다. 상세는 [`.env.example`](.env.example) 참고.

## 로그인 방식

- `POST /api/auth/session` (통합 세션) — `src/App.tsx` `publicApi('/auth/session', …)`  
- 성공 후 `x-technician-id` 헤더로 technician API 호출.  
- 관리자 계정(역할 플래그)은 **승인된 기사 목록 미리보기** 모드로 동작할 수 있음.

서버 측 `AdminService.unifiedSession`은 Supabase가 있으면 회원/판매자 조회 후, **인메모리 승인 기사** 자격도 시도합니다.

## Vercel 배포

1. Root Directory: `acnow-partner` (모노레포인 경우).  
2. Build: `npm run build`, Output: `dist`.  
3. Environment Variables에 `VITE_API_BASE_URL` 설정 후 **Redeploy**.  
4. API 서버 `CORS_ORIGIN`에 이 앱의 **정확한 origin** 포함 (예: `https://acnow-partner.vercel.app`, 커스텀 도메인 추가).

## 관련 문서

- 모노레포 전체: [../README.md](../README.md)  
- 운영·플로우 통합: [../doc/OPERATIONS.md](../doc/OPERATIONS.md)  
- API·CORS·SQL: [../airconeCallServer/README.md](../airconeCallServer/README.md)

## 스크립트

```bash
npm install
npm run dev      # :5174, Vite 프록시 /api → .env 의 프록시 대상
npm run build
npm run preview  # :4174
```
