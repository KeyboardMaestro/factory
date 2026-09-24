import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "명절 잔소리, 결혼은 언제할 거니? — 나와 맞는 사람 찾아보기";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", position: "relative", overflow: "hidden", padding: "58px 70px",
        background: "#342a22", color: "#fffaf2", fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", width: 520, height: 520, top: 160, right: -115,
          border: "2px solid #83543b", borderRadius: "50%", display: "flex" }} />
        <div style={{ position: "absolute", width: 330, height: 330, top: 260, right: -10,
          border: "2px solid #9b7848", borderRadius: "50%", display: "flex" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "10px 19px", borderRadius: 999,
            background: "#f7d28a", color: "#432d22", fontSize: 23, fontWeight: 700 }}>명절 잔소리</div>
          <div style={{ display: "flex", color: "#dcc7a4", fontSize: 18, letterSpacing: 3 }}>HOLIDAY QUESTION</div>
        </div>
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 86, fontWeight: 800,
            lineHeight: 1.22, letterSpacing: -3 }}>
            <div>“결혼은</div>
            <div>언제할 거니?”</div>
          </div>
          <div style={{ display: "flex", color: "#ecd9bd", fontSize: 27 }}>그 질문에, 내 취향부터 답해볼까요.</div>
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "space-between",
          paddingTop: 21, borderTop: "1px solid #745c43", fontSize: 23, fontWeight: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, background: "#b84a36", display: "flex" }} />
            나와 맞는 사람 찾아보기
          </div>
          <div style={{ display: "flex", color: "#d9c5a4", fontSize: 17, fontWeight: 500 }}>실제 참여 응답으로 비교</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
