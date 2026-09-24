import Link from "next/link";
import { LandingTracker } from "@/components/landing-tracker";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ src?: string }> }) {
  const params = await searchParams;
  const allowedSource = ["kakao", "copy", "native", "instagram"].includes(params.src ?? "") ? params.src! : "direct";
  return (
    <main className="landing-shell">
      <LandingTracker source={allowedSource as "kakao" | "copy" | "native" | "instagram" | "direct"} />
      <header className="site-header">
        <Link className="brand" href="/" aria-label="나와 맞는 사람 찾아보기 홈"><span className="brand-mark" aria-hidden="true" />나와 맞는 사람 찾아보기</Link>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> 실제 참여 응답으로 비교해요</p>
          <h1 id="hero-title">실제 참여자 중,<br />서로 취향이 맞는 이성은<br /><span>몇 명일까?</span></h1>
          <p className="hero-description">내가 원하는 사람, 그 사람도 내 조건을 좋아할까?<br className="desktop-break" /> 내 취향을 고르고 서로 맞는 사람의 수를 확인해요.</p>
          <Link className="button button-primary hero-cta" href="/test">내 취향 알아보기 <span aria-hidden="true">↗</span></Link>
          <p className="hero-caption">약 1분 · 가입 없이 참여 · 만 19세 이상</p>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="overlap-shape shape-left"><span>내가 원하는<br />취향</span></div>
          <div className="overlap-shape shape-right"><span>나를 원하는<br />취향</span></div>
          <div className="overlap-center"><span>서로<br />맞는 사람</span><b>?</b></div>
          <span className="visual-label visual-label-top">REAL ANSWERS</span>
          <span className="visual-label visual-label-bottom">TASTE × TASTE</span>
        </div>
      </section>

      <section className="landing-note" aria-label="참여 안내">
        <div className="note-item"><span className="note-number">01</span><p>취향을 간단히<br />고르고</p></div>
        <span className="note-arrow" aria-hidden="true">→</span>
        <div className="note-item"><span className="note-number">02</span><p>실제 참여 응답과<br />비교한 다음</p></div>
        <span className="note-arrow" aria-hidden="true">→</span>
        <div className="note-item"><span className="note-number">03</span><p>서로 맞는 사람<br />수를 확인해요</p></div>
      </section>

      <footer className="site-footer">
        <span>나와 맞는 사람 찾아보기는 오락용 취향 비교 콘텐츠예요.</span>
      </footer>
    </main>
  );
}
