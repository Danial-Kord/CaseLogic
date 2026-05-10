import Image from "next/image";

/**
 * EvenUp brand mark for the app header.
 * Local asset: `/public/portfolio-evenup.png`.
 */
export default function EvenUpLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative h-14 w-full max-w-[22rem] shrink-0 ${className}`}
    >
      <Image
        src="/portfolio-evenup.png"
        alt="EvenUp"
        fill
        className="object-contain object-left"
        sizes="(max-width: 22rem) 100vw, 22rem"
        priority
      />
    </div>
  );
}
