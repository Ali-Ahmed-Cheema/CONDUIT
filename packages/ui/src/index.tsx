import { CircleHelp } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function GlassPanel({ children, className = "", ...props }: SurfaceProps) {
  return <section className={`ui-glass-panel ${className}`.trim()} {...props}>{children}</section>;
}

export function GlassCard({ children, className = "", ...props }: SurfaceProps) {
  return <article className={`ui-glass-card ${className}`.trim()} {...props}>{children}</article>;
}

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

export function GlassButton({ children, className = "", variant = "secondary", ...props }: GlassButtonProps) {
  return <button className={`ui-glass-button ui-glass-button-${variant} ${className}`.trim()} {...props}>{children}</button>;
}

type GlassInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function GlassInput({ id, label, hint, className = "", ...props }: GlassInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className="ui-glass-input">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} className={className} aria-describedby={hintId} {...props} />
      {hint && <span className="ui-glass-input-hint" id={hintId}>{hint}</span>}
    </div>
  );
}

type GlassToggleProps = {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

export function GlassToggle({ checked, label, onChange }: GlassToggleProps) {
  return (
    <button
      type="button"
      className="ui-glass-toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="ui-glass-toggle-state">{checked ? "On" : "Off"}</span>
    </button>
  );
}

type GlassDialogProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function GlassDialog({ open, title, children, onClose }: GlassDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusable = () => Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    getFocusable()[0]?.focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ui-dialog-backdrop">
      <div
        ref={dialogRef}
        className="ui-glass-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export type GlassTab = {
  href: string;
  label: string;
  icon: ReactNode;
  current?: boolean;
  onClick?: () => void;
};

export function GlassTabBar({
  tabs,
  label = "Main navigation",
  className = "",
  children,
}: {
  tabs: GlassTab[];
  label?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <nav className={`ui-glass-tab-bar ${className}`.trim()} aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          to={tab.href}
          aria-current={tab.current ? "page" : undefined}
          className={tab.current ? "is-current" : undefined}
          onClick={tab.onClick}
        >
          {tab.icon}<span>{tab.label}</span>
        </Link>
      ))}
      {children}
    </nav>
  );
}

type ToastProps = {
  message: string;
  onDismiss: () => void;
  duration?: number;
};

export function Toast({ message, onDismiss, duration = 6000 }: ToastProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || duration <= 0) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, onDismiss, paused]);

  return (
    <div
      className="ui-toast"
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <span>{message}</span>
      <button type="button" aria-label="Dismiss message" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

const helpSteps: Record<string, [string, string, string]> = {
  Chat: ["Write a message in the box.", "Choose Send to ask your AI service.", "Open More options to change the service or model."],
  History: ["Search for a chat by its name or words.", "Choose a chat to open it.", "Use the pin button to keep a chat near the top."],
  "Connect AI": ["Choose an AI service.", "Paste your key from that service.", "Save it, then pick a model."],
  Settings: ["Choose how CONDUIT looks.", "Change sound or backup settings.", "Open the Danger Zone only when you need it."],
  About: ["Your chats are saved on this device.", "The AI service gets a message when you send it.", "Open Technical details to learn more."],
};

export function HelpButton({ screen }: { screen: string }) {
  const [open, setOpen] = useState(false);
  const steps = helpSteps[screen] ?? ["Choose a page from the navigation.", "Use the buttons with text labels.", "Open More options for extra controls."];

  return (
    <>
      <button type="button" className="workspace-help" onClick={() => setOpen(true)}>
        <CircleHelp size={20} /><span>Help</span>
      </button>
      <GlassDialog open={open} title={`Help with ${screen}`} onClose={() => setOpen(false)}>
        <p>Here are a few steps to get started:</p>
        <ol>
          {steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <GlassButton variant="primary" onClick={() => setOpen(false)}>Close help</GlassButton>
      </GlassDialog>
    </>
  );
}
