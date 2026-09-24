import { expect, request, test, type APIRequestContext, type Page } from "@playwright/test";
import type { PersonalityTag, ResponseInput } from "@/lib/domain";

const baseResponse: ResponseInput = {
  gender: "female", age: 26, appearance_self: 3, body_self: 2, financial_self: 2,
  personality: ["warm"], hobbies: ["music"], appearance_weight: 1, body_weight: 0,
  financial_weight: 0, personality_weight: 1, hobby_weight: 0,
  preferred_personality: ["outgoing"], preferred_age_min: 24, preferred_age_max: 30,
};

async function makeApiContext(baseURL: string): Promise<APIRequestContext> {
  const context = await request.newContext({ baseURL });
  const response = await context.post("/api/session");
  expect(response.ok()).toBeTruthy();
  return context;
}

async function sendResponse(api: APIRequestContext, input: ResponseInput, expectedRevision: number | null = null, submissionId = crypto.randomUUID()) {
  return api.post("/api/responses", {
    data: {
      consent: true,
      consentVersion: "2026-09-24-v1",
      expectedRevision,
      submissionId,
      response: input,
    },
  });
}

async function answerFullTest(page: Page, baseURL: string, gender: "male" | "female", age: number, useAutocomplete = false) {
  await page.goto(baseURL + "/test?mode=new");
  await expect(page.getByRole("heading", { name: "내 취향과 누군가의 취향, 얼마나 겹칠까요?" })).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();

  await page.getByRole("button", { name: gender === "male" ? "남성" : "여성", exact: true }).click();
  await page.getByLabel("현재 만 나이는 몇 살인가요?").fill(String(age));
  await page.getByRole("button", { name: "다음" }).click();

  await page.locator("fieldset").filter({ has: page.getByText("내 외모에 대한 자신감은?") }).getByRole("button", { name: "보통인 편" }).click();
  await page.locator("fieldset").filter({ has: page.getByText("내 체형에 대한 자신감은?") }).getByRole("button", { name: "보통인 편" }).click();
  await page.locator("fieldset").filter({ has: page.getByText("평소 경제적인 여유는?") }).getByRole("button", { name: "일상 지출에 큰 부담이 없는 편" }).click();
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("button", { name: "다정함", exact: true }).click();
  if (useAutocomplete) {
    await page.getByRole("textbox", { name: "내 성격 직접 입력" }).fill("배");
    await page.locator(".tag-suggestions").getByRole("button", { name: /배려심/ }).click();
    await expect(page.getByRole("button", { name: "배려심 선택 해제" })).toBeVisible();

    // Pasted/typed comma-separated values immediately become removable chips.
    await page.getByRole("button", { name: "다정함", exact: true }).click();
    await page.getByRole("textbox", { name: "내 성격 직접 입력" }).fill("진중함, 담백함,");
    await expect(page.getByRole("button", { name: "진중함 선택 해제" })).toBeVisible();
    await expect(page.getByRole("button", { name: "담백함 선택 해제" })).toBeVisible();
    await page.getByRole("button", { name: "진중함 선택 해제" }).click();
    await page.getByRole("button", { name: "담백함 선택 해제" }).click();
    await page.getByRole("button", { name: "배려심 선택 해제" }).click();
    await page.getByRole("button", { name: "다정함", exact: true }).click();
    await page.getByRole("textbox", { name: "내 성격 직접 입력" }).fill("배");
    await page.locator(".tag-suggestions").getByRole("button", { name: /배려심/ }).click();
  }
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "음악", exact: true }).click();
  if (useAutocomplete) {
    await page.getByRole("textbox", { name: "내 취미 직접 입력" }).fill("클라");
    await page.locator(".tag-suggestions").getByRole("button", { name: /클라이밍/ }).click();
    await expect(page.getByRole("button", { name: "클라이밍 선택 해제" })).toBeVisible();
  }
  await page.getByRole("button", { name: "다음" }).click();

  await page.getByRole("button", { name: "외모: 중요함" }).click();
  await page.getByRole("button", { name: "몸매: 상관없음" }).click();
  await page.getByRole("button", { name: "경제적인 여유: 상관없음" }).click();
  await page.getByRole("button", { name: "성격: 상관없음" }).click();
  await page.getByRole("button", { name: "취미 유사성: 상관없음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "범위를 정할게요" }).click();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "동의하고 저장하기" }).click();
}

test("complete, validate, calculate mutual match, revise, and delete a real API-backed flow", async ({ browser, page, baseURL }) => {
  const origin = baseURL!;

  // The questionnaire and save confirmation create a genuine response, even when the opposite cohort is empty.
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /서로 취향이 맞는 이성은/ })).toBeVisible();
  const landingWidth = await page.locator("body").evaluate((body) => body.scrollWidth);
  expect(landingWidth).toBeLessThanOrEqual(320);
  await page.getByRole("link", { name: "내 취향 알아보기" }).click();
  await expect(page.getByRole("heading", { name: "내 취향과 누군가의 취향, 얼마나 겹칠까요?" })).toBeVisible();
  await page.getByRole("button", { name: "시작하기" }).click();
  await page.getByRole("button", { name: "여성", exact: true }).click();
  await page.getByLabel("현재 만 나이는 몇 살인가요?").fill("26");
  await page.getByRole("button", { name: "다음" }).click();
  await page.locator("fieldset").filter({ has: page.getByText("내 외모에 대한 자신감은?") }).getByRole("button", { name: "자신 있는 편" }).click();
  await page.locator("fieldset").filter({ has: page.getByText("내 체형에 대한 자신감은?") }).getByRole("button", { name: "보통인 편" }).click();
  await page.locator("fieldset").filter({ has: page.getByText("평소 경제적인 여유는?") }).getByRole("button", { name: "일상 지출에 큰 부담이 없는 편" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "활발함", exact: true }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "음악", exact: true }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "외모: 중요함" }).click();
  await page.getByRole("button", { name: "몸매: 상관없음" }).click();
  await page.getByRole("button", { name: "경제적인 여유: 상관없음" }).click();
  await page.getByRole("button", { name: "성격: 매우 중요함" }).click();
  await page.getByRole("button", { name: "취미 유사성: 상관없음" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "활발함", exact: true }).click();
  await page.getByRole("button", { name: "다음" }).click();
  await page.getByRole("button", { name: "상관없어요" }).click();
  await page.getByRole("button", { name: "결과 보기" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "동의하고 저장하기" }).click();
  await expect(page.getByRole("heading", { name: "비교할 수 있는 참여자가 아직 없어요." })).toBeVisible();

  // Validate the server rejects malformed input and enforces idempotency and optimistic revision checks.
  const crudApi = await makeApiContext(origin);
  const foreignOrigin = await crudApi.post("/api/responses", {
    headers: { Origin: "https://attacker.invalid" },
    data: { consent: true },
  });
  expect(foreignOrigin.status()).toBe(403);
  const malformed = await crudApi.post("/api/responses", { data: { consent: true } });
  expect(malformed.status()).toBe(422);
  const disposable = { ...baseResponse, gender: "male" as const, personality_weight: 0 as const, preferred_personality: [] as PersonalityTag[] };
  const unsafeTag = await crudApi.post("/api/responses", { data: {
    consent: true, consentVersion: "2026-09-24-v1", expectedRevision: null,
    submissionId: crypto.randomUUID(), response: { ...disposable, personality: ["custom:<script>"] },
  } });
  expect(unsafeTag.status()).toBe(422);
  const firstId = crypto.randomUUID();
  const first = await sendResponse(crudApi, disposable, null, firstId);
  expect(first.status()).toBe(201);
  const replay = await sendResponse(crudApi, disposable, null, firstId);
  expect(replay.status()).toBe(201);
  expect((await replay.json()).revision).toBe(1);
  const conflictingReplay = await sendResponse(crudApi, { ...disposable, age: 29 }, null, firstId);
  expect(conflictingReplay.status()).toBe(409);
  const changed = { ...disposable, age: 28 };
  const update = await sendResponse(crudApi, changed, 1);
  expect(update.status()).toBe(201);
  expect((await update.json()).revision).toBe(2);
  const staleTab = await sendResponse(crudApi, { ...changed, age: 29 }, 1);
  expect(staleTab.status()).toBe(409);
  const lastAllowedUpdate = await sendResponse(crudApi, { ...changed, age: 29 }, 2);
  expect(lastAllowedUpdate.status()).toBe(201);
  const rateLimitedUpdate = await sendResponse(crudApi, { ...changed, age: 30 }, 3);
  expect(rateLimitedUpdate.status()).toBe(429);
  const privateResult = await crudApi.get("/api/result");
  const privatePayload = await privateResult.json();
  expect(privateResult.status()).toBe(200);
  expect(privatePayload).not.toHaveProperty("responses");
  expect(privatePayload).not.toHaveProperty("owner_token_hash");
  const deleted = await crudApi.delete("/api/response");
  expect(deleted.status()).toBe(200);
  const afterDelete = await (await crudApi.get("/api/responses/me")).json();
  expect(afterDelete.response).toBeNull();

  const noSessionApi = await request.newContext({ baseURL: origin });
  expect((await noSessionApi.get("/api/result")).status()).toBe(404);
  expect((await noSessionApi.get("/api/maintenance/cleanup")).status()).toBe(401);
  await noSessionApi.dispose();

  // One opposing participant is below the publication floor: exact P and D stay private.
  const sampleApi = await makeApiContext(origin);
  const sampleMale = { ...disposable, preferred_age_min: null, preferred_age_max: null };
  const smallResult = await sendResponse(sampleApi, sampleMale);
  expect(smallResult.status()).toBe(201);
  const smallPayload = await smallResult.json();
  expect(smallPayload.result.state).toBe("sample_small");
  expect(smallPayload.result.population_count).toBe(1);
  expect(smallPayload.result.preferred_count).toBeNull();
  expect(smallPayload.result.mutual_count).toBeNull();
  expect(smallPayload.result.same_gender_personality_count).toBeNull();
  expect(smallPayload.result.opposite_gender_personality_count).toBeNull();

  // Build a real 20-response female cohort: every entry meets A's condition, only one is reciprocal.
  const candidateApis: APIRequestContext[] = [];
  for (let index = 0; index < 19; index += 1) {
    const candidateApi = await makeApiContext(origin);
    candidateApis.push(candidateApi);
    const candidate = {
      ...baseResponse,
      preferred_personality: index === 0 ? ["warm"] : ["outgoing"],
      personality_weight: index === 0 ? 1 : 2,
    } as ResponseInput;
    const saved = await sendResponse(candidateApi, candidate);
    expect(saved.status()).toBe(201);
  }

  // Add 19 more male responses. Together with sampleMale, this makes the same-gender cohort exactly 20.
  const sameGenderApis: APIRequestContext[] = [];
  for (let index = 0; index < 19; index += 1) {
    const candidateApi = await makeApiContext(origin);
    sameGenderApis.push(candidateApi);
    const candidate: ResponseInput = {
      ...disposable,
      personality: index < 7 ? ["warm"] : ["outgoing"],
      hobbies: index < 10 ? ["music"] : [],
    };
    expect((await sendResponse(candidateApi, candidate)).status()).toBe(201);
  }

  // Complete the whole mobile questionnaire for a male participant; 20 female responses make the result visible.
  const maleContext = await browser.newContext({ viewport: { width: 320, height: 780 } });
  const malePage = await maleContext.newPage();
  await answerFullTest(malePage, origin, "male", 27, true);
  await expect(malePage.getByRole("heading", { name: "서로 취향이 맞는 사람" })).toBeVisible();
  await expect(malePage.locator(".result-number strong")).toHaveText("1");
  await expect(malePage.getByText("현재 참여한 이성 20명 중")).toBeVisible();
  await expect(malePage.getByText("내가 고른 조건에 맞는 사람 20명")).toBeVisible();
  await expect(malePage.locator(".result-rate")).toHaveCount(0);
  const exactCounts = await (await maleContext.request.get("/api/result")).json();
  expect(exactCounts).toMatchObject({
    population_count: 20, preferred_count: 20, mutual_count: 1,
    same_gender_population_count: 20, same_gender_personality_count: 8, same_gender_hobby_count: 11,
    opposite_gender_personality_count: 19, opposite_gender_hobby_count: 20,
  });
  const sameGenderCard = malePage.locator(".overlap-card").first();
  const oppositeGenderCard = malePage.locator(".overlap-card").last();
  await expect(sameGenderCard.locator("dd").first()).toHaveText("8명");
  await expect(sameGenderCard.locator("dd").last()).toHaveText("11명");
  await expect(oppositeGenderCard.locator("dd").first()).toHaveText("19명");
  await expect(oppositeGenderCard.locator("dd").last()).toHaveText("20명");
  const storedMale = await (await maleContext.request.get("/api/responses/me")).json();
  expect(storedMale.response.personality).toEqual(["warm", "custom:배려심"]);
  expect(storedMale.response.hobbies).toEqual(["music", "custom:클라이밍"]);
  const layout = await malePage.locator("body").evaluate((body) => ({ scrollWidth: body.scrollWidth, clientWidth: document.documentElement.clientWidth }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  await malePage.getByRole("button", { name: "친구는 몇 명인지 물어보기" }).click();
  await expect(malePage.getByRole("dialog", { name: "친구에게 물어볼까요?" })).toBeVisible();
  const countToggle = malePage.getByLabel("내 결과 숫자 포함");
  await expect(countToggle).not.toBeChecked();
  await countToggle.check();
  await expect(malePage.getByText(/내 결과는 1명/)).toBeVisible();
  await malePage.keyboard.press("Escape");
  await expect(malePage.getByRole("dialog")).toHaveCount(0);

  // The edit uses the latest revision, preserves fields on back/forward, and deletion removes the owner record.
  await malePage.getByRole("link", { name: "응답 수정" }).click();
  await expect(malePage.getByRole("heading", { name: "먼저, 나에 대해 알려주세요." })).toBeVisible();
  for (let index = 0; index < 5; index += 1) {
    await malePage.getByRole("button", { name: "다음" }).click();
  }
  await malePage.getByRole("button", { name: "결과 보기" }).click();
  await expect(malePage.getByRole("heading", { name: "서로 취향이 맞는 사람" })).toBeVisible();
  const afterEdit = await (await maleContext.request.get("/api/responses/me")).json();
  expect(afterEdit.response.personality).toEqual(["warm", "custom:배려심"]);
  expect(afterEdit.response.hobbies).toEqual(["music", "custom:클라이밍"]);
  malePage.once("dialog", (dialog) => dialog.accept());
  await malePage.getByRole("button", { name: "내 응답 삭제" }).click();
  await expect(malePage.getByRole("heading", { name: "아직 저장된 결과가 없어요." })).toBeVisible();

  await crudApi.dispose();
  await sampleApi.dispose();
  await Promise.all(candidateApis.map((api) => api.dispose()));
  await Promise.all(sameGenderApis.map((api) => api.dispose()));
  await maleContext.close();
});
