import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  ...(process.env.NEXT_PUBLIC_SITE_URL ? { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL) } : {}),
  title: "തട്ട് | Fresh Fish & Seafood from Munambam, Kerala",
  description: "Order fresh sea fish and freshwater fish sourced from Munambam, Kerala. Choose your weight and cleaning or cutting preferences, with local delivery and future preorders.",
  applicationName: "തട്ട്",
  keywords: ["fresh fish Munambam", "sea fish delivery", "freshwater fish", "fish cleaned and cut", "Kerala seafood delivery"],
  alternates: process.env.NEXT_PUBLIC_SITE_URL ? { canonical: "/" } : undefined,
  openGraph: {
    type: "website",
    locale: "en_IN",
    siteName: "തട്ട്",
    title: "Fresh Fish & Seafood from Munambam, Kerala | തട്ട്",
    description: "Fresh sea and freshwater fish from Munambam, cleaned and cut to your preference, with local delivery.",
    url: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  },
  twitter: {
    card: "summary",
    title: "Fresh Fish & Seafood from Munambam, Kerala | തട്ട്",
    description: "Fresh sea and freshwater fish from Munambam, cleaned and cut to your preference, with local delivery.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+Malayalam:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" /></head><body>{children}</body></html>;
}
