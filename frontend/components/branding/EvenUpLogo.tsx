import Image from "next/image";

/**
 * Official EvenUp logo (horizontal wordmark + icon).
 * Asset: https://mma.prnewswire.com/media/2525332/EvenUp_Logo.jpg
 * Copied to `/public/evenup-logo.jpg` for reliable loading.
 */
export default function EvenUpLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative h-14 w-full max-w-[22rem] shrink-0 ${className}`}
    >
      <Image
        src="/evenup-logo.jpg"
        alt="EvenUp"
        fill
        className="object-contain object-left"
        sizes="(max-width: 22rem) 100vw, 22rem"
        priority
      />
    </div>
  );
}
