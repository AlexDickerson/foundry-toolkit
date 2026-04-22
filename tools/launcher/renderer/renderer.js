'use strict';

const grid = document.getElementById('grid');
const refreshBtn = document.getElementById('refresh');

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'title') node.title = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function renderWorktree(root) {
  const nameEl = el('div', { className: 'worktree-name' + (root.isMain ? ' is-main' : ''), text: root.name });
  const pathEl = el('div', { className: 'worktree-path', text: root.path });
  const headInfo = el('div', {}, [nameEl, pathEl]);

  const openFolder = el('button', {
    text: 'Folder',
    title: 'Open in file explorer',
    onclick: () => window.launcher.openFolder(root.path),
  });
  const openTerm = el('button', {
    text: 'Terminal',
    title: 'Open Windows Terminal here',
    onclick: () => window.launcher.openTerminal(root.path),
  });
  const actions = el('div', { className: 'worktree-actions' }, [openFolder, openTerm]);

  const head = el('div', { className: 'worktree-head' }, [headInfo, actions]);

  const apps = root.apps.length
    ? root.apps.map((a) =>
        el(
          'button',
          {
            className: 'app-btn',
            title: `${root.path}\n$ npm run ${a.script}`,
            onclick: () => window.launcher.launch(root.path, a.script),
          },
          [el('span', { className: 'play', text: '▶' }), el('span', { text: a.label })],
        ),
      )
    : [el('div', { className: 'empty', text: 'no dev:* scripts in root package.json' })];

  const appsEl = el('div', { className: 'apps' }, apps);

  return el('section', { className: 'worktree' }, [head, appsEl]);
}

async function render() {
  grid.replaceChildren();
  try {
    const roots = await window.launcher.enumerate();
    for (const root of roots) {
      grid.appendChild(renderWorktree(root));
    }
  } catch (err) {
    grid.appendChild(el('div', { className: 'empty', text: 'Failed to enumerate: ' + err.message }));
  }
}

refreshBtn.addEventListener('click', render);
render();
