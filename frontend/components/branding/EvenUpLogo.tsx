import Image from "next/image";

/**
 * Official EvenUp logo (horizontal wordmark + icon).
 * Asset: https://mma.prnewswire.com/media/2525332/EvenUp_Logo.jpg
 * Copied to `/public/evenup-logo.jpg` for reliable loading.
 */
export default function EvenUpLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative h-9 w-full max-w-[15rem] shrink-0 ${className}`}
    >
      <Image
        src="/evenup-logo.jpg"
        alt="EvenUp"
        fill
        className="object-contain object-left"
        sizes="(max-width: 18rem) 100vw, 15rem"
        priority
      />
    </div>
  );
}
