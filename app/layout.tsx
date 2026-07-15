import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lumoshealth.sites.openai.com"),
  title: {
    default: "Lumos Health",
    template: "%s | Lumos Health",
  },
  description:
    "Prontuário eletrônico inteligente para uma saúde pública mais humana.",
  applicationName: "Lumos Health",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "Lumos Health — o prontuário que escuta",
    description:
      "Menos tela. Mais paciente. Registro clínico por voz em uma timeline única.",
    type: "website",
    locale: "pt_BR",
    images: [{ url: "/og.png", width: 1680, height: 941, alt: "Lumos Health — Menos tela. Mais paciente." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lumos Health — o prontuário que escuta",
    description: "Menos tela. Mais paciente.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d5c59",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
