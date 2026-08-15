"use strict";
const { extractWith } = require("./common.js");
function extract(documentLike) { return extractWith(documentLike, { provider: "outlook", inbox: ["[role=main]", "[data-app-section=mail]"], rows: ["[role=option]", "[data-convid]"], unread: ["is-unread", "unread"], sender: ["[data-testid=sender]", "[data-automationid=sender]"], subject: ["[data-testid=subject]", "[data-automationid=subject]"] }); }
module.exports = { extract };
