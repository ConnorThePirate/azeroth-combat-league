import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

const ROUTES = [
  "/", "/leaderboards", "/matches", "/events", "/world", "/arena",
  "/account", "/status", "/rules", "/player/p1", "/match/m1",
];

describe("app smoke", () => {
  for (const route of ROUTES) {
    it(`renders ${route}`, () => {
      const html = renderToString(
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>,
      );
      expect(html.length).toBeGreaterThan(50);
      expect(html).not.toContain("Something broke");
    });
  }
});
