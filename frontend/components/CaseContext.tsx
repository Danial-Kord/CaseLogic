"use client";

import { useState } from "react";

interface Party {
  name: string;
  role: string;
}

export default function CaseContext() {
  const [incidentDate, setIncidentDate] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("California");
  const [parties, setParties] = useState<Party[]>([{ name: "", role: "" }]);
  const [eventDescription, setEventDescription] = useState("");
  const [conditions, setConditions] = useState("");
  const [legalClaims, setLegalClaims] = useState("");
  const [damages, setDamages] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [evidenceNotes, setEvidenceNotes] = useState("");

  function updateParty(idx: number, field: keyof Party, value: string) {
    const next = [...parties];
    next[idx] = { ...next[idx], [field]: value };
    setParties(next);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) setFiles([...files, ...Array.from(e.target.files)]);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    console.log({
      incidentDate, city, state, parties, eventDescription,
      conditions, legalClaims, damages, evidenceNotes,
      fileNames: files.map((f) => f.name),
    });
    alert("Case context saved.");
  }

  const inputCls =
    "w-full rounded border border-brand-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent";
  const textareaCls = `${inputCls} resize-y min-h-[5rem]`;
  const labelCls = "block text-xs text-brand-muted mb-1";

  return (
    <form onSubmit={handleSave} className="flex flex-col h-full">
      <h2 className="text-sm font-semibold mb-3">Case Context</h2>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        <div>
          <label className={labelCls}>Date</label>
          <input
            type="date"
            className={inputCls}
            value={incidentDate}
            onChange={(e) => setIncidentDate(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>City</label>
            <input
              className={inputCls}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Los Angeles"
            />
          </div>
          <div>
            <label className={labelCls}>State</label>
            <select
              className={inputCls}
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option>California</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className={labelCls}>People involved</label>
            <button
              type="button"
              onClick={() => setParties([...parties, { name: "", role: "" }])}
              className="text-xs text-brand-accent hover:underline"
            >
              + add
            </button>
          </div>
          {parties.map((p, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <input
                className={inputCls}
                value={p.name}
                onChange={(e) => updateParty(i, "name", e.target.value)}
                placeholder="Name"
              />
              <input
                className={`${inputCls} w-32`}
                value={p.role}
                onChange={(e) => updateParty(i, "role", e.target.value)}
                placeholder="Role"
              />
              {parties.length > 1 && (
                <button
                  type="button"
                  onClick={() => setParties(parties.filter((_, j) => j !== i))}
                  className="text-xs text-brand-error px-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div>
          <label className={labelCls}>What happened</label>
          <textarea
            className={textareaCls}
            value={eventDescription}
            onChange={(e) => setEventDescription(e.target.value)}
            placeholder="Describe the event"
            rows={5}
          />
        </div>

        <div>
          <label className={labelCls}>Conditions</label>
          <textarea
            className={textareaCls}
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="Weather, road, traffic…"
          />
        </div>

        <div>
          <label className={labelCls}>Claims / theories</label>
          <textarea
            className={textareaCls}
            value={legalClaims}
            onChange={(e) => setLegalClaims(e.target.value)}
            placeholder="Negligence, statutes you suspect apply…"
          />
        </div>

        <div>
          <label className={labelCls}>Damages / injuries</label>
          <textarea
            className={textareaCls}
            value={damages}
            onChange={(e) => setDamages(e.target.value)}
            placeholder="Medical, lost wages, property…"
          />
        </div>

        <div>
          <label className={labelCls}>Files</label>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            className="block w-full text-xs text-brand-muted file:mr-2 file:rounded file:border-0 file:bg-brand-accent file:px-2 file:py-1 file:text-xs file:text-white hover:file:bg-blue-700"
          />
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={i} className="flex items-center justify-between text-xs">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    className="text-brand-error ml-2"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className={labelCls}>Evidence notes</label>
          <textarea
            className={textareaCls}
            value={evidenceNotes}
            onChange={(e) => setEvidenceNotes(e.target.value)}
            placeholder="Police report #, witnesses, photos…"
          />
        </div>
      </div>

      <div className="border-t border-brand-border pt-3 mt-2">
        <button
          type="submit"
          className="w-full rounded bg-brand-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Save
        </button>
      </div>
    </form>
  );
}
