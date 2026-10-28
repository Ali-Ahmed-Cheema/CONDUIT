import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { types } from "../../../../src/credentialTypes";
import { CredentialsPage } from "../pages/Credentials";

describe("credential workspace integration", () => {
  it("renders every credential type inside the chat app page", () => {
    const markup = renderToStaticMarkup(<CredentialsPage />);

    expect(markup).toContain("API credentials");
    expect(markup.match(/class="card"/g)).toHaveLength(types.length);
    for (const type of types) {
      expect(markup).toContain(type.name);
    }
    expect(markup).toContain("Restrictions you can apply");
    expect(markup).toContain("Common API responses");
  });
});
