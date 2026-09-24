import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(origin),
  title: { default: "나와 맞는 사람 찾아보기", template: "%s · 나와 맞는 사람 찾아보기" },
  description: "실제 참여자 중, 서로 취향이 맞는 이성은 몇 명일까요?",
  openGraph: {
    type: "website",
    siteName: "나와 맞는 사람 찾아보기",
    title: "명절 잔소리, 결혼은 언제할 거니?",
    description: "나와 맞는 사람은 몇 명일까? 취향을 고르고 실제 참여 응답과 비교해 보세요.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "명절 잔소리: 결혼은 언제할 거니?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "나와 맞는 사람 찾아보기",
    description: "명절 잔소리, 결혼은 언제할 거니?",
    images: ["/opengraph-image"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7fa",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
