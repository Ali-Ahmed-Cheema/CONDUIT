import { useState, type FormEvent } from "react";

type ChoiceField = {
  name: string;
  label: string;
  type: "text" | "number" | "range" | "checkbox" | "select";
  value?: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};

type GenUIComponent =
  | { type: "card"; title: string; description?: string; content?: string }
  | { type: "metric"; label: string; value: string | number; detail?: string }
  | { type: "table"; title?: string; columns: string[]; rows: Array<Array<string | number>> }
  | { type: "chart"; title: string; labels: string[]; values: number[] }
  | { type: "calculator"; title: string; description?: string; fields: ChoiceField[]; calculation: { label: string; numerator: string; denominator: string; decimals?: number } }
  | { type: "form"; title: string; description?: string; fields: ChoiceField[]; submitLabel?: string }
  | { type: "button"; label: string; prompt: string }
  | { type: "image"; title?: string; src: string; alt: string }
  | { type: "map"; title: string; location: string };

type GenUIField = {
  name: string;
  label: string;
  type: ChoiceField["type"];
  value?: ChoiceField["value"];
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === "string" && value.length <= 1_000;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isTextList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(isText);

function isField(value: unknown): value is GenUIField {
  if (!isRecord(value) || !isText(value.name) || !value.name || !isText(value.label) || !value.label) return false;
  if (!["text", "number", "range", "checkbox", "select"].includes(String(value.type))) return false;
  if (value.value !== undefined &&
    typeof value.value !== "string" &&
    typeof value.value !== "boolean" &&
    !isFiniteNumber(value.value)) return false;
  if (value.min !== undefined && !isFiniteNumber(value.min)) return false;
  if (value.max !== undefined && !isFiniteNumber(value.max)) return false;
  if (value.step !== undefined && (!isFiniteNumber(value.step) || value.step <= 0)) return false;
  if (value.options !== undefined && !isTextList(value.options)) return false;
  if (value.type === "select" && !isTextList(value.options)) return false;
  if (value.type === "range" && (!isFiniteNumber(value.min) || !isFiniteNumber(value.max) || value.max <= value.min)) return false;
  return true;
}

function isFieldList(value: unknown): value is GenUIField[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 12 &&
    value.every(isField) &&
    new Set(value.map((field) => field.name)).size === value.length;
}

function isGenUIComponent(value: unknown): value is GenUIComponent {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "card":
      return isText(value.title) && !!value.title &&
        (value.description === undefined || isText(value.description)) &&
        (value.content === undefined || isText(value.content));
    case "metric":
      return isText(value.label) && !!value.label &&
        (isText(value.value) || isFiniteNumber(value.value)) &&
        (value.detail === undefined || isText(value.detail));
    case "table": {
      if ((value.title !== undefined && !isText(value.title)) || !isTextList(value.columns)) return false;
      const columns = value.columns;
      return Array.isArray(value.rows) &&
        value.rows.length <= 100 &&
        value.rows.every((row) =>
          Array.isArray(row) &&
          row.length === columns.length &&
          row.every((cell) => isText(cell) || isFiniteNumber(cell)),
        );
    }
    case "chart":
      return isText(value.title) && !!value.title &&
        isTextList(value.labels) &&
        value.labels.length <= 12 &&
        Array.isArray(value.values) &&
        value.values.length === value.labels.length &&
        value.values.every((item) => isFiniteNumber(item) && item >= 0);
    case "calculator": {
      if (
        !isText(value.title) ||
        !value.title ||
        (value.description !== undefined && !isText(value.description)) ||
        !isFieldList(value.fields) ||
        !value.fields.every((field) => field.type === "number" || field.type === "range") ||
        !isRecord(value.calculation)
      ) return false;
      const calculation = value.calculation;
      if (
        !isText(calculation.label) ||
        !isText(calculation.numerator) ||
        !isText(calculation.denominator) ||
        !value.fields.some((field) => field.name === calculation.numerator) ||
        !value.fields.some((field) => field.name === calculation.denominator)
      ) return false;
      return calculation.decimals === undefined ||
        (typeof calculation.decimals === "number" &&
          Number.isInteger(calculation.decimals) &&
          calculation.decimals >= 0 &&
          calculation.decimals <= 4);
    }
    case "form":
      return isText(value.title) && !!value.title &&
        (value.description === undefined || isText(value.description)) &&
        isFieldList(value.fields) &&
        (value.submitLabel === undefined || isText(value.submitLabel));
    case "button":
      return isText(value.label) && !!value.label && isText(value.prompt) && !!value.prompt;
    case "image":
      return (value.title === undefined || isText(value.title)) &&
        isText(value.src) &&
        /^https:\/\/\S+$/i.test(value.src) &&
        isText(value.alt) &&
        !!value.alt;
    case "map":
      return isText(value.title) && !!value.title && isText(value.location) && !!value.location;
    default:
      return false;
  }
}

export function parseGenUI(content: string): GenUIComponent[] | null {
  try {
    const parsed: unknown = JSON.parse(content);
    const items = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && parsed.type === "ui" && Array.isArray(parsed.components)
        ? parsed.components
        : [parsed];
    if (items.length === 0 || items.length > 12 || !items.every(isGenUIComponent)) return null;
    return items;
  } catch {
    return null;
  }
}

export const GENUI_SYSTEM_PROMPT = `When a response would benefit from an interactive interface, include a fenced \`\`\`genui JSON block. Use only this safe declarative format; never include HTML, JavaScript, or executable code in it. The block may contain one component, an array of components, or {"type":"ui","components":[...]}. Supported components:
- {"type":"card","title":"...","description":"...","content":"..."}
- {"type":"metric","label":"...","value":42,"detail":"..."}
- {"type":"table","title":"...","columns":["..."],"rows":[["..."]]}
- {"type":"chart","title":"...","labels":["..."],"values":[1,2]} (bar chart)
- {"type":"calculator","title":"...","description":"...","fields":[{"name":"obtained","label":"Obtained marks","type":"number","value":85,"min":0,"max":150},{"name":"total","label":"Total marks","type":"range","value":100,"min":1,"max":150}],"calculation":{"label":"Percentage","numerator":"obtained","denominator":"total","decimals":2}} (live percentage)
- {"type":"form","title":"...","description":"...","fields":[{"name":"...","label":"...","type":"text|number|range|checkbox|select","options":["..."]}]}
- {"type":"button","label":"...","prompt":"..."} (sends the prompt to the conversation)
- {"type":"image","src":"https://...","alt":"...","title":"..."}
- {"type":"map","title":"...","location":"..."}
Keep the normal text answer useful on its own, and include a GenUI block only when it adds value.`;

function getDefaultValue(field: ChoiceField): string | boolean {
  if (field.type === "checkbox") return typeof field.value === "boolean" ? field.value : false;
  if (field.type === "number" || field.type === "range") {
    const fallback = field.type === "range" ? field.min ?? 0 : 0;
    return String(typeof field.value === "number" ? field.value : fallback);
  }
  if (typeof field.value === "string") return field.value;
  return field.options?.[0] ?? "";
}

function InteractiveFields({
  fields,
  values,
  onChange,
}: {
  fields: ChoiceField[];
  values: Record<string, string | boolean>;
  onChange: (name: string, value: string | boolean) => void;
}) {
  return (
    <div className="genui-fields">
      {fields.map((field) => {
        const value = values[field.name] ?? getDefaultValue(field);
        const id = `genui-${field.name}`;
        if (field.type === "checkbox") {
          return (
            <label className="genui-checkbox" key={field.name} htmlFor={id}>
              <input
                id={id}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => onChange(field.name, event.currentTarget.checked)}
              />
              <span>{field.label}</span>
            </label>
          );
        }
        if (field.type === "select") {
          return (
            <label className="genui-field" key={field.name} htmlFor={id}>
              <span>{field.label}</span>
              <select id={id} value={String(value)} onChange={(event) => onChange(field.name, event.currentTarget.value)}>
                {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          );
        }
        const type = field.type === "range" ? "range" : field.type;
        return (
          <label className="genui-field" key={field.name} htmlFor={id}>
            <span>{field.label}</span>
            <input
              id={id}
              type={type}
              value={String(value)}
              min={field.min}
              max={field.max}
              step={field.step}
              onChange={(event) => onChange(field.name, event.currentTarget.value)}
            />
            {field.type === "range" && <output htmlFor={id}>{String(value)}</output>}
          </label>
        );
      })}
    </div>
  );
}

function InteractiveForm({
  component,
  onAction,
}: {
  component: Extract<GenUIComponent, { type: "form" }>;
  onAction?: (prompt: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(component.fields.map((field) => [field.name, getDefaultValue(field)])),
  );
  const [submitted, setSubmitted] = useState(false);
  const update = (name: string, value: string | boolean) => {
    setSubmitted(false);
    setValues((current) => ({ ...current, [name]: value }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entries = component.fields.map((field) => `${field.label}: ${String(values[field.name])}`).join("\n");
    const prompt = `Use these form values for ${component.title}:\n${entries}`;
    if (onAction) onAction(prompt);
    setSubmitted(true);
  };

  return (
    <form className="genui-card genui-form" onSubmit={submit}>
      <div className="genui-card-heading">
        <h3>{component.title}</h3>
        {component.description && <p>{component.description}</p>}
      </div>
      <InteractiveFields fields={component.fields} values={values} onChange={update} />
      <button type="submit" className="genui-primary-button">{component.submitLabel ?? "Submit"}</button>
      {submitted && <p className="genui-status" role="status">{onAction ? "Sent to the conversation." : "Your responses are ready."}</p>}
    </form>
  );
}

function Calculator({ component }: { component: Extract<GenUIComponent, { type: "calculator" }> }) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(component.fields.map((field) => [field.name, getDefaultValue(field)])),
  );
  const update = (name: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [name]: value }));
  const numerator = Number(values[component.calculation.numerator]);
  const denominator = Number(values[component.calculation.denominator]);
  const percentage = denominator > 0 && Number.isFinite(numerator)
    ? `${((numerator / denominator) * 100).toFixed(component.calculation.decimals ?? 2)}%`
    : "—";

  return (
    <section className="genui-card genui-calculator" aria-label={component.title}>
      <div className="genui-card-heading">
        <h3>{component.title}</h3>
        {component.description && <p>{component.description}</p>}
      </div>
      <InteractiveFields fields={component.fields} values={values} onChange={update} />
      <div className="genui-result" aria-live="polite">
        <span>{component.calculation.label}</span>
        <strong>{percentage}</strong>
      </div>
    </section>
  );
}

export function GenerativeUI({
  components,
  onAction,
}: {
  components: GenUIComponent[];
  onAction?: (prompt: string) => void;
}) {
  return (
    <div className="genui-grid">
      {components.map((component, index) => {
        switch (component.type) {
          case "card":
            return (
              <section className="genui-card" key={`${component.type}-${index}`}>
                <h3>{component.title}</h3>
                {component.description && <p>{component.description}</p>}
                {component.content && <p>{component.content}</p>}
              </section>
            );
          case "metric":
            return (
              <section className="genui-card genui-metric" key={`${component.type}-${index}`}>
                <span>{component.label}</span>
                <strong>{component.value}</strong>
                {component.detail && <small>{component.detail}</small>}
              </section>
            );
          case "table":
            return (
              <section className="genui-card genui-table-card" key={`${component.type}-${index}`}>
                {component.title && <h3>{component.title}</h3>}
                <div className="genui-table-scroll">
                  <table>
                    <thead><tr>{component.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                    <tbody>
                      {component.rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          case "chart": {
            const max = Math.max(...component.values, 1);
            return (
              <section className="genui-card genui-chart" key={`${component.type}-${index}`}>
                <h3>{component.title}</h3>
                <div className="genui-bars" role="img" aria-label={component.title}>
                  {component.labels.map((label, itemIndex) => (
                    <div className="genui-bar-item" key={`${label}-${itemIndex}`}>
                      <span className="genui-bar-value">{component.values[itemIndex]}</span>
                      <div className="genui-bar-track">
                        <div className="genui-bar" style={{ height: `${Math.max(4, (component.values[itemIndex] / max) * 100)}%` }} />
                      </div>
                      <span className="genui-bar-label">{label}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          }
          case "calculator":
            return <Calculator component={component} key={`${component.type}-${index}`} />;
          case "form":
            return <InteractiveForm component={component} onAction={onAction} key={`${component.type}-${index}`} />;
          case "button":
            return (
              <button
                type="button"
                className="genui-primary-button genui-action-button"
                key={`${component.type}-${index}`}
                disabled={!onAction}
                onClick={() => onAction?.(component.prompt)}
              >
                {component.label}
              </button>
            );
          case "image":
            return (
              <figure className="genui-card genui-image" key={`${component.type}-${index}`}>
                <img src={component.src} alt={component.alt} loading="lazy" referrerPolicy="no-referrer" />
                {component.title && <figcaption>{component.title}</figcaption>}
              </figure>
            );
          case "map":
            return (
              <section className="genui-card genui-map" key={`${component.type}-${index}`}>
                <h3>{component.title}</h3>
                <p>{component.location}</p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(component.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open map
                </a>
              </section>
            );
        }
      })}
    </div>
  );
}
