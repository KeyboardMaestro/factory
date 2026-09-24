"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MIN_SAMPLE_SIZE, type PublicResult, type ResponseInput } from "@/lib/domain";
import { trackEvent } from "@/lib/client/analytics";
import { SharePanel } from "@/components/share-panel";

type PageState = "loading" | "ready" | "missing" | "error";
const LABELS: Record<string, string> = {
  appearance_weight: "외모", body_weight: "몸매", financial_weight: "경제적인 여유",
  personality_weight: "성격", hobby_weight: "취미 유사성",
};

export function ResultView() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [result, setResult] = useState<PublicResult | null>(null);
  const [response, setResponse] = useState<ResponseInput | null>(null);
  const [error, setError] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const load = useCallback(async (method: "GET" | "POST" = "GET") => {
    setPageState("loading");
    setError("");
    try {
      const [resultResponse, ownResponse] = await Promise.all([
        fetch("/api/result", { method, cache: "no-store" }),
        fetch("/api/responses/me", { cache: "no-store" }),
      ]);
      if (resultResponse.status === 404) { setPageState("missing"); return; }
      const resultData = await resultResponse.json() as PublicResult & { error?: string };
      if (!resultResponse.ok) throw new Error(resultData.error ?? "결과를 불러오지 못했어요.");
      const ownData = await ownResponse.json() as { response?: ResponseInput | null };
      setResult(resultData);
      setResponse(ownData.response ?? null);
      setPageState("ready");
      trackEvent({ name: "result_view", resultState: resultData.state });
    } catch (cause) {
      setPageState("error");
      setError(cause instanceof Error ? cause.message : "결과를 불러오지 못했어요.");
      trackEvent({ name: "result_error", errorCode: "network" });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function refreshResult() {
    setRefreshing(true);
    setError("");
    try {
      const response = await fetch("/api/result", { method: "POST", cache: "no-store" });
      const payload = await response.json() as PublicResult & { error?: string };
      if (response.status === 404) {
        setPageState("missing");
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "새 결과를 계산하지 못했어요.");
      setResult(payload);
      trackEvent({ name: "result_view", resultState: payload.state });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "새 결과를 계산하지 못했어요.");
    } finally { setRefreshing(false); }
  }

  async function deleteResponse() {
    if (!window.confirm("저장된 응답과 결과를 삭제할까요? 삭제 후에는 복구할 수 없어요.")) return;
    setDeleting(true);
    try {
      const response = await fetch("/api/response", { method: "DELETE", cache: "no-store" });
      if (!response.ok) throw new Error("응답을 삭제하지 못했어요. 다시 시도해주세요.");
      try { sessionStorage.removeItem("ti:draft"); } catch { /* Optional storage. */ }
      setDeleted(true);
      setPageState("missing");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "응답을 삭제하지 못했어요.");
    } finally { setDeleting(false); }
  }

  const preferredLabels = response
    ? Object.entries({
      appearance_weight: response.appearance_weight, body_weight: response.body_weight,
      financial_weight: response.financial_weight, personality_weight: response.personality_weight,
      hobby_weight: response.hobby_weight,
    }).filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([key]) => LABELS[key])
    : [];

  return (
    <main className="result-shell">
      <header className="flow-header">
        <Link className="brand" href="/" aria-label="홈으로"><span className="brand-mark" aria-hidden="true" />나와 맞는 사람 찾아보기</Link>
      </header>
      {pageState === "loading" && <section className="result-state" role="status" aria-live="polite"><span className="loading-mark" />결과를 계산하고 있어요…</section>}
      {pageState === "missing" && <section className="result-state result-empty" aria-labelledby="missing-title">
        <div className="result-symbol" aria-hidden="true">↗</div>
        <h1 id="missing-title">아직 저장된 결과가 없어요.</h1>
        <p>{deleted ? "응답과 연결된 결과를 삭제했어요." : "먼저 취향을 입력하면 실제 참여자와 비교해 볼 수 있어요."}</p>
        <Link className="button button-primary" href="/test?mode=new">취향 테스트 시작하기</Link>
      </section>}
      {pageState === "error" && <section className="result-state result-empty" role="alert">
        <div className="result-symbol result-symbol-warn" aria-hidden="true">!</div>
        <h1>결과를 불러오지 못했어요.</h1><p>{error}</p>
        <button className="button button-primary" onClick={() => void load()}>다시 시도</button>
      </section>}
      {pageState === "ready" && result && <>
        <section className="result-content" aria-labelledby="result-heading">
          <p className="eyebrow"><span className="eyebrow-dot" /> 실제 참여 응답으로 계산했어요</p>
          {result.state === "empty" ? <>
            <h1 id="result-heading" className="result-heading">비교할 수 있는 참여자가<br />아직 없어요.</h1>
            <p className="result-description">내 응답은 저장됐어요. 참여자가 생기면 다시 계산할 수 있어요.</p>
            <div className="count-panel count-panel-empty"><span>현재 비교 가능한 이성 참여자</span><strong>0명</strong></div>
          </> : result.state === "sample_small" ? <>
            <h1 id="result-heading" className="result-heading">참여자가 모이는 중이에요.</h1>
            <p className="result-description">아직은 표본이 적어 서로 맞는 사람 수를 공개하지 않아요. 응답이 더 모이면 계산할 수 있어요.</p>
            <div className="count-panel count-panel-small"><span>현재 비교 가능한 이성 참여자</span><strong>{result.population_count}<small>명</small></strong><p>20명부터 서로 맞는 사람 수를 보여드려요.</p></div>
          </> : <>
            <h1 id="result-heading" className="result-heading">서로 취향이 맞는 사람</h1>
            <div className="result-number" aria-live="polite"><strong>{result.mutual_count?.toLocaleString("ko-KR") ?? "0"}</strong><span>명</span></div>
            <p className="result-description">현재 참여한 이성 <b>{result.population_count.toLocaleString("ko-KR")}명</b> 중<br />서로 입력한 조건을 만족한 응답이에요.</p>
            {result.preferred_count !== null && <div className="preferred-count">내가 고른 조건에 맞는 사람 <b>{result.preferred_count.toLocaleString("ko-KR")}명</b></div>}
            {result.population_count >= 100 && <p className="result-rate">전체의 {((result.mutual_count ?? 0) / result.population_count * 100).toFixed(1)}% · 연애 가능성을 뜻하지 않아요</p>}
          </>}
          {preferredLabels.length > 0 && <div className="result-insight"><span className="insight-mark" aria-hidden="true">✳</span><p>내가 특히 중요하게 고른 항목 <b>{preferredLabels.join(" · ")}</b></p></div>}
          <section className="overlap-section" aria-labelledby="overlap-heading">
            <p className="overlap-eyebrow">나와 닮은 취향</p>
            <h2 id="overlap-heading">같은 성격·취미를 고른 사람</h2>
            <p className="overlap-description">각 항목에서 하나 이상 겹치는 참여자예요. 나 자신은 제외했어요.</p>
            <div className="overlap-grid">
              <OverlapCard label="동성" population={result.same_gender_population_count}
                personality={result.same_gender_personality_count} hobbies={result.same_gender_hobby_count}
                hasHobbies={response ? response.hobbies.length > 0 : null} />
              <OverlapCard label="이성" population={result.population_count}
                personality={result.opposite_gender_personality_count} hobbies={result.opposite_gender_hobby_count}
                hasHobbies={response ? response.hobbies.length > 0 : null} />
            </div>
          </section>
          <div className="result-actions">
            <button className="button button-primary share-main-button" onClick={() => setShowShare(true)}>친구는 몇 명인지 물어보기 <span aria-hidden="true">↗</span></button>
            <Link className="button button-secondary" href="/test?mode=edit">응답 수정</Link>
          </div>
          <p className="result-footnote">최근 90일 동안 저장된 익명 응답 · {new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.computed_at))} 계산</p>
          <div className="result-disclaimer"><span aria-hidden="true">ⓘ</span><p>이 숫자는 참여자가 직접 고른 응답을 비교한 결과예요. 실제 호감이나 연애 가능성을 예측하지 않아요.</p></div>
          <div className="result-tools">
            <button type="button" onClick={() => void refreshResult()} disabled={refreshing}>{refreshing ? "계산 중…" : "결과 다시 계산"}</button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => void deleteResponse()} disabled={deleting}>{deleting ? "삭제 중…" : "내 응답 삭제"}</button>
          </div>
          {error && <p className="inline-error result-error" role="alert">{error}</p>}
        </section>
        <footer className="flow-footer"><Link href="/">나와 맞는 사람 찾아보기 홈</Link></footer>
        {showShare && <SharePanel result={result} onClose={() => setShowShare(false)} />}
      </>}
    </main>
  );
}

function OverlapCard({ label, population, personality, hobbies, hasHobbies }: {
  label: "동성" | "이성";
  population: number;
  personality: number | null;
  hobbies: number | null;
  hasHobbies: boolean | null;
}) {
  const ready = population >= MIN_SAMPLE_SIZE;
  return <div className="overlap-card">
    <div className="overlap-card-head"><h3>{label}</h3><span>{population.toLocaleString("ko-KR")}명 참여</span></div>
    {ready ? <dl>
      <div><dt>성격 겹침</dt><dd>{personality?.toLocaleString("ko-KR") ?? "0"}<small>명</small></dd></div>
      <div><dt>취미 겹침</dt><dd>{hasHobbies === false ? <span className="overlap-not-selected">취미 미선택</span> : <>{hobbies?.toLocaleString("ko-KR") ?? "0"}<small>명</small></>}</dd></div>
    </dl> : <p className="overlap-waiting">{population === 0 ? "참여자가 생기면 비교할 수 있어요." : `${MIN_SAMPLE_SIZE}명부터 겹치는 인원을 보여드려요.`}</p>}
  </div>;
}
