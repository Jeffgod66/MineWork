"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const adapters = {
  gmail: require("../mail-adapters/gmail.js"),
  outlook: require("../mail-adapters/outlook.js"),
  netease: require("../mail-adapters/netease.js"),
  qqmail: require("../mail-adapters/qqmail.js")
};

function node(text = "", attributes = {}, options = {}) {
  return {
    textContent: text,
    getAttribute: (name) => attributes[name] ?? null,
    hasAttribute: (name) => Object.hasOwn(attributes, name),
    classList: { contains: (name) => (attributes.class || "").split(/\s+/).includes(name) },
    querySelector: (selector) => options.children?.[selector] || null,
    querySelectorAll: (selector) => options.lists?.[selector] || []
  };
}
function documentFor(map) { return { querySelector: (selector) => map.one?.[selector] || null, querySelectorAll: (selector) => map.all?.[selector] || [] }; }
function fixture(provider, count = 2) {
  const config = {
    gmail: { inbox: "[role=main]", row: "tr.zA", unread: "zE", sender: "[email]", subject: "[data-thread-perm-id]" },
    outlook: { inbox: "[role=main]", row: "[role=option]", unread: "is-unread", sender: "[data-testid=sender]", subject: "[data-testid=subject]" },
    netease: { inbox: "#dvContainer", row: ".js-mn-item", unread: "unread", sender: ".m-sender", subject: ".m-subject" },
    qqmail: { inbox: "#folder", row: ".mail-list-item", unread: "unread", sender: ".mail-sender", subject: ".mail-subject" }
  }[provider];
  const rows = Array.from({ length: count }, (_, index) => node("", { class: config.unread, "data-message-id": `${provider}-${index}` }, { children: {
    [config.sender]: node(`  Sender ${index}  `), [config.subject]: node(` Subject\n${index} `)
  } }));
  return documentFor({ one: { [config.inbox]: node() }, all: { [config.row]: rows } });
}

for (const provider of Object.keys(adapters)) {
  test(`${provider}: extracts recognized unread rows with a safe output shape`, () => {
    const result = adapters[provider].extract(fixture(provider));
    assert.deepEqual(Object.keys(result).sort(), ["messages", "provider", "status", "unreadCount"]);
    assert.equal(result.provider, provider); assert.equal(result.status, "ready"); assert.equal(result.unreadCount, 2);
    assert.deepEqual(result.messages[0], { key: `${provider}-0`, sender: "Sender 0", subject: "Subject 0" });
  });
  test(`${provider}: unavailable when neither inbox nor badge can be recognized`, () => {
    assert.deepEqual(adapters[provider].extract(documentFor({})), { provider, status: "unavailable", reason: "inbox-unrecognized" });
  });
  test(`${provider}: reports ready zero only from a recognized empty inbox`, () => {
    const doc = fixture(provider, 0);
    assert.deepEqual(adapters[provider].extract(doc), { provider, status: "ready", unreadCount: 0, messages: [] });
  });
}

test("adapters use a trustworthy badge above summary capacity and cap safe summaries", () => {
  const long = "x".repeat(300);
  const rows = Array.from({ length: 25 }, (_, i) => node("", { class: "zE" }, { children: { "[email]": node(long), "[data-thread-perm-id]": node(long) } }));
  const doc = documentFor({ one: { "[role=main]": node(), "[aria-label*=unread]": node("", { "aria-label": "27 unread" }) }, all: { "tr.zA": rows } });
  const result = adapters.gmail.extract(doc);
  assert.equal(result.unreadCount, 27); assert.equal(result.messages.length, 20);
  assert.equal(Array.from(result.messages[0].sender).length, 120); assert.equal(Array.from(result.messages[0].subject).length, 240);
  assert.match(result.messages[0].key, /^gmail:/);
  assert.deepEqual(Object.keys(result.messages[0]).sort(), ["key", "sender", "subject"]);
});

test("selector variations identify Outlook unread via aria state", () => {
  const row = node("", { "aria-label": "Unread message" }, { children: { "[data-testid=sender]": node("A"), "[data-testid=subject]": node("B") } });
  const doc = documentFor({ one: { "[role=main]": node() }, all: { "[role=option]": [row] } });
  assert.equal(adapters.outlook.extract(doc).unreadCount, 1);
});
