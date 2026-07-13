import { createLobby, ensureSettings } from "./setup";
import { DEFAULT_SETTINGS } from "./types";

test("createLobby starts with default settings", () => {
  const g = createLobby("ROOM", "seed");
  expect(g.settings).toEqual({ winVP: 10, setupMode: "settlements" });
});

test("ensureSettings fills entirely-missing settings with defaults", () => {
  const g = createLobby("ROOM", "seed");
  delete (g as { settings?: unknown }).settings;
  ensureSettings(g);
  expect(g.settings).toEqual(DEFAULT_SETTINGS);
});

test("ensureSettings coerces a partial/invalid settings object", () => {
  const g = createLobby("ROOM", "seed");
  (g as { settings: unknown }).settings = { winVP: 12 }; // missing setupMode
  ensureSettings(g);
  expect(g.settings).toEqual({ winVP: 12, setupMode: "settlements" });
});

test("ensureSettings rejects a bogus setupMode back to default", () => {
  const g = createLobby("ROOM", "seed");
  (g as { settings: unknown }).settings = { winVP: 9, setupMode: "bogus" };
  ensureSettings(g);
  expect(g.settings).toEqual({ winVP: 9, setupMode: "settlements" });
});
