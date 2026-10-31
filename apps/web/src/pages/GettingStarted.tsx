import { ArrowRight, MessageSquare, Settings, Sparkles, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { GlassPanel } from "@conduit/ui";
import { Header } from "../components/Header";

const steps = [
  {
    title: "Connect an AI service",
    description: "Add a key from a supported provider, then choose a model for your chats.",
    href: "/api-config",
    label: "Connect AI",
    icon: <Sparkles size={20} />,
  },
  {
    title: "Start a conversation",
    description: "Open a new chat, write a message, and send it to your selected model.",
    href: "/",
    label: "Start a new chat",
    icon: <MessageSquare size={20} />,
  },
  {
    title: "Find chats later",
    description: "Search your history, pin important conversations, or import an existing chat.",
    href: "/history",
    label: "Open chat history",
    icon: <Workflow size={20} />,
  },
  {
    title: "Make the workspace yours",
    description: "Adjust the theme, text size, accessibility options, and encrypted backups.",
    href: "/settings",
    label: "Personalize settings",
    icon: <Settings size={20} />,
  },
];

export function GettingStartedPage() {
  return (
    <div className="page-shell">
      <Header title="Getting started" showBack />
      <main id="main-content" className="about-page">
        <GlassPanel className="about-content">
          <h1>Welcome to CONDUIT</h1>
          <p>Get set up in a few steps. No account is needed; your chats are saved on this device.</p>
          <ol>
            {steps.map((step) => (
              <li key={step.href}>
                <h2>{step.icon}{step.title}</h2>
                <p>{step.description}</p>
                <Link className="secondary-button" to={step.href}>
                  {step.label}<ArrowRight size={18} />
                </Link>
              </li>
            ))}
          </ol>
          <p>When you send a message, it is shared with the AI service you selected so it can respond.</p>
        </GlassPanel>
      </main>
    </div>
  );
}
