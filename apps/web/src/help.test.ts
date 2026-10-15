import { describe, expect, it } from "vitest";
import { helpPage, helpUrl } from "./help.tsx";

describe("helpPage", () => {
  it("maps screens to guide pages", () => {
    const p = "/projects/11111111-1111-1111-1111-111111111111";
    expect(helpPage("/")).toBe("getting-started");
    expect(helpPage(`${p}/reviews/x`)).toBe("reviews");
    expect(helpPage(`${p}/runs/x`)).toBe("test-plans");
    expect(helpPage(`${p}/items/x/impact`)).toBe("trace");
    expect(helpPage(`${p}/ci-runs`)).toBe("verification");
    expect(helpPage(`${p}`)).toBe("trace");
    expect(helpPage("/users")).toBe("install");
  });
  it("builds /help URLs", () => {
    expect(helpUrl("index")).toBe("/help/");
    expect(helpUrl("reviews")).toBe("/help/reviews");
  });
});
