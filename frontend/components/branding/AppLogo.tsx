export default function AppLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-14 w-full max-w-[22rem] shrink-0 items-center ${className}`}
    >
      <span className="font-serif text-xl font-bold text-brand-primary">
        CaseLogic
      </span>
    </div>
  );
}
