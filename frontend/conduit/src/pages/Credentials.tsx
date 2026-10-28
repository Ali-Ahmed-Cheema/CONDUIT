import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { CredentialWorkspace } from "../../../../src/App";
import credentialStyles from "../../../../src/index.css?inline";

export function CredentialsPage() {
  const host = useRef<HTMLDivElement>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    const element = host.current;
    const root = element?.shadowRoot ?? element?.attachShadow({ mode: "open" });
    if (!root) return;
    const style = document.createElement("style");
    style.dataset.credentialWorkspace = "true";
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        color: #172033;
        background: #f7f8fb;
        font-family: "DM Sans", sans-serif;
        font-synthesis: none;
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        --purple: #635bda;
        --line: #e8ebf1;
      }
      ${credentialStyles}
    `;
    root.append(style);
    setShadowRoot(root);

    return () => style.remove();
  }, []);

  return (
    <div className="credential-reference-host" ref={host}>
      {shadowRoot && createPortal(<CredentialWorkspace />, shadowRoot)}
    </div>
  );
}
