"use strict";
const { extractWith } = require("./common.js");
function extract(documentLike) { return extractWith(documentLike, { provider: "gmail", inbox: ["[role=main]", "[aria-label='Inbox']"], rows: ["tr.zA", "[role=main] tr"], unread: ["ze", "unread"], sender: ["[email]", ".yX.xY span"], subject: ["[data-thread-perm-id]", ".y6 span"] }); }
module.exports = { extract };
