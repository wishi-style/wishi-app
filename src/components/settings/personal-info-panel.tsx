"use client";

import { useState, useTransition } from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { updateProfile } from "@/app/(client)/settings/actions";
import { AvatarUpload } from "@/components/profile/avatar-upload";

const GENDER_OPTIONS = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "NON_BINARY", label: "Non-binary" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

const BODY_TYPE_OPTIONS = [
  "Pear",
  "Apple",
  "Hourglass",
  "Rectangle",
  "Inverted Triangle",
  "Athletic",
] as const;

export interface PersonalInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthday: string;
  location: string;
  gender: string;
  height: string;
  bodyType: string;
  occupation: string;
  instagram: string;
  pinterest: string;
}

interface Props {
  avatarUrl: string | null;
  initial: PersonalInfo;
}

const FIELDS: {
  key: keyof PersonalInfo;
  label: string;
  type?: string;
  select?: "gender" | "bodyType";
  readOnly?: boolean;
}[] = [
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email", type: "email", readOnly: true },
  { key: "phone", label: "Phone", type: "tel" },
  { key: "birthday", label: "Birthday", type: "date" },
  { key: "location", label: "Location" },
  { key: "gender", label: "Gender", select: "gender" },
  { key: "height", label: "Height" },
  { key: "bodyType", label: "Body type", select: "bodyType" },
  { key: "occupation", label: "Occupation" },
  { key: "instagram", label: "Instagram" },
  { key: "pinterest", label: "Pinterest" },
];

function genderLabel(value: string): string {
  return GENDER_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function PersonalInfoPanel({ avatarUrl, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState<PersonalInfo>(initial);
  const [draft, setDraft] = useState<PersonalInfo>(initial);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setDraft(info);
    setEditing(true);
  }
  function cancel() {
    setEditing(false);
  }
  function save() {
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(draft)) {
        fd.set(k, v ?? "");
      }
      try {
        await updateProfile(fd);
        setInfo(draft);
        setEditing(false);
        toast.success("Personal info updated");
      } catch {
        toast.error("Could not save changes");
      }
    });
  }

  return (
    <div className="space-y-6">
      <AvatarUpload currentUrl={avatarUrl} />

      {!editing ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => {
              const raw = info[f.key];
              const display =
                f.key === "gender" ? genderLabel(raw) : raw || "—";
              return (
                <div key={f.key}>
                  <p className="mb-1 font-body text-xs uppercase tracking-wider text-muted-foreground">
                    {f.label}
                  </p>
                  <p className="font-body text-sm text-foreground">{display}</p>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={startEdit}
            className="mt-2 inline-flex items-center gap-1.5 font-body text-sm text-primary hover:underline"
          >
            <PencilIcon className="h-3.5 w-3.5" /> Edit
          </button>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <label className="font-body text-xs">{f.label}</label>
                {f.select === "gender" ? (
                  <select
                    value={draft.gender}
                    onChange={(e) =>
                      setDraft({ ...draft, gender: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">—</option>
                    {GENDER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.select === "bodyType" ? (
                  <select
                    value={draft.bodyType}
                    onChange={(e) =>
                      setDraft({ ...draft, bodyType: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">—</option>
                    {BODY_TYPE_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type ?? "text"}
                    value={draft[f.key]}
                    disabled={f.readOnly}
                    onChange={(e) =>
                      setDraft({ ...draft, [f.key]: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-5 py-2 font-body text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              <CheckIcon className="h-3.5 w-3.5" /> {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2 font-body text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              <XIcon className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

