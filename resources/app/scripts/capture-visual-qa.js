"use strict";

const fs = require("node:fs");
const path = require("node:path");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function connect(port, targetFragment) {
  let pages;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      break;
    } catch {
      await delay(150);
    }
  }
  const page = pages?.find((item) => item.type === "page" && (!targetFragment || item.url.includes(targetFragment)));
  if (!page) throw new Error("MineWork visual-QA target was not found");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  };

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timeout = setTimeout(() => {
      pending.delete(callId);
      reject(new Error(`CDP ${method} timed out`));
    }, 8000);
    pending.set(callId, {
      resolve: (value) => { clearTimeout(timeout); resolve(value); },
      reject: (error) => { clearTimeout(timeout); reject(error); }
    });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  return { call, socket };
}

async function main() {
  const port = Number(process.argv[2] || 9339);
  const outputDirectory = process.argv[3] || process.env.TEMP;
  const mode = process.argv[4] || "main";
  fs.mkdirSync(outputDirectory, { recursive: true });
  const { call, socket } = await connect(port, mode === "main" ? "index.html" : "island.html");
  console.log(`visual-qa connected ${port} ${mode}`);
  await call("Page.enable");
  await call("Runtime.enable");
  console.log("visual-qa domains enabled");

  if (mode === "island") {
    await delay(900);
    let shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(outputDirectory, "minework-polar-prism-island-collapsed.png"), Buffer.from(shot.data, "base64"));
    await call("Runtime.evaluate", { expression: "setExpanded(true)", returnByValue: true });
    await delay(1300);
    for (const [pageName, pageIndex] of [["overview", 0], ["tasks", 1], ["performance", 5], ["services", 6], ["schedule", 7], ["countdown", 8], ["focus", 9]]) {
      await call("Runtime.evaluate", { expression: `showPage(${pageIndex})`, returnByValue: true });
      await delay(900);
      shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
      const target = path.join(outputDirectory, `minework-polar-prism-island-${pageName}.png`);
      fs.writeFileSync(target, Buffer.from(shot.data, "base64"));
      console.log(target);
    }
    for (const width of [420, 590, 760]) {
      await call("Runtime.evaluate", { expression: `window.resizeTo(${width}, 300)`, returnByValue: true });
      await delay(600);
      shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
      const target = path.join(outputDirectory, `minework-polar-prism-island-${width}px.png`);
      fs.writeFileSync(target, Buffer.from(shot.data, "base64"));
      console.log(target);
    }
    await call("Runtime.evaluate", { expression: "window.resizeTo(590, 300)", returnByValue: true });
    await delay(400);
    await call("Runtime.evaluate", { expression: `showNotificationDelivery({ record: { id: 'qa-1', source: 'mail', type: 'new-mail', title: '新邮件', body: '设计评审会议改到周四上午' }, unreadCount: 3 }); showNotificationDelivery({ record: { id: 'qa-2', source: 'mail', type: 'new-mail', title: '新邮件', body: '周五发布窗口确认' }, unreadCount: 4 })`, returnByValue: true });
    await delay(500);
    shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(outputDirectory, "minework-polar-prism-island-notification-overlay.png"), Buffer.from(shot.data, "base64"));
    await call("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await delay(200);
    shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false, fromSurface: true });
    fs.writeFileSync(path.join(outputDirectory, "minework-polar-prism-island-reduced-motion.png"), Buffer.from(shot.data, "base64"));
    call("Browser.close").catch(() => {});
    await delay(120);
    socket.close();
    return;
  }

  await delay(1800);
  console.log("visual-qa page settled");

  const imageData = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, "../assets/minework.png")).toString("base64")}`;
  await call("Runtime.evaluate", { expression: `
    state.tasks = [
      { id: 't1', date: '2026-08-11', text: '整理今日计划', done: false, priority: 'high' },
      { id: 't2', date: '2026-08-11', text: '完成界面验收', done: true, priority: 'normal' }
    ];
    state.calendarEvents = [
      { id: 'e1', title: '晨间同步', date: '2026-08-11T09:00:00+08:00', remindMinutes: 10 },
      { id: 'e2', title: '项目回顾', date: '2026-08-11T14:30:00+08:00', remindMinutes: 30 }
    ];
    state.selectedDate = '2026-08-11';
    state.calendarCursor = new Date(2026, 7, 1);
    state.notes = [{ id: 'n1', title: '极地棱镜视觉摘录', content: '光感应服务于信息层级，而不是覆盖内容。', tag: 'DESIGN', images: [${JSON.stringify(imageData)}, ${JSON.stringify(imageData)}, ${JSON.stringify(imageData)}], created: new Date().toISOString() }];
    state.books = [{ id: 'b1', title: '设计中的设计', author: '原研哉', status: 'reading', created: new Date().toISOString() }];
    state.favorites = [{ id: 'f1', title: '值得重读的设计文章', url: 'https://example.com/design', created: new Date().toISOString() }];
    state.news = [
      { title: '今日产品与设计热点', url: 'https://example.com/news-1', source: 'Bing News', publishedAt: new Date().toISOString() },
      { title: '效率工具迎来新的交互方式', url: 'https://example.com/news-2', source: '实时资讯', publishedAt: new Date(Date.now() - 3600000).toISOString() }
    ];
    renderNotes(); renderBooks(); renderFavorites(); renderNews(); renderCalendar();
  `, returnByValue: true });
  console.log("visual-qa fixtures rendered");

  const auditPages = ["home", "tasks", "calendar", "weather", "news", "favorites", "notes", "library", "hydration", "reflection", "island", "shortcuts", "countdown", "translate", "performance", "music", "mail", "notifications"];
  for (const pageName of auditPages) {
    console.log(`responsive-audit start ${pageName}`);
    await call("Runtime.evaluate", { expression: `setPage('${pageName}')`, returnByValue: true });
    const audit = await call("Runtime.evaluate", { expression: `(() => {
      const page = document.getElementById('page-${pageName}');
      page.scrollTop = page.scrollHeight;
      const bottomDelta = Math.abs((page.scrollHeight - page.clientHeight) - page.scrollTop);
      const result = {
        viewportWidth: innerWidth,
        pageClientWidth: page.clientWidth,
        pageScrollWidth: page.scrollWidth,
        pageClientHeight: page.clientHeight,
        pageScrollHeight: page.scrollHeight,
        bottomDelta,
        activeCount: document.querySelectorAll('.page.active').length,
        targetActive: page.classList.contains('active')
      };
      page.scrollTop = 0;
      return result;
    })()`, returnByValue: true });
    const metrics = audit.result.value;
    if (metrics.activeCount !== 1 || !metrics.targetActive) throw new Error(`page ${pageName} entered an empty transition state`);
    if (metrics.pageScrollWidth > metrics.pageClientWidth + 1) {
      const overflow = await call("Runtime.evaluate", { expression: `(() => {
        const page = document.getElementById('page-${pageName}');
        const pageRect = page.getBoundingClientRect();
        const offenders = [...page.querySelectorAll('*')].map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            id: element.id,
            className: typeof element.className === 'string' ? element.className : '',
            left: Math.round(rect.left - pageRect.left),
            right: Math.round(rect.right - pageRect.left),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth
          };
        }).filter((item) => item.left < -1 || item.right > page.clientWidth + 1 || item.scrollWidth > item.clientWidth + 1).slice(0, 20);
        const style = getComputedStyle(page);
        const before = getComputedStyle(page, '::before');
        return { offenders, page: { rectWidth: pageRect.width, offsetWidth: page.offsetWidth, clientWidth: page.clientWidth, scrollWidth: page.scrollWidth, cssWidth: style.width, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight, beforeWidth: before.width, beforeRight: before.right }, parent: { clientWidth: page.parentElement.clientWidth, scrollWidth: page.parentElement.scrollWidth } };
      })()`, returnByValue: true });
      throw new Error(`page ${pageName} has horizontal overflow: ${JSON.stringify(metrics)} offenders=${JSON.stringify(overflow.result.value)}`);
    }
    if (metrics.bottomDelta > 1) throw new Error(`page ${pageName} cannot reach its bottom controls: ${JSON.stringify(metrics)}`);
    console.log(`responsive-audit ${pageName} ${JSON.stringify(metrics)}`);
  }

  for (const pageName of ["calendar", "favorites", "notes", "library", "news", "performance", "notifications"]) {
    await call("Runtime.evaluate", { expression: `setPage('${pageName}')`, returnByValue: true });
    const activeState = await call("Runtime.evaluate", { expression: `({ count: document.querySelectorAll('.page.active').length, target: document.getElementById('page-${pageName}').classList.contains('active') })`, returnByValue: true });
    if (activeState.result.value.count !== 1 || !activeState.result.value.target) throw new Error(`page ${pageName} entered an empty transition state`);
    await delay(900);
    if (pageName === "calendar") {
      const scrollState = await call("Runtime.evaluate", { expression: `(() => { const page = document.getElementById('page-calendar'); page.scrollTop = page.scrollHeight; const movedTo = page.scrollTop; page.scrollTop = 0; return { clientHeight: page.clientHeight, scrollHeight: page.scrollHeight, scrollTop: movedTo }; })()`, returnByValue: true });
      console.log(`calendar-scroll ${JSON.stringify(scrollState.result.value)}`);
    }
    const shot = await call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      fromSurface: true
    });
    const target = path.join(outputDirectory, `minework-polar-prism-${pageName}.png`);
    fs.writeFileSync(target, Buffer.from(shot.data, "base64"));
    console.log(target);
  }

  call("Browser.close").catch(() => {});
  await delay(120);
  socket.close();
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
