import { Header } from "../components/Header";

export function AboutPage() {
  return (
    <div className="page-shell">
      <Header title="About" showBack />
      <main className="about-page glass">
        <h2>CONDUIT V3.0</h2>
        <p>A minimal multi-provider chat app focused on privacy, encrypted storage, and a single-device lock screen.</p>
        <p>API keys are validated and encrypted by the local API service. Chat history and preferences are encrypted in IndexedDB with AES-GCM. The data key stays in memory and is cleared when the app locks.</p>
        <p>Time zone: Asia/Karachi.</p>
        <p>Prototype password must be replaced before production, and a server-backed enforcement boundary is still recommended for real deployment.</p>
      </main>
    </div>
  );
}
