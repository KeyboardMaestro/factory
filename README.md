# 나와 맞는 사람 찾아보기

Next.js App Router, TypeScript, Supabase PostgreSQL로 만든 모바일 중심의 익명 취향 비교 서비스입니다.

## 로컬 개발

    npm install
    cp .env.example .env.local
    npm run dev

실제 응답 저장을 확인하려면 새 Supabase 프로젝트에 `supabase/migrations/202609240001_initial_schema.sql`, `supabase/migrations/202609240002_custom_tags_and_overlap.sql`을 순서대로 적용하고 서버 전용 SUPABASE_URL, SUPABASE_SECRET_KEY를 설정합니다. 브라우저에서 Supabase 테이블에 직접 접근하지 않습니다.

성격·취미·선호 성격은 기본 선택지와 직접 입력을 합쳐 각각 최대 3개입니다. 직접 입력은 정규화된 `custom:` 값으로 저장하며, 결과의 동성·이성 겹침 인원은 각각 성격 또는 취미가 하나 이상 같은 응답을 셉니다. 해당 성별 참여자가 20명 미만이면 세부 인원은 API와 화면 모두에서 숨깁니다.

## 검증

    npm run lint
    npm run typecheck
    npm run test
    npm run test:e2e
    npm run build

Playwright 테스트는 TEST_STORAGE_DRIVER=memory로 분리된 테스트 저장소를 사용합니다. 이 저장소는 운영 모드에서 거부됩니다. macOS에서는 설치된 Chrome을 사용하고, 다른 환경에서는 Playwright Chromium을 설치해야 할 수 있습니다.

## Vercel 배포 준비

1. Vercel에서 GitHub 저장소를 가져와 Next.js 프로젝트로 연결합니다. 기본 install/build 설정을 사용합니다.
2. 새 Supabase 프로젝트의 SQL Editor에서 두 migration을 파일명 순서대로 한 번씩 적용합니다.
3. Vercel 환경변수에 SUPABASE_URL, SUPABASE_SECRET_KEY, APP_ORIGIN, CRON_SECRET을 설정합니다. APP_ORIGIN은 실제 production 도메인으로 지정합니다.
4. CRON_SECRET은 16자 이상의 무작위 값으로 설정합니다. `vercel.json`이 매일 03:00 UTC(한국 시간 정오)에 만료 응답 정리를 예약합니다.
5. 카카오톡 공유를 쓸 경우 NEXT_PUBLIC_KAKAO_JS_KEY를 설정하고 Kakao Developers에 실제 도메인을 JavaScript SDK 도메인과 웹 도메인으로 등록합니다.
6. SUPABASE_SECRET_KEY는 Vercel 서버 환경에만 넣습니다. NEXT_PUBLIC_ 접두사는 카카오 JavaScript 공개 키에만 사용합니다.

Vercel Cron은 production 배포에서 실행됩니다. Production 배포 전에는 Supabase migration과 환경변수를 먼저 설정해야 합니다.
