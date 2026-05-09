import { render, screen, fireEvent } from "@testing-library/react";
import ThemeToggle from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// jsdom doesn't ship a real matchMedia. Stub it before each test so the
// component's `prefers-color-scheme` checks have something to call into.
function stubMatchMedia(prefersDark: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("dark") ? prefersDark : false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    stubMatchMedia(false);
  });

  it("renders three options: light, system, dark", () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText("Light theme")).toBeInTheDocument();
    expect(screen.getByLabelText("Match system theme")).toBeInTheDocument();
    expect(screen.getByLabelText("Dark theme")).toBeInTheDocument();
  });

  it("clicking 'Dark theme' sets localStorage and adds the .dark class", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("Dark theme"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("clicking 'Light theme' clears the .dark class", () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("Light theme"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("clicking 'System' removes the stored preference and falls back to OS", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    document.documentElement.classList.add("dark");
    stubMatchMedia(false); // OS prefers light
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("Match system theme"));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("system mode follows OS preference when OS prefers dark", () => {
    stubMatchMedia(true);
    render(<ThemeToggle />);
    fireEvent.click(screen.getByLabelText("Match system theme"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("marks the active option with aria-checked='true'", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    expect(screen.getByLabelText("Dark theme")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByLabelText("Light theme")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});
