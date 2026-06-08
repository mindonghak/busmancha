import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "버스만차",
  description: "광역버스 잔여좌석 통계 서비스",
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
