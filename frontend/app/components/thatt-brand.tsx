import Image from "next/image";

export function ThattBrand({ className = "thatt-wordmark", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/thatt-logo.webp" alt="തട്ട്" width={140} height={95} className={className} priority={priority} />;
}
