import { Header } from "../components/Header";
import { useState } from "react";
import { GlassPanel } from "@conduit/ui";

export function AboutPage() {
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div className="page-shell">
      <Header title="About" showBack />
      <main id="main-content" className="about-page">
        <GlassPanel className="about-content">
        <h1>About CONDUIT</h1>
        <p>Your chats are saved on this device. When you send a message, the AI service you choose receives it so it can reply.</p>
        <p>Your saved data is encrypted on this device.</p>
        <button
          type="button"
          className="secondary-button"
          aria-expanded={detailsOpen}
          aria-controls="technical-details"
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? "Hide technical details" : "Technical details"}
        </button>
        {detailsOpen && (
          <section id="technical-details" aria-label="Technical details">
            <h2>Technical details</h2>
            <p>Chat history and preferences use encrypted local storage. API connections are handled by the local service.</p>
          </section>
        )}
        </GlassPanel>
      </main>
    </div>
  );
}
