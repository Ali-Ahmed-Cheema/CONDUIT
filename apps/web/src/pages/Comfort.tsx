import { useAppStore, type TextSize, type ThemeMode } from "../store";
import { GlassToggle } from "@conduit/ui";

const textSizes: { value: TextSize; label: string; preview: string }[] = [
  { value: "normal", label: "Normal", preview: "Aa" },
  { value: "large", label: "Large", preview: "Aa" },
  { value: "extra-large", label: "Extra Large", preview: "Aa" },
];

const themes: { value: ThemeMode; label: string; colors: [string, string] }[] =
  [
    { value: "light", label: "Light", colors: ["#ffffff", "#17345c"] },
    { value: "dark", label: "Dark", colors: ["#101827", "#e7efff"] },
    { value: "system", label: "Automatic", colors: ["#f3f6fb", "#263854"] },
  ];

export function ComfortPage() {
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const preferences = useAppStore((state) => state.preferences);
  const setPreferences = useAppStore((state) => state.setPreferences);
  const finishSetup = () => setPreferences({ comfortSetupComplete: true });

  return (
    <main className="comfort-screen">
      <section className="comfort-card glass" aria-labelledby="comfort-title">
        <p className="eyebrow">A QUICK FIRST STEP</p>
        <h1 id="comfort-title">Make it comfortable</h1>
        <p>
          Choose a text size and theme, or skip this for now. You can change
          everything later in Settings.
        </p>
        <fieldset className="comfort-choice-group">
          <legend>Text size</legend>
          <div className="comfort-choice-grid">
            {textSizes.map((choice) => (
              <button
                type="button"
                key={choice.value}
                className={`comfort-choice ${preferences.textSize === choice.value ? "selected" : ""}`}
                aria-pressed={preferences.textSize === choice.value}
                onClick={() => setPreferences({ textSize: choice.value })}
              >
                <span
                  className="text-size-preview"
                  data-size={choice.value}
                  aria-hidden="true"
                >
                  {choice.preview}
                </span>
                <span>{choice.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="comfort-choice-group">
          <legend>Theme</legend>
          <div className="comfort-choice-grid">
            {themes.map((choice) => (
              <button
                type="button"
                key={choice.value}
                className={`comfort-choice ${theme === choice.value ? "selected" : ""}`}
                aria-pressed={theme === choice.value}
                onClick={() => setTheme(choice.value)}
              >
                <span
                  className="theme-preview"
                  aria-hidden="true"
                  style={{
                    backgroundColor: choice.colors[0],
                    color: choice.colors[1],
                  }}
                >
                  Aa
                </span>
                <span>{choice.label}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="comfort-choice-group">
          <legend>Simple Mode</legend>
          <div className="simple-mode-choice">
            <p>Keep extra choices tucked away until you need them.</p>
            <GlassToggle
              label="Simple Mode"
              checked={preferences.simpleMode}
              onChange={(simpleMode) => setPreferences({ simpleMode })}
            />
          </div>
        </fieldset>

        <footer className="comfort-actions">
          <button
            type="button"
            className="primary-button comfort-continue"
            onClick={finishSetup}
          >
            Continue to chat
          </button>
          <button
            type="button"
            className="secondary-button comfort-skip"
            onClick={finishSetup}
          >
            Skip for now
          </button>
        </footer>
      </section>
    </main>
  );
}
