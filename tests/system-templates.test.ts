import assert from "node:assert/strict";
import test from "node:test";
import {
  SystemTemplate,
  renderSystemTemplate,
} from "@/lib/chat/system-templates";

test("WELCOME interpolates client, plan, and stylist", () => {
  const text = renderSystemTemplate(SystemTemplate.WELCOME, {
    clientFirstName: "Matt",
    planType: "Mini",
    stylistFirstName: "Taylor",
  });
  assert.match(text, /Hi Matt,/);
  assert.match(text, /Mini session with Taylor/);
});

test("SESSION_ACTIVATED uses stylist name", () => {
  const text = renderSystemTemplate(SystemTemplate.SESSION_ACTIVATED, {
    stylistFirstName: "Taylor",
  });
  assert.equal(
    text,
    "Your session is now active. Taylor is ready to start styling!",
  );
});

test("MOODBOARD_DELIVERED uses stylist name", () => {
  const text = renderSystemTemplate(SystemTemplate.MOODBOARD_DELIVERED, {
    stylistFirstName: "Taylor",
  });
  assert.match(text, /Taylor shared a moodboard/);
});

test("STYLEBOARD_DELIVERED uses stylist name", () => {
  const text = renderSystemTemplate(SystemTemplate.STYLEBOARD_DELIVERED, {
    stylistFirstName: "Taylor",
  });
  assert.match(text, /Taylor created a styleboard/);
});

test("RESTYLE_REQUESTED uses client name", () => {
  const text = renderSystemTemplate(SystemTemplate.RESTYLE_REQUESTED, {
    clientFirstName: "Matt",
  });
  assert.match(text, /Matt requested a restyle/);
});

test("END_SESSION_REQUESTED uses requester name", () => {
  const text = renderSystemTemplate(SystemTemplate.END_SESSION_REQUESTED, {
    requesterFirstName: "Matt",
  });
  assert.equal(text, "Matt has requested to end this session.");
});

test("END_SESSION_APPROVED has no variables", () => {
  const text = renderSystemTemplate(SystemTemplate.END_SESSION_APPROVED, {});
  assert.equal(text, "Session end approved. Thank you for styling with Wishi!");
});

test("END_SESSION_DECLINED has no variables", () => {
  const text = renderSystemTemplate(SystemTemplate.END_SESSION_DECLINED, {});
  assert.equal(text, "Session end was declined. The session will continue.");
});

test("SESSION_COMPLETED has no variables", () => {
  const text = renderSystemTemplate(SystemTemplate.SESSION_COMPLETED, {});
  assert.match(text, /session is now complete/);
});

test("IDLE_REMINDER has no variables", () => {
  const text = renderSystemTemplate(SystemTemplate.IDLE_REMINDER, {});
  assert.match(text, /been a while since your last message/);
});

test("unfilled variables remain as {{placeholders}}", () => {
  const text = renderSystemTemplate(SystemTemplate.WELCOME, {
    clientFirstName: "Matt",
    // planType and stylistFirstName intentionally omitted
  });
  // Only the filled variable is interpolated; others stay as placeholders
  assert.match(text, /Hi Matt,/);
  assert.match(text, /\{\{planType\}\}/);
  assert.match(text, /\{\{stylistFirstName\}\}/);
});

test("replaceAll covers repeated placeholders", () => {
  // If a template ever repeats a variable, all occurrences get replaced
  const text = renderSystemTemplate(SystemTemplate.WELCOME, {
    clientFirstName: "Matt",
    planType: "Mini",
    stylistFirstName: "Taylor",
  });
  assert.equal(text.includes("{{"), false);
});

test("all templates in enum have a body", () => {
  // Guard against adding an enum value but forgetting the template body
  for (const key of Object.values(SystemTemplate)) {
    const rendered = renderSystemTemplate(key as SystemTemplate, {});
    assert.ok(
      rendered && rendered.length > 0,
      `Template ${key} produced empty output`,
    );
  }
});
