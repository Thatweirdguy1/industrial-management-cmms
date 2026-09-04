export default function LoadingScreen({ label = "Loading plant data" }: { label?: string }) {
  return (
    <main className="skeleton-shell" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="skeleton-frame" aria-hidden="true">
        <div className="skeleton-bar" />
        <div className="skeleton-grid">
          {Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index} />)}
        </div>
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    </main>
  );
}
