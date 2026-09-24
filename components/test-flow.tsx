"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CONSENT_VERSION, HOBBY_TAGS, PERSONALITY_TAGS, type ResponseInput } from "@/lib/domain";
import { getFlowStartedAt, trackEvent } from "@/lib/client/analytics";
import { HOBBY_LABELS, HOBBY_SUGGESTIONS, PERSONALITY_LABELS, PERSONALITY_SUGGESTIONS } from "@/lib/tags";
import { responseSchema } from "@/lib/validation";
import { TagPicker } from "@/components/tag-picker";

type StartMode = "default" | "edit" | "new";
type Form = Partial<ResponseInput>;

const EMPTY_FORM: Form = { personality: [], preferred_personality: [] };
const IMPORTANCE_LABELS = ["상관없음", "중요함", "매우 중요함"] as const;
const SELF_LABELS = ["자신감이 적은 편", "보통인 편", "자신 있는 편"] as const;
const IMPORTANCE_ROWS = [
  ["appearance_weight", "외모"],
  ["body_weight", "몸매"],
  ["financial_weight", "경제적인 여유"],
  ["personality_weight", "성격"],
  ["hobby_weight", "취미 유사성"],
] as const;

function ChoiceButton({ selected, children, onClick, className = "" }: { selected: boolean; children: ReactNode; onClick: () => void; className?: string }) {
  return <button type="button" className={`choice-button${selected ? " is-selected" : ""} ${className}`} aria-pressed={selected} onClick={onClick}>{children}</button>;
}

function isAgeValid(form: Form): boolean {
  if (form.preferred_age_min === null && form.preferred_age_max === null) return true;
  return typeof form.preferred_age_min === "number" && typeof form.preferred_age_max === "number"
    && form.preferred_age_min >= 19 && form.preferred_age_max <= 99 && form.preferred_age_min <= form.preferred_age_max;
}

export function TestFlow({ startMode }: { startMode: StartMode }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentPrompt, setConsentPrompt] = useState(false);
  const [existing, setExisting] = useState<{ response: ResponseInput; revision: number } | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [ageDraft, setAgeDraft] = useState({ min: "", max: "" });
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const consentDialog = useRef<HTMLDialogElement>(null);

  const steps = useMemo(() => form.personality_weight === 0 ? [0, 1, 2, 3, 4, 6] : [0, 1, 2, 3, 4, 5, 6], [form.personality_weight]);
  const visibleStep = steps.includes(step) ? step : steps[Math.min(steps.length - 1, 4)];

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const storedDraft = sessionStorage.getItem("ti:draft");
        let draft: Form | null = null;
        if (storedDraft) {
          const parsed = JSON.parse(storedDraft) as { at?: number; form?: Form; revision?: number | null };
          if (parsed.at && Date.now() - parsed.at < 24 * 60 * 60 * 1000 && parsed.form) draft = parsed.form;
          else sessionStorage.removeItem("ti:draft");
        }
        const session = await fetch("/api/session", { method: "POST", cache: "no-store" });
        if (!session.ok) throw new Error("서비스 연결을 준비하고 있어요. 잠시 후 다시 시도해주세요.");
        const responseRequest = await fetch("/api/responses/me", { cache: "no-store" });
        if (!responseRequest.ok) throw new Error("응답을 확인하지 못했어요. 다시 시도해주세요.");
        const responseData = await responseRequest.json() as { response?: ResponseInput | null; revision?: number };
        if (cancelled) return;
        const saved = responseData.response && typeof responseData.revision === "number"
          ? { response: responseData.response, revision: responseData.revision }
          : null;
        if (saved && startMode === "default") {
          setExisting(saved);
        } else if (saved) {
          const nextForm = startMode === "edit" ? saved.response : EMPTY_FORM;
          setForm(nextForm);
          setRevision(saved.revision);
          setConsent(true);
          setAgeDraft({
            min: typeof nextForm.preferred_age_min === "number" ? String(nextForm.preferred_age_min) : "",
            max: typeof nextForm.preferred_age_max === "number" ? String(nextForm.preferred_age_max) : "",
          });
          setActive(true);
        } else {
          setForm(startMode === "new" ? EMPTY_FORM : draft ?? EMPTY_FORM);
          setRevision(null);
          setConsent(false);
          setActive(false);
        }
      } catch (cause) {
        if (!cancelled) setSessionError(cause instanceof Error ? cause.message : "서비스 연결을 확인해주세요.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [startMode]);

  useEffect(() => {
    if (!active) return;
    try { sessionStorage.setItem("ti:draft", JSON.stringify({ at: Date.now(), form, revision })); }
    catch { /* The in-memory flow remains usable when storage is disabled. */ }
  }, [active, form, revision]);

  useEffect(() => { if (active) questionHeading.current?.focus({ preventScroll: true }); }, [visibleStep, active]);

  useEffect(() => {
    const dialog = consentDialog.current;
    if (!dialog) return;
    if (consentPrompt && !dialog.open) dialog.showModal();
    else if (!consentPrompt && dialog.open) dialog.close();
  }, [consentPrompt]);

  const setValue = useCallback(<K extends keyof ResponseInput>(key: K, value: ResponseInput[K]) => {
    setForm((old) => ({ ...old, [key]: value }));
    setError("");
  }, []);

  function startFresh() {
    const hasPriorConsent = existing !== null;
    setExisting(null);
    setForm(EMPTY_FORM);
    setRevision(existing?.revision ?? null);
    setActive(true);
    setConsent(hasPriorConsent);
    setStep(0);
    setError("");
    try { sessionStorage.removeItem("ti:draft"); } catch { /* Optional storage. */ }
  }

  function editSaved() {
    if (!existing) return;
    setForm(existing.response);
    setRevision(existing.revision);
    setAgeDraft({
      min: typeof existing.response.preferred_age_min === "number" ? String(existing.response.preferred_age_min) : "",
      max: typeof existing.response.preferred_age_max === "number" ? String(existing.response.preferred_age_max) : "",
    });
    setExisting(null);
    setActive(true);
    setConsent(true);
    setStep(0);
  }

  const validateStep = (current: number): string | null => {
    if (current === 0 && (!form.gender || !Number.isInteger(form.age) || form.age! < 19 || form.age! > 99)) return "성별과 만 나이를 확인해주세요.";
    if (current === 1 && (![form.appearance_self, form.body_self, form.financial_self].every((value) => [1, 2, 3].includes(value ?? -1)))) return "세 항목을 모두 선택해주세요.";
    if (current === 2 && (!form.personality || form.personality.length < 1 || form.personality.length > 3)) return "성격을 1~3개 골라주세요.";
    if (current === 3 && (!Array.isArray(form.hobbies) || form.hobbies.length > 3)) return "취미는 최대 3개까지 고를 수 있어요.";
    if (current === 4 && IMPORTANCE_ROWS.some(([field]) => typeof form[field] !== "number")) return "각 항목의 중요도를 골라주세요.";
    if (current === 5 && form.personality_weight !== 0 && (!form.preferred_personality || form.preferred_personality.length < 1 || form.preferred_personality.length > 3)) return "원하는 성격을 1~3개 골라주세요.";
    if (current === 6 && !isAgeValid(form)) return "나이 범위를 다시 확인해주세요.";
    return null;
  };

  function goNext() {
    const message = validateStep(visibleStep);
    if (message) { setError(message); return; }
    setError("");
    const index = steps.indexOf(visibleStep);
    const next = steps[index + 1];
    if (next === undefined) { void submit(); return; }
    trackEvent({ name: "question_progress", stepId: activeStepIndex + 1 });
    setStep(next);
  }

  function goBack() {
    const index = steps.indexOf(visibleStep);
    if (index <= 0) return;
    setError("");
    setStep(steps[index - 1]);
  }

  async function persistResponse(responseInput: ResponseInput) {
    setSaving(true);
    setError("");
    const elapsed = Date.now() - getFlowStartedAt();
    const durationBucket = elapsed < 30_000 ? "under_30s" : elapsed <= 60_000 ? "30_60s" : "over_60s";
    try {
      const response = await fetch("/api/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          consent: true,
          consentVersion: CONSENT_VERSION,
          expectedRevision: revision,
          submissionId: crypto.randomUUID(),
          response: responseInput,
        }),
      });
      const payload = await response.json() as { error?: string; revision?: number; saved?: boolean; resultPending?: boolean };
      if (!response.ok && response.status !== 202) {
        if (response.status === 409) {
          const latest = await fetch("/api/responses/me", { cache: "no-store" }).then((item) => item.json()) as { response?: ResponseInput | null; revision?: number };
          if (latest.response && latest.revision) setExisting({ response: latest.response, revision: latest.revision });
        }
        throw new Error(payload.error ?? "응답을 저장하지 못했어요. 다시 시도해주세요.");
      }
      try { sessionStorage.removeItem("ti:draft"); } catch { /* Optional storage. */ }
      trackEvent({ name: "test_complete", durationBucket });
      router.push("/result");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "연결을 확인하고 다시 시도해주세요.");
      trackEvent({ name: "submit_error", errorCode: "network" });
    } finally {
      setSaving(false);
    }
  }

  function submit() {
    const parsed = responseSchema.safeParse(form);
    if (!parsed.success) { setError("응답을 다시 확인해주세요. 비어 있는 항목이 있는지 살펴봐주세요."); return; }
    if (!consent) { setConsentPrompt(true); return; }
    void persistResponse(parsed.data);
  }

  function confirmSave() {
    const parsed = responseSchema.safeParse(form);
    if (!parsed.success) {
      setConsentPrompt(false);
      setError("응답을 다시 확인해주세요. 비어 있는 항목이 있는지 살펴봐주세요.");
      return;
    }
    setConsent(true);
    setConsentPrompt(false);
    void persistResponse(parsed.data);
  }

  async function reloadLatest() {
    try {
      const latestResponse = await fetch("/api/responses/me", { cache: "no-store" });
      const latest = await latestResponse.json() as { response?: ResponseInput | null; revision?: number };
      if (!latest.response || !latest.revision) {
        setError("최신 응답이 없어요. 새 테스트를 시작해주세요.");
        return;
      }
      setForm(latest.response);
      setRevision(latest.revision);
      setAgeDraft({
        min: typeof latest.response.preferred_age_min === "number" ? String(latest.response.preferred_age_min) : "",
        max: typeof latest.response.preferred_age_max === "number" ? String(latest.response.preferred_age_max) : "",
      });
      setExisting(null);
      setActive(true);
      setConsent(false);
      setStep(0);
      setError("");
    } catch {
      setError("최신 응답을 불러오지 못했어요. 다시 시도해주세요.");
    }
  }

  const activeStepIndex = steps.indexOf(visibleStep);

  return (
    <main className="test-shell">
      <header className="flow-header">
        <Link className="brand" href="/" aria-label="홈으로"><span className="brand-mark" aria-hidden="true" />나와 맞는 사람 찾아보기</Link>
        {active && <span className="step-count">{activeStepIndex + 1} <span>/</span> {steps.length}</span>}
      </header>
      {!ready ? <section className="flow-status" role="status" aria-live="polite"><span className="loading-mark" />테스트를 준비하고 있어요…</section>
        : sessionError ? <section className="flow-status error-panel" role="alert"><p>{sessionError}</p><button className="button button-secondary" onClick={() => window.location.reload()}>다시 시도</button></section>
          : existing ? (
            <section className="welcome-card" aria-labelledby="saved-title">
              <p className="eyebrow">이 브라우저의 참여 기록</p>
              <h1 id="saved-title">저장된 응답이 있어요.</h1>
              <p>이전 결과를 다시 보거나 응답을 수정할 수 있어요. 새로 참여하면 기존 응답을 업데이트합니다.</p>
              <div className="welcome-actions">
                <button className="button button-primary" onClick={() => router.push("/result")}>이전 결과 보기</button>
                <button className="button button-secondary" onClick={editSaved}>응답 수정</button>
                <button className="text-button" onClick={startFresh}>새 응답 시작</button>
              </div>
            </section>
          ) : !active ? (
            <section className="welcome-card" aria-labelledby="welcome-title">
              <p className="eyebrow"><span className="eyebrow-dot" /> 약 1분이면 끝나요</p>
              <h1 id="welcome-title">내 취향과 누군가의 취향,<br />얼마나 겹칠까요?</h1>
              {error && <p className="inline-error" role="alert">{error}</p>}
              <button className="button button-primary welcome-cta" onClick={() => {
                setActive(true); setStep(0); getFlowStartedAt();
                trackEvent({ name: "test_start", isRepeat: revision !== null });
              }}>시작하기 <span aria-hidden="true">→</span></button>
            </section>
          ) : (
            <section className="question-card" aria-labelledby="question-title">
              <div className="progress-track" role="progressbar" aria-label="테스트 진행" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={activeStepIndex + 1}>
                <span style={{ transform: `scaleX(${(activeStepIndex + 1) / steps.length})` }} />
              </div>
              <p className="question-step">질문 {activeStepIndex + 1}</p>
              {visibleStep === 0 && <>
                <h1 id="question-title" ref={questionHeading} tabIndex={-1}>먼저, 나에 대해 알려주세요.</h1>
                <p className="question-description">현재 만 19세 이상 남성과 여성 간 비교를 제공해요.</p>
                <fieldset className="question-group"><legend>이번 테스트에서 비교할 나의 성별</legend><div className="choice-grid choice-grid-two">
                  {([ ["male", "남성"], ["female", "여성"] ] as const).map(([value, label]) => <ChoiceButton key={value} selected={form.gender === value} onClick={() => setValue("gender", value)}>{label}</ChoiceButton>)}
                </div></fieldset>
                <label className="field-label" htmlFor="age">현재 만 나이는 몇 살인가요?</label>
                <div className="number-suffix"><input id="age" inputMode="numeric" type="number" min={19} max={99} value={form.age ?? ""} onChange={(event) => setValue("age", event.target.value === "" ? undefined as never : Number(event.target.value) as ResponseInput["age"])} placeholder="만 나이" /><span>세</span></div>
              </>}
              {visibleStep === 1 && <>
                <h1 id="question-title" ref={questionHeading} tabIndex={-1}>내가 느끼는 나는<br />어떤 편인가요?</h1>
                <p className="question-description">다른 사람의 평가보다, 평소 내가 느끼는 쪽을 골라주세요.</p>
                <SelfRating label="내 외모에 대한 자신감은?" value={form.appearance_self} onChange={(value) => setValue("appearance_self", value)} />
                <SelfRating label="내 체형에 대한 자신감은?" value={form.body_self} onChange={(value) => setValue("body_self", value)} />
                <SelfRating label="평소 경제적인 여유는?" value={form.financial_self} labels={["지출을 신중히 계획하는 편", "일상 지출에 큰 부담이 없는 편", "취미·여가에도 여유가 있는 편"]} onChange={(value) => setValue("financial_self", value)} />
              </>}
              {visibleStep === 2 && <>
                <h1 id="question-title" ref={questionHeading} tabIndex={-1}>나를 잘 설명하는<br />성격을 골라주세요.</h1>
                <p className="question-description">최대 3개 · 가장 나다운 것부터 골라주세요.</p>
                <TagPicker inputId="self-personality" inputLabel="내 성격 직접 입력" placeholder="예: 배려심"
                  values={PERSONALITY_TAGS} labels={PERSONALITY_LABELS} suggested={PERSONALITY_SUGGESTIONS}
                  selected={form.personality ?? []} onSelectionChange={(next) => setValue("personality", next)} onError={setError} />
              </>}
              {visibleStep === 3 && <>
                <h1 id="question-title" ref={questionHeading} tabIndex={-1}>쉬는 날, 주로 무엇을<br />즐기나요?</h1>
                <p className="question-description">나중에 상대와 취미가 겹치는지 비교해요. 최대 3개.</p>
                <TagPicker inputId="self-hobbies" inputLabel="내 취미 직접 입력" placeholder="예: 클라이밍"
                  values={HOBBY_TAGS} labels={HOBBY_LABELS} suggested={HOBBY_SUGGESTIONS}
                  selected={form.hobbies ?? []} onSelectionChange={(next) => {
                    setForm((old) => ({ ...old, hobbies: next, ...(next.length > 0 ? {} : { hobby_weight: 0 as const }) }));
                    setError("");
                  }} onError={setError} />
                <button type="button" className={`none-choice${Array.isArray(form.hobbies) && form.hobbies.length === 0 ? " is-active" : ""}`} aria-pressed={Array.isArray(form.hobbies) && form.hobbies.length === 0} onClick={() => { setForm((old) => ({ ...old, hobbies: [], hobby_weight: 0 })); setError(""); }}>선택할 취미가 없어요</button>
              </>}
              {visibleStep === 4 && <>
                <h1 id="question-title" ref={questionHeading} tabIndex={-1}>상대를 볼 때,<br />무엇이 얼마나 중요한가요?</h1>
                <p className="question-description">‘매우 중요함’은 ‘중요함’의 두 배 비중으로 반영돼요.</p>
                <div className="importance-table"><div className="importance-header"><span>항목</span><span>상관없음</span><span>중요함</span><span>매우<br />중요함</span></div>
                  {IMPORTANCE_ROWS.map(([field, label]) => {
                    const disabled = field === "hobby_weight" && !form.hobbies?.length;
                    return <div className={`importance-row${disabled ? " is-disabled" : ""}`} key={field}>
                      <span className="importance-label">{label}</span>
                      {IMPORTANCE_LABELS.map((choice, index) => <button key={choice} type="button" className={`importance-option${form[field] === index ? " selected" : ""}`} aria-label={`${label}: ${choice}`} aria-pressed={form[field] === index} disabled={disabled} onClick={() => setValue(field, index as 0 | 1 | 2)}><span className="importance-option-mobile">{choice}</span>{form[field] === index && <span className="sr-only">선택됨</span>}</button>)}
                    </div>;
                  })}
                </div>
              </>}
              {visibleStep === 5 && <>
                <h1 id="question-title" ref={questionHeading} tabIndex={-1}>어떤 성격의 상대에게<br />끌리나요?</h1>
                <p className="question-description">고른 특징을 각각 선호하는 것으로 비교해요. 최대 3개.</p>
                <TagPicker inputId="preferred-personality" inputLabel="원하는 성격 직접 입력" placeholder="예: 공감"
                  values={PERSONALITY_TAGS} labels={PERSONALITY_LABELS} suggested={PERSONALITY_SUGGESTIONS}
                  selected={form.preferred_personality ?? []} onSelectionChange={(next) => setValue("preferred_personality", next)} onError={setError} />
                <button type="button" className="none-choice" onClick={() => {
                  setForm((old) => ({ ...old, preferred_personality: [], personality_weight: 0 }));
                  setStep(6);
                  setError("");
                }}>특정 성격은 상관없어요</button>
              </>}
              {visibleStep === 6 && <>
                <h1 id="question-title" ref={questionHeading} tabIndex={-1}>상대의 나이는<br />어느 정도가 좋나요?</h1>
                <p className="question-description">원하는 범위의 양 끝 나이를 포함해서 비교해요.</p>
                <div className="age-preference-options">
                  <ChoiceButton selected={form.preferred_age_min === null && form.preferred_age_max === null} onClick={() => {
                    setForm((old) => ({ ...old, preferred_age_min: null, preferred_age_max: null })); setAgeDraft({ min: "", max: "" }); setError("");
                  }}>상관없어요</ChoiceButton>
                  <ChoiceButton selected={form.preferred_age_min !== null && form.preferred_age_max !== null} onClick={() => {
                    if (typeof form.age !== "number") return;
                    const min = Math.max(19, form.age - 3); const max = Math.min(99, form.age + 3);
                    setForm((old) => ({ ...old, preferred_age_min: min, preferred_age_max: max })); setAgeDraft({ min: String(min), max: String(max) }); setError("");
                  }}>범위를 정할게요</ChoiceButton>
                </div>
                {form.preferred_age_min !== null && form.preferred_age_max !== null && <div className="age-range-fields">
                  <label className="field-label" htmlFor="age-min">만 나이 범위</label>
                  <div className="range-inputs">
                    <div className="number-suffix"><input id="age-min" inputMode="numeric" type="number" min={19} max={99} value={ageDraft.min} onChange={(event) => {
                      const min = event.target.value; setAgeDraft((old) => ({ ...old, min }));
                      setForm((old) => ({ ...old, preferred_age_min: min === "" ? undefined as never : Number(min) })); setError("");
                    }} /><span>세</span></div>
                    <span className="range-separator">부터</span>
                    <div className="number-suffix"><input id="age-max" inputMode="numeric" type="number" min={19} max={99} value={ageDraft.max} onChange={(event) => {
                      const max = event.target.value; setAgeDraft((old) => ({ ...old, max }));
                      setForm((old) => ({ ...old, preferred_age_max: max === "" ? undefined as never : Number(max) })); setError("");
                    }} /><span>세</span></div>
                  </div>
                </div>}
              </>}
              {error && <p className="inline-error" role="alert">{error}</p>}
              {existing && <div className="conflict-notice" role="status"><span>다른 탭에서 응답이 바뀌었어요.</span><button className="text-button" onClick={() => void reloadLatest()}>최신 응답 불러오기</button></div>}
              <div className="question-actions">
                <button type="button" className="button button-secondary back-button" onClick={goBack} disabled={activeStepIndex === 0 || saving}><span aria-hidden="true">←</span> 이전</button>
                <button type="button" className="button button-primary next-button" onClick={goNext} disabled={saving}>{saving ? <><span className="button-spinner" /> 저장 중</> : visibleStep === steps.at(-1) ? "결과 보기" : <>다음 <span aria-hidden="true">→</span></>}</button>
              </div>
              {visibleStep === steps.at(-1) && <p className="submit-note">선택한 응답을 최근 참여자와 비교해요. 이름이나 연락처는 공개하지 않아요.</p>}
            </section>
          )}
      <dialog
        ref={consentDialog}
        className="consent-dialog"
        aria-labelledby="save-consent-title"
        onCancel={(event) => { event.preventDefault(); setConsentPrompt(false); }}
        onClose={() => setConsentPrompt(false)}
      >
        <div className="consent-dialog-content">
          <p className="eyebrow"><span className="eyebrow-dot" /> 저장 안내</p>
          <h2 id="save-consent-title">응답을 저장할까요?</h2>
          <p>입력한 응답은 익명으로 저장되어 전체 취향 집계에 반영돼요. 저장한 응답은 나중에 수정하거나 삭제할 수 있어요.</p>
          <div className="consent-dialog-actions">
            <button type="button" className="button button-secondary" onClick={() => setConsentPrompt(false)}>돌아가기</button>
            <button type="button" className="button button-primary" disabled={saving} onClick={confirmSave}>{saving ? "저장 중…" : "동의하고 저장하기"}</button>
          </div>
        </div>
      </dialog>
      <footer className="flow-footer"><span>입력은 언제든 수정하거나 삭제할 수 있어요.</span></footer>
    </main>
  );
}

function SelfRating({ label, labels = SELF_LABELS, value, onChange }: { label: string; labels?: readonly string[]; value: 1 | 2 | 3 | undefined; onChange: (value: 1 | 2 | 3) => void }) {
  return <fieldset className="self-rating"><legend>{label}</legend><div className="self-rating-options">{labels.map((choice, index) => <ChoiceButton key={choice} className="self-rating-option" selected={value === index + 1} onClick={() => onChange((index + 1) as 1 | 2 | 3)}>{choice}</ChoiceButton>)}</div></fieldset>;
}
