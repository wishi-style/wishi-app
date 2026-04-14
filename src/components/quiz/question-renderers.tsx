"use client";

interface Option {
  value: string;
  label: string;
  imageUrl?: string | null;
}

interface QuestionProps {
  options: Option[];
  value: unknown;
  onChange: (value: unknown) => void;
}

export function SingleSelectQuestion({ options, value, onChange }: QuestionProps) {
  const selected = value as string | null;
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full border px-6 py-3 text-sm font-medium transition-all ${
            selected === opt.value
              ? "border-black bg-black text-white"
              : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function MultiSelectQuestion({ options, value, onChange }: QuestionProps) {
  const selected = (value as string[]) ?? [];

  function toggle(v: string) {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v));
    } else {
      onChange([...selected, v]);
    }
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`rounded-full border px-6 py-3 text-sm font-medium transition-all ${
            selected.includes(opt.value)
              ? "border-black bg-black text-white"
              : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function TextQuestion({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <textarea
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer..."
      rows={3}
      className="w-full max-w-lg rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-800 placeholder:text-stone-400 focus:border-black focus:outline-none"
    />
  );
}

export function ImagePickerQuestion({ options, value, onChange }: QuestionProps) {
  const selected = (value as string[]) ?? [];

  function toggle(v: string) {
    if (selected.includes(v)) {
      onChange(selected.filter((s) => s !== v));
    } else {
      onChange([...selected, v]);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
            selected.includes(opt.value)
              ? "border-black bg-stone-50"
              : "border-stone-200 hover:border-stone-400"
          }`}
        >
          {opt.imageUrl && (
            <div className="h-24 w-24 overflow-hidden rounded-lg bg-stone-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={opt.imageUrl}
                alt={opt.label}
                className="h-full w-full object-cover"
              />
            </div>
          )}
          <span className="text-sm font-medium text-stone-700">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
