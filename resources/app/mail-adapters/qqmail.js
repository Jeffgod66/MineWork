"use strict";
const { extractWith } = require("./common.js");
function extract(documentLike) { return extractWith(documentLike, { provider: "qqmail", inbox: ["#folder", "#mailList"], rows: [".mail-list-item", ".qm_mail_list_item"], unread: ["unread", "qm_unread"], sender: [".mail-sender", ".qm_from"], subject: [".mail-subject", ".qm_subject"] }); }
module.exports = { extract };
