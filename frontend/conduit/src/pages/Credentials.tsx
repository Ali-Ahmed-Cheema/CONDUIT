import { useEffect } from "react";
import CredentialWorkspace from "../../../../src/App";
import credentialStyles from "../../../../src/index.css?inline";

export function CredentialsPage() {
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.credentialWorkspace = "true";
    style.textContent = credentialStyles;
    document.head.append(style);

    return () => style.remove();
  }, []);

  return <CredentialWorkspace />;
}
