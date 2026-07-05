/**
 * 预览端点 — 将生成的 Next.js 应用渲染为可交互 HTML。
 * React 由 esbuild 服务端打包内联，零 CDN 依赖。
 * Server Actions 被 mock 为有状态的浏览器内存 store。
 */
import { readCodeFromDisk } from '@/lib/code-gen';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { transformSync, buildSync } from 'esbuild';
import path from 'node:path';

// ============================================================
// React 打包缓存
// ============================================================
let _reactBundleCache: string | null = null;

function getReactBundle(): string {
  if (_reactBundleCache) return _reactBundleCache;
  try {
    const cwd = process.cwd();
    const result = buildSync({
      stdin: {
        contents: [
          `import * as React from 'react';`,
          `import * as ReactDOM from 'react-dom/client';`,
          `globalThis.React = React;`,
          `globalThis.ReactDOM = ReactDOM;`,
          `globalThis.ReactCreateRoot = ReactDOM.createRoot;`,
        ].join('\n'),
        resolveDir: cwd,
        loader: 'tsx',
      },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2020',
      minify: false,
      write: false,
      nodePaths: [path.join(cwd, 'node_modules')],
    });
    _reactBundleCache = result.outputFiles[0]?.text || '';
    console.log(`[Preview] React bundle: ${(_reactBundleCache.length / 1024).toFixed(0)}KB`);
    return _reactBundleCache;
  } catch (e) {
    console.error('[Preview] React bundle failed:', e);
    return '';
  }
}

// ============================================================
// JSX 转译
// ============================================================
function transpileTsx(code: string): string {
  try {
    const result = transformSync(code, {
      loader: 'tsx',
      jsx: 'transform',
      target: 'es2020',
    });
    let js = result.code;
    // 处理 export 语句（浏览器普通 script 不支持）
    js = js.replace(/export\s+default\s+function\s+(\w+)/g, 'function $1');
    js = js.replace(/export\s+default\s+class\s+(\w+)/g, 'class $1');
    js = js.replace(/export\s+default\s+/g, 'var __defaultExport = ');
    js = js.replace(/export\s+(async\s+)?function\s+/g, 'function ');
    js = js.replace(/export\s+(const|let|var)\s+/g, '$1 ');
    js = js.replace(/export\s*\{[^}]*\};?\s*/g, '');
    js = js.replace(/export\s+\*\s+from\s+['"][^'"]+['"];?\s*/g, '');
    js = js.replace(/import\s+.*?from\s+['"][^'"]+['"];?\s*/g, '');
    return js;
  } catch (e) {
    return 'console.error("Compile error: ' + String(e).replace(/"/g, '\\"') + '");';
  }
}

// ============================================================
// 预处理：mock Next.js 专用导入
// ============================================================
function prepareCodeForBrowser(code: string): string {
  let t = code;
  t = t.replace(/^['"]use (client|server)['"];?\s*/gm, '');
  t = t.replace(/import\s+\{[^}]*\}\s+from\s+['"]next\/[^'"]+['"];?\s*/g, '');
  t = t.replace(/import\s+\{[^}]*\}\s+from\s+['"]@\/lib\/db['"];?\s*/g, '');

  // @/lib/schema → 引用全局 store
  t = t.replace(
    /import\s+\{([^}]*)\}\s+from\s+['"]@\/lib\/schema['"];?\s*/g,
    (_m, names) =>
      (names as string).trim().split(',').map((s: string) => s.trim())
        .map((n) => 'var ' + n + ' = window.__previewSchema;').join('\n')
  );

  // 动作导入 → 有状态 mock（@/app/actions、./actions、../actions 等）
  t = t.replace(
    /import\s+\{([^}]*)\}\s+from\s+['"](?:@\/app\/|\.\.?\/)actions?['"];?\s*/g,
    (_m, names) => {
      const fns = (names as string).trim().split(',').map((s: string) => s.trim());
      return fns.map((name) => {
        const lower = name.toLowerCase();
        if (/(?:^get|^fetch|^list|^load|^find|^query|^read)/.test(lower)) {
          return 'var ' + name + ' = function() { console.log("[Mock] ' + name + ' called, items:", window.__previewData.length); return Promise.resolve(window.__previewData.slice()); };';
        }
        if (/(?:^add|^create|^insert|^save)/.test(lower)) {
          return 'var ' + name + ' = function(data) { console.log("[Mock] ' + name + ' called, data:", data, "type:", typeof data); try { var extracted = (data && typeof data.get === "function" ? Object.fromEntries(data.entries()) : data) || {}; var item = Object.assign({ id: window.__previewNextId++, createdAt: new Date().toISOString(), completed: 0, title: "" }, extracted); window.__previewData.unshift(item); window.__previewTick(); console.log("[Mock] ' + name + ' success, item:", item); return Promise.resolve(item); } catch(e) { console.error("[Mock] ' + name + ' error:", e); return Promise.reject(e); } };';
        }
        if (/(?:^delete|^remove|^destroy)/.test(lower)) {
          return 'var ' + name + ' = function(id) { console.log("[Mock] ' + name + ' called, id:", id); window.__previewData = window.__previewData.filter(function(item) { return item.id !== id; }); window.__previewTick(); return Promise.resolve({ success: true }); };';
        }
        if (/(?:^update|^edit|^modify|^change)/.test(lower)) {
          return 'var ' + name + ' = function(id, data) { console.log("[Mock] ' + name + ' called, id:", id, "data:", data, "type:", typeof data); var found = window.__previewData.find(function(item) { return item.id === id; }); if (found) { if (typeof data === "string") { found.title = data; } else if (data && typeof data.get === "function") { try { var d = Object.fromEntries(data.entries()); if (d.title) found.title = d.title; } catch(e) { console.error("FormData error:", e); } } else if (typeof data === "object") { Object.keys(data).forEach(function(k) { found[k] = data[k]; }); } } window.__previewTick(); return Promise.resolve(found || { error: "Not found" }); };';
        }
        if (/(?:^toggle|^complete|^mark|^check)/.test(lower)) {
          return 'var ' + name + ' = function(id, val) { console.log("[Mock] ' + name + ' called, id:", id, "val:", val); var found = window.__previewData.find(function(item) { return item.id === id; }); if (found) { found.completed = typeof val === "boolean" ? val : !found.completed; } window.__previewTick(); return Promise.resolve(found || { error: "Not found" }); };';
        }
        return 'var ' + name + ' = function() { console.log("[Mock] ' + name + ' called (generic)"); return Promise.resolve({ success: true }); };';
      }).join('\n');
    }
  );

  // 其他 @/ 导入 → 移除
  t = t.replace(/import\s+.*?\s+from\s+['"]@\/[^'"]+['"];?\s*/g, '');
  // import type → 移除（纯类型，无运行时效果）
  t = t.replace(/import\s+type\s+\{[^}]*\}\s+from\s+['"][^'"]+['"];?\s*/g, '');
  // 剩余相对路径导入 → 移除
  t = t.replace(/import\s+\{[^}]*\}\s+from\s+['"]\.\.?\/[^'"]+['"];?\s*/g, '');
  return t;
}

function extractComponentName(code: string, filePath: string): string {
  const m = code.match(/export\s+default\s+function\s+(\w+)/);
  if (m) return m[1];
  const funcs = code.match(/function\s+(\w+)\s*\(/g);
  if (funcs) {
    const last = funcs[funcs.length - 1].match(/function\s+(\w+)/);
    if (last) return last[1];
  }
  return filePath.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || 'App';
}

// ============================================================
// GET
// ============================================================
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const id = parseInt(projectId, 10);
  if (isNaN(id)) return NextResponse.json({ error: '无效的项目 ID' }, { status: 400 });

  try {
    let files = await readCodeFromDisk(id);
    if (files.length === 0) {
      const p = await db.query.projects.findFirst({ where: eq(projects.id, id) });
      if (p?.codeSnapshot && Array.isArray(p.codeSnapshot)) {
        files = p.codeSnapshot as unknown as { filePath: string; content: string }[];
      }
    }
    if (files.length === 0) {
      return NextResponse.json({ error: '项目没有生成的代码文件' }, { status: 404 });
    }

    const mainFile =
      files.find((f) => f.filePath === 'app/page.tsx' || f.filePath === 'src/app/page.tsx') ||
      files.find((f) => f.filePath.includes('page.tsx')) ||
      files.find((f) => f.filePath.endsWith('.tsx'));
    if (!mainFile) {
      return NextResponse.json({ error: '项目中未找到可预览的页面组件' }, { status: 404 });
    }

    const componentName = extractComponentName(mainFile.content, mainFile.filePath);
    const prepared = prepareCodeForBrowser(mainFile.content);
    const transpiled = transpileTsx(prepared);
    const reactBundle = getReactBundle();

    let appName = '预览应用';
    const pkgFile = files.find((f) => f.filePath === 'package.json');
    if (pkgFile) {
      try { appName = JSON.parse(pkgFile.content).name || appName; } catch { /* */ }
    }

    const html = buildHTML(transpiled, componentName, appName, reactBundle);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    });
  } catch (error) {
    console.error('预览生成错误:', error);
    return NextResponse.json({ error: '预览生成失败' }, { status: 500 });
  }
}

// ============================================================
// HTML 模板构建
// ============================================================
function buildHTML(
  transpiledCode: string,
  componentName: string,
  appName: string,
  reactBundle: string
): string {
  const escapedAppName = esc(appName);
  const escapedComponent = esc(componentName);

  const safeReact = reactBundle || '';
  const safeTranspiled = transpiledCode || 'console.error("No compiled code");';

  // 手动拼接 HTML，避免模板字面量 ${} 冲突
  const htmlParts = [
    '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8"/>\n',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0"/>\n',
    '<title>', escapedAppName, ' — 预览</title>\n',
    '<style>\n',
    '*,::before,::after{box-sizing:border-box;margin:0;padding:0}\n',
    'body{font-family:system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;background:#f8fafc}\n',
    '#root{min-height:100vh}\n',
    '#preview-loader{position:fixed;top:0;left:0;right:0;z-index:99998}\n',
    '#preview-bar{width:0%;height:3px;background:linear-gradient(90deg,#3b82f6,#8b5cf6);transition:width .3s ease;border-radius:0 2px 2px 0}\n',
    '#preview-status{display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:10px}\n',
    '#preview-status-text{color:#64748b;font-size:14px;font-family:monospace}\n',
    '#preview-status-detail{color:#94a3b8;font-size:12px}\n',
    '#preview-badge{position:fixed;bottom:8px;right:8px;background:#1e293b;color:#94a3b8;font-size:11px;padding:3px 8px;border-radius:4px;z-index:99999;opacity:.6;pointer-events:none}\n',
    '.preview-error{max-width:600px;margin:80px auto;padding:24px;font-family:monospace;font-size:13px}\n',
    '.preview-error h2{color:#dc2626;margin-bottom:12px}\n',
    '.preview-error pre{background:#1e293b;color:#f1f5f9;padding:16px;border-radius:8px;overflow:auto;white-space:pre-wrap;max-height:400px;font-size:12px}\n',
    '</style>\n</head>\n<body>\n',
    '<div id="preview-loader"><div id="preview-bar"></div></div>\n',
    '<div id="root">\n  <div id="preview-status">\n',
    '    <svg width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="none" stroke="#e2e8f0" stroke-width="3"/><circle cx="16" cy="16" r="14" fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="88" stroke-dashoffset="66"><animateTransform attributeName="transform" type="rotate" from="0 16 16" to="360 16 16" dur="1s" repeatCount="indefinite"/></circle></svg>\n',
    '    <div id="preview-status-text">正在初始化...</div>\n',
    '    <div id="preview-status-detail"></div>\n  </div>\n</div>\n',
    '<div id="preview-badge">🔍 ', escapedAppName, '</div>\n\n',
    '<script>', safeReact, '</script>\n\n',
    // 主脚本（必须在 Tailwind CDN 之前，否则 CDN 加载慢会阻塞主脚本）
    '<script>\n(function() {\n',
    'var bar = document.getElementById("preview-bar");\n',
    'var text = document.getElementById("preview-status-text");\n',
    'var detail = document.getElementById("preview-status-detail");\n',
    'var rootEl = document.getElementById("root");\n\n',

    'function progress(pct, msg, d) {\n',
    '  bar.style.width = pct + "%";\n',
    '  if (msg) text.textContent = msg;\n',
    '  if (d !== undefined) detail.textContent = d;\n',
    '}\n\n',

    'function fail(title, errMsg) {\n',
    '  rootEl.innerHTML = "<div class=\\"preview-error\\"><h2>⚠️ " + title + "</h2>',
    '<p style=\\"color:#64748b;margin-bottom:12px\\">预览渲染失败</p>',
    '<pre>" + (errMsg || "").replace(/&/g,"&amp;").replace(/</g,"&lt;") + "</pre>',
    '<p style=\\"margin-top:12px;color:#94a3b8;font-size:12px\\">可尝试刷新重试，或检查浏览器控制台 (F12)</p></div>";\n',
    '}\n\n',

    'progress(10, "初始化 React...");\n',
    'var startTime = Date.now();\n',
    'var maxWait = 10000;\n\n',

    'function waitForReact() {\n',
    '  if (window.React && window.ReactDOM && window.ReactDOM.createRoot) {\n',
    '    initApp();\n',
    '  } else if (Date.now() - startTime > maxWait) {\n',
    '    fail("React 未加载", "请检查网络连接后刷新重试。");\n',
    '  } else {\n',
    '    var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);\n',
    '    progress(15 + Math.min((Date.now() - startTime) / maxWait * 20, 20), "等待 React 就绪...", "已等 " + elapsed + "s");\n',
    '    setTimeout(waitForReact, 200);\n',
    '  }\n',
    '}\n\n',

    'function initApp() {\n  try {\n',
    '    var R = React;\n',
    '    var useState = R.useState, useEffect = R.useEffect, useCallback = R.useCallback,\n',
    '        useMemo = R.useMemo, useRef = R.useRef;\n',
    // 安全的 useOptimistic 实现（React 打包版本可能不支持此 hook）
    // 简化 but 正确的 useOptimistic polyfill
    '    var useOptimistic = function(state, reducer) {\n',
    '      var updates = useState([]);\n',
    '      var items = updates[0];\n',
    '      var setUpdates = updates[1];\n',
    '      var prevState = useRef(state);\n',
    // base state 变化 → 清除乐观更新
    '      if (prevState.current !== state) { prevState.current = state; if (items.length) setUpdates([]); }\n',
    // 累加所有乐观更新到 base state
    '      var result = state;\n',
    '      for (var i = 0; i < items.length; i++) { result = reducer(result, items[i]); }\n',
    '      var addItem = useCallback(function(u) { setUpdates(function(p) { return p.concat([u]); }); }, []);\n',
    '      return [result, addItem];\n',
    '    };\n',
    '    var useTransition = R.useTransition || function() { return [false, function(cb) { cb(); }]; };\n',
    '    var createContext = R.createContext, useContext = R.useContext, Fragment = R.Fragment;\n',
    '    var createRoot = ReactDOM.createRoot;\n\n',

    // 预览数据 store（mock Server Actions 共享此数据）
    '    window.__previewNextId = 4;\n',
    '    window.__previewData = [\n',
    '      { id: 1, title: "示例：完成项目报告", completed: false, createdAt: new Date().toISOString() },\n',
    '      { id: 2, title: "示例：购买生活用品", completed: true, createdAt: new Date(Date.now()-86400000).toISOString() },\n',
    '      { id: 3, title: "示例：阅读技术文档", completed: false, createdAt: new Date(Date.now()-172800000).toISOString() }\n',
    '    ];\n',
    '    window.__previewSchema = {\n',
    '      findMany: function() { return window.__previewData.slice(); },\n',
    '      findFirst: function(filter) {\n',
    '        var items = window.__previewData;\n',
    '        for (var k in (filter || {})) { items = items.filter(function(item) { return item[k] === filter[k]; }); }\n',
    '        return items[0] || null;\n',
    '      }\n',
    '    };\n',
    '    window.__previewTick = function() { console.log("[Preview] data updated", window.__previewData.length, "items"); };\n',
    '    console.log("[Preview] Store ready, samples:", window.__previewData.length);\n\n',

    // ===== fetch 拦截：将 /api/* 请求路由到预览数据 store =====
    '    var __originalFetch = window.fetch;\n',
    '    window.fetch = function(url, options) {\n',
    '      var urlStr = typeof url === "string" ? url : (url.url || url.href || "");\n',
    '      console.log("[Fetch] " + ((options && options.method) || "GET") + " " + urlStr);\n',
    '      if (/\\/api\\/todos?/i.test(urlStr)) {\n',
    '        var method = (options && options.method) || "GET";\n',
    '        if (method === "GET") {\n',
    '          return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve(window.__previewData.slice()); } });\n',
    '        }\n',
    '        if (method === "POST") {\n',
    '          var body = options.body;\n',
    '          if (typeof body === "string") { try { body = JSON.parse(body); } catch(e) {} }\n',
    '          return Promise.resolve({ ok: true, status: 201, json: function() { return Promise.resolve(body); } });\n',
    '        }\n',
    '        return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve(window.__previewData.slice()); } });\n',
    '      }\n',
    '      // 其他请求走原始 fetch\n',
    '      return __originalFetch.apply(window, arguments);\n',
    '    };\n',
    '    console.log("[Preview] fetch interceptor ready");\n\n',

    // Next.js mock
    '    window.revalidatePath = function() {};\n',
    '    window.redirect = function(u) { window.location.href = u; };\n',
    '    window.notFound = function() { rootEl.innerHTML = "<div style=\\"padding:40px;text-align:center\\"><h1>404</h1></div>"; };\n',
    '    window.useRouter = function() { return { push: function(u){history.pushState({},"",u)}, replace: function(u){history.replaceState({},"",u)}, back: function(){history.back()} }; };\n',
    '    window.usePathname = function() { return location.pathname; };\n',
    '    window.useSearchParams = function() { return new URLSearchParams(location.search); };\n',
    '    window.Image = function(p) { return R.createElement("img", p); };\n',
    '    window.Link = function(p) { return R.createElement("a", {href:p.href}, p.children); };\n\n',

    '    var revalidatePath = window.revalidatePath, redirect = window.redirect, notFound = window.notFound;\n',
    '    var useRouter = window.useRouter, usePathname = window.usePathname, useSearchParams = window.useSearchParams;\n',
    '    var Image = window.Image, Link = window.Link;\n\n',

    '    progress(80, "编译组件代码...");\n\n',

    // 注入编译后的组件代码
    safeTranspiled, '\n\n',

    '    progress(92, "挂载组件...", "', escapedComponent, '");\n\n',

    '    var Component = ', componentName, ';\n',
    '    if (typeof Component !== "function" && typeof __defaultExport !== "undefined") Component = __defaultExport;\n',
    '    if (typeof Component !== "function") {\n',
    '      fail("组件未找到", "已编译代码但未找到默认导出组件 ', escapedComponent, '。");\n',
    '      return;\n',
    '    }\n\n',

    '    progress(98, "渲染中...");\n',
    '    var root = createRoot(rootEl);\n',

    // 错误边界包裹组件，防止白屏
    '    var EB = React.forwardRef(function(p, r) {\n',
    '      try {\n',
    '        return p.children;\n',
    '      } catch(e) {\n',
    '        return React.createElement("div", {className:"preview-error"},\n',
    '          React.createElement("h2",null,"组件错误"),\n',
    '          React.createElement("pre",null,e&&e.message||String(e)));\n',
    '      }\n',
    '    });\n',
    '    root.render(React.createElement(Component));\n\n',

    '    progress(100, "✅ 完成");\n',
    '    setTimeout(function() {\n',
    '      document.getElementById("preview-loader").style.opacity = "0";\n',
    '      document.getElementById("preview-loader").style.transition = "opacity .5s";\n',
    '    }, 400);\n',

    '  } catch (err) {\n',
    '    var msg = err instanceof Error ? err.message + "\\n" + (err.stack || "") : String(err);\n',
    '    fail("代码渲染错误", msg);\n',
    '    console.error("Preview error:", err);\n',
    '  }\n}\n\n',

    'if (window.tailwind) {\n',
    '  tailwind.config = { theme: { extend: { fontFamily: { sans: ["system-ui","-apple-system","sans-serif"] } } } };\n',
    '}\n\n',

    'progress(12, "加载 Tailwind CSS...");\n',
    'waitForReact();\n',
    '})();\n</script>\n',
    '<script src="https://cdn.tailwindcss.com"></script>\n',
    '</body>\n</html>',
  ];

  return htmlParts.join('');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
