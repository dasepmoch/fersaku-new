export default function SellerWorkspaceLoading() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Memuat dashboard"
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="hairline h-36 animate-pulse rounded-[22px] border bg-white/60"
        />
      ))}
    </div>
  );
}
