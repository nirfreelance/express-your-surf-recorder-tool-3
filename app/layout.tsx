import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Express Your Surf — recorder prototype",
  description: "Working prototype of the video review and recording tool.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
