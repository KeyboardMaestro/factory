"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicResult } from "@/lib/domain";
import { trackEvent } from "@/lib/client/analytics";

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share: { sendDefault: (options: Record<string, unknown>) => void };
    };
  }
}

const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.2/kakao.min.js";
const SDK_INTEGRITY = "sha384-zt/G7/KfaRQ9dT/QIkS0ujMtzouJqzuSJcXVQu50x0rl/+mD1dc70AeOejVbMD9E";
let kakaoLoadTask: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  if (window.Kakao) return Promise.resolve();
  if (kakaoLoadTask) return kakaoLoadTask;
  const existing = document.querySelector<HTMLScriptElement>("script[data-ti-kakao]");
  const task = new Promise<void>((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("sdk")), { once: true });
    if (existing) return;
    script.src = SDK_URL;
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.dataset.tiKakao = "true";
    document.head.append(script);
  });
  kakaoLoadTask = task.catch((error: unknown) => {
    kakaoLoadTask = null;
    throw error;
  });
  return kakaoLoadTask;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* Continue with the accessible legacy clipboard fallback. */ }
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  return copied;
}

export function SharePanel({ result, onClose }: { result: PublicResult; onClose: () => void }) {
  const [includeCount, setIncludeCount] = useState(false);
  const [notice, setNotice] = useState("");
  const [kakaoState, setKakaoState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const previousFocus = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const count = result.state === "ready" ? result.mutual_count : null;
  const message = includeCount && count !== null
    ? "방금 계산한 내 결과는 " + count + "명. 서로 고른 조건이 맞는 사람이래. 너는 몇 명인지 해봐."
    : result.state === "sample_small"
      ? "서로 취향이 맞는 사람은 몇 명일까? 아직 참여자가 모이는 중이래. 너도 해봐."
      : "실제 참여자 중 서로 취향이 맞는 사람은 몇 명일까? 너도 취향을 골라봐.";
  const shareUrl = (source: "kakao" | "native" | "copy") => window.location.origin + "/?src=" + source;

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => dialog.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeRef.current(); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    if (process.env.NEXT_PUBLIC_KAKAO_JS_KEY) {
      setKakaoState("loading");
      void loadKakaoSdk().then(() => setKakaoState("ready")).catch(() => setKakaoState("failed"));
    }
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, []);

  const close = useCallback(() => onClose(), [onClose]);

  async function shareNative() {
    trackEvent({ name: "share_click", channel: "native", resultState: result.state });
    if (typeof navigator.share !== "function") {
      const copied = await copyText(message + "\n" + shareUrl("copy"));
      setNotice(copied ? "공유 링크를 복사했어요." : "공유 링크를 복사하지 못했어요.");
      trackEvent({ name: "share_outcome", outcome: copied ? "copied" : "failed" });
      return;
    }
    try {
      await navigator.share({ title: "나와 맞는 사람 찾아보기", text: message, url: shareUrl("native") });
      trackEvent({ name: "share_outcome", outcome: "returned" });
      close();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        trackEvent({ name: "share_outcome", outcome: "cancelled" });
        return;
      }
      const copied = await copyText(message + "\n" + shareUrl("copy"));
      setNotice(copied ? "공유를 열지 못해 링크를 복사했어요." : "공유 링크를 복사하지 못했어요.");
      trackEvent({ name: "share_outcome", outcome: copied ? "copied" : "failed" });
    }
  }

  async function shareKakao() {
    trackEvent({ name: "share_click", channel: "kakao", resultState: result.state });
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    if (!key) {
      const copied = await copyText(message + "\n" + shareUrl("copy"));
      setNotice(copied ? "카카오톡 설정 전이라 공유 링크를 복사했어요." : "공유 링크를 복사하지 못했어요.");
      trackEvent({ name: "share_outcome", outcome: copied ? "copied" : "failed" });
      return;
    }
    try {
      if (kakaoState !== "ready") throw new Error("SDK_NOT_READY");
      const kakao = window.Kakao;
      if (!kakao) throw new Error("SDK_LOAD_FAILED");
      if (!kakao.isInitialized()) kakao.init(key);
      kakao.Share.sendDefault({
        objectType: "feed",
        content: {
          title: "나와 맞는 사람 찾아보기",
          description: message,
          imageUrl: window.location.origin + "/opengraph-image",
          link: { webUrl: shareUrl("kakao"), mobileWebUrl: shareUrl("kakao") },
        },
        buttons: [{ title: "내 취향 알아보기", link: { webUrl: shareUrl("kakao"), mobileWebUrl: shareUrl("kakao") } }],
      });
      trackEvent({ name: "share_outcome", outcome: "returned" });
      close();
    } catch {
      const copied = await copyText(message + "\n" + shareUrl("copy"));
      setNotice(copied ? "카카오톡을 열지 못해 공유 링크를 복사했어요." : "공유 링크를 복사하지 못했어요.");
      trackEvent({ name: "share_outcome", outcome: copied ? "copied" : "failed" });
    }
  }

  async function copyLink() {
    trackEvent({ name: "share_click", channel: "copy", resultState: result.state });
    const copied = await copyText(message + "\n" + shareUrl("copy"));
    setNotice(copied ? "공유 문구와 링크를 복사했어요." : "복사할 수 없어요. 브라우저 주소를 직접 복사해주세요.");
    trackEvent({ name: "share_outcome", outcome: copied ? "copied" : "failed" });
  }

  return (
    <div className="share-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="share-panel" role="dialog" aria-modal="true" aria-labelledby="share-title" ref={dialog}>
        <div className="share-grabber" aria-hidden="true" />
        <div className="share-heading"><div><p className="eyebrow">결과 공유</p><h2 id="share-title">친구에게 물어볼까요?</h2></div><button className="icon-button" aria-label="공유 창 닫기" onClick={close}>×</button></div>
        <label className="share-toggle"><span><b>내 결과 숫자 포함</b><small>공유 문구에 {count === null ? "내 결과" : count + "명"}을 넣어요.</small></span><input type="checkbox" checked={includeCount} disabled={count === null} onChange={(event) => setIncludeCount(event.target.checked)} /></label>
        <div className="share-preview"><span>미리보기</span><p>{message}</p><small>실제 응답이나 결과 페이지는 공유되지 않아요.</small></div>
        <div className="share-options">
          <button className="share-option" onClick={() => void shareKakao()} disabled={kakaoState === "loading"}><span className="share-icon kakao-icon" aria-hidden="true">T</span><span>{kakaoState === "loading" ? "카카오톡 준비 중" : "카카오톡"}</span></button>
          <button className="share-option" onClick={() => void shareNative()}><span className="share-icon native-icon" aria-hidden="true">↗</span><span>다른 앱</span></button>
          <button className="share-option" onClick={() => void copyLink()}><span className="share-icon copy-icon" aria-hidden="true">⌁</span><span>링크 복사</span></button>
        </div>
        {notice && <p className="share-notice" role="status" aria-live="polite">{notice}</p>}
        <button className="text-button share-close" onClick={close}>닫기</button>
      </div>
    </div>
  );
}
