export default function AdminConsoleLoading() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Loading admin console"
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-36 animate-pulse rounded-[20px] border border-[#dfe3ec] bg-white/60"
        />
      ))}
    </div>
  );
}
