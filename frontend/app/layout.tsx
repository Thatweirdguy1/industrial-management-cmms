import type { Metadata } from "next";
import { Playfair_Display, Lora, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import GeofenceWrapper from "@/components/GeofenceWrapper";

const fontPlayfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const fontLora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

const fontInter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prem PM software",
  description: "Dadri Plant Control CMMS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontPlayfair.variable} ${fontLora.variable} ${fontInter.variable} ${fontMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GeofenceWrapper>{children}</GeofenceWrapper>
      </body>
    </html>
  );
}
