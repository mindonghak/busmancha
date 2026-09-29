import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://busmancha.vercel.app"),
  title: "버스만차 | 광역버스 시간대별 만차·잔여좌석 통계",
  description: "M4137, M4130, M4448, G6009, 화성 6002 광역버스의 정류장·시간대별 과거 만차 비율과 잔여좌석 통계. 평일·주말과 날씨 조건으로 확인하세요.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "버스만차 | 내 정류장의 버스 만차 기록",
    description: "광역버스 정류장·시간대별 과거 만차 비율과 잔여좌석 통계",
    url: "/",
    siteName: "버스만차",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
