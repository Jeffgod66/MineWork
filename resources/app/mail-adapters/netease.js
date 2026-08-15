"use strict";
const { extractWith } = require("./common.js");
function extract(documentLike) { return extractWith(documentLike, { provider: "netease", inbox: ["#dvContainer", "#mailContentContainer"], rows: [".js-mn-item", ".mD"], unread: ["unread", "wM"], sender: [".m-sender", ".nui-addr-name"], subject: [".m-subject", ".nui-txt-ellipsis"] }); }
module.exports = { extract };
