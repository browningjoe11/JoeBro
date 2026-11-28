import { guessCounty, type PropertyInput } from "../../core/contacts";
import { SelectField, TextAreaField, TextField } from "../../ui";

export function PropertyFields({
  value,
  onChange,
  errors,
  canChangePrimary,
}: {
  value: PropertyInput;
  onChange: (v: PropertyInput) => void;
  errors: Record<string, string>;
  /** False for the only property, which is always the main one. */
  canChangePrimary: boolean;
}) {
  const set = <K extends keyof PropertyInput>(key: K, v: PropertyInput[K]) => onChange({ ...value, [key]: v });
  return (
    <div className="settings-form">
      <TextField label="Name" value={value.label} placeholder="Home, Rental, Beach house" onChange={(e) => set("label", e.target.value)} autoComplete="off" />
      <TextField label="Street address" value={value.street} error={errors.street} onChange={(e) => set("street", e.target.value)} autoComplete="off" />
      <div className="settings-grid-pair">
        <TextField label="Unit" value={value.unit} placeholder="Apt, suite" onChange={(e) => set("unit", e.target.value)} autoComplete="off" />
        <TextField
          label="City"
          value={value.city}
          error={errors.city}
          onChange={(e) => {
            // Fill the county from the city, unless someone picked one by hand.
            const auto = !value.county || value.county === guessCounty(value.city);
            onChange({ ...value, city: e.target.value, county: auto ? guessCounty(e.target.value) : value.county });
          }}
          autoComplete="off"
        />
      </div>
      <div className="settings-grid-pair">
        <TextField label="State" value={value.state} error={errors.state} maxLength={2} onChange={(e) => set("state", e.target.value.toUpperCase())} autoComplete="off" />
        <TextField label="ZIP" inputMode="numeric" value={value.zip} error={errors.zip} onChange={(e) => set("zip", e.target.value)} autoComplete="off" />
      </div>
      <SelectField label="County" value={value.county} onChange={(e) => set("county", e.target.value as PropertyInput["county"])} info="Filled in from the city when it can tell. Used later for routing and permits.">
        <option value="">Not sure</option>
        <option>Kent</option>
        <option>Sussex</option>
        <option>New Castle</option>
        <option>Other</option>
      </SelectField>
      <TextAreaField label="Access notes" value={value.accessNotes} placeholder="Gate codes, dogs, parking, lockbox" onChange={(e) => set("accessNotes", e.target.value)} />
      {canChangePrimary && (
        <label className="check-row">
          <input type="checkbox" checked={value.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} />
          <span>
            Main property
            <small>Shown first and picked by default on new tickets.</small>
          </span>
        </label>
      )}
    </div>
  );
}
