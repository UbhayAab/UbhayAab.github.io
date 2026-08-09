// A terminal that actually knows things. Backtick opens it anywhere on the page.
//
// It reads the same data the rest of the page renders, so `cat soop` and the
// project card can never disagree. History with the arrow keys, tab completion
// on repo names, and no fake typing delays.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const int = (v) => Number(v || 0).toLocaleString('en-US');
const pad = (s, n) => String(s).padEnd(n);

export function mountTerminal(data) {
  const root = document.getElementById('term');
  const body = document.getElementById('term-body');
  if (!root || !body) return;

  const S = data.stats || {};
  const repos = (S.topRepos || []);
  const feats = (data.projects?.featured) || [];
  const history = [];
  let hIdx = 0;
  let input = null;

  const write = (html, cls = '') => {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.innerHTML = html;
    body.insertBefore(line, body.lastElementChild);
    body.scrollTop = body.scrollHeight;
  };

  const COMMANDS = {
    help: () => [
      'available commands',
      '',
      `  ${pad('whoami', 14)}who this is`,
      `  ${pad('ls', 14)}list repositories`,
      `  ${pad('ls langs', 14)}language breakdown by bytes`,
      `  ${pad('cat <repo>', 14)}details for one repository`,
      `  ${pad('stats', 14)}the summary numbers`,
      `  ${pad('bench', 14)}measured model throughput`,
      `  ${pad('rhythm', 14)}commit heatmap, in ascii`,
      `  ${pad('open <repo>', 14)}open a repository on GitHub`,
      `  ${pad('goto <section>', 14)}scroll to a section`,
      `  ${pad('neofetch', 14)}the obligatory one`,
      `  ${pad('clear', 14)}clear the screen`,
      `  ${pad('exit', 14)}close (or press Esc)`,
    ].join('\n'),

    whoami: () => [
      `<span class="u">Ubhay</span> (@${S.profile?.login || 'UbhayAab'})`,
      '',
      'Builds local-first systems on one 8 GB card.',
      'llama.cpp internals, Supabase products, Electron tools, ad automation.',
      '',
      `${int(S.repos?.total)} repositories, ${S.repos?.public} public, ${int(S.repos?.totalCommits)} commits.`,
      `On GitHub since ${String(S.profile?.createdAt || '').slice(0, 10)}, which is ${int(S.profile?.accountAgeDays)} days.`,
    ].join('\n'),

    ls: (arg) => {
      if (arg === 'langs') {
        return (S.languages || []).slice(0, 12)
          .map((l) => `  ${pad(l.name, 18)}${pad(l.pct.toFixed(1) + '%', 8)}${l.repos} repo${l.repos === 1 ? '' : 's'}`)
          .join('\n');
      }
      if (arg === 'games') return 'quant  tokenize  pagefault  bandit  scraper\n\nScroll to the arcade, or run: goto arcade';
      const list = repos.filter((r) => r.commits > 0);
      return [
        `${list.length} repositories with commits, sorted by commits`,
        '',
        ...list.map((r) => `  ${pad(r.name, 34)}${pad(r.language || '-', 13)}${pad(int(r.commits), 7)}${r.isPrivate ? '<span class="a">private</span>' : ''}`),
      ].join('\n');
    },

    cat: (arg) => {
      if (!arg) return 'usage: cat &lt;repo&gt;';
      const r = repos.find((x) => x.name.toLowerCase() === arg.toLowerCase());
      if (!r) {
        const near = repos.filter((x) => x.name.toLowerCase().includes(arg.toLowerCase())).slice(0, 5);
        return `no repository "${esc(arg)}"${near.length ? `\n\ndid you mean: ${near.map((x) => x.name).join(', ')}` : ''}`;
      }
      const f = feats.find((x) => x.repo === r.name);
      return [
        `<span class="u">${r.name}</span>${r.isPrivate ? '  <span class="a">[private]</span>' : ''}`,
        '',
        r.description ? esc(r.description) : (f ? f.lines.join(' ') : 'no description'),
        '',
        `  ${pad('language', 14)}${r.language || '-'}`,
        `  ${pad('commits', 14)}${int(r.commits)}`,
        `  ${pad('size', 14)}${(r.diskKB / 1024).toFixed(1)} MB`,
        `  ${pad('created', 14)}${r.createdAt.slice(0, 10)}`,
        `  ${pad('last push', 14)}${r.pushedAt.slice(0, 10)}`,
        f ? `  ${pad('stack', 14)}${f.stack.join(', ')}` : '',
        '',
        r.isPrivate ? 'private repository, the link will 404 unless you have access' : `<span class="g">${r.url}</span>`,
      ].filter(Boolean).join('\n');
    },

    stats: () => [
      `  ${pad('repositories', 20)}${int(S.repos?.total)}  (${S.repos?.public} public, ${S.repos?.private} private)`,
      `  ${pad('commits', 20)}${int(S.repos?.totalCommits)}`,
      `  ${pad('languages', 20)}${S.languages?.length}`,
      `  ${pad('tracked source', 20)}${((S.languageTotalBytes || 0) / 1048576).toFixed(0)} MB`,
      `  ${pad('active days (1y)', 20)}${S.contributions?.activeDays} of ${S.contributions?.trackedDays}`,
      `  ${pad('longest streak', 20)}${S.contributions?.longestStreak} days`,
      `  ${pad('night commits', 20)}${((S.rhythm?.nightShare || 0) * 100).toFixed(0)}%  (23:00 to 06:00)`,
      `  ${pad('last push', 20)}${S.latestCommit?.ago} to ${S.latestCommit?.repo}`,
      '',
      `generated ${String(S.generatedAt || '').slice(0, 16).replace('T', ' ')} UTC from ${S.graphqlCost} graphql points`,
    ].join('\n'),

    bench: () => {
      const B = data.bench;
      if (!B) return 'no benchmark data';
      return [
        `${B.host}`,
        `device actually used: <span class="a">${B.device}</span>`,
        '',
        `  ${pad('model', 22)}${pad('size', 9)}${pad('vram', 7)}tok/s`,
        ...B.results.map((r) => `  ${pad(r.model, 22)}${pad(r.sizeGB + ' GB', 9)}${pad(r.gpuFraction === null ? '-' : (r.gpuFraction * 100).toFixed(0) + '%', 7)}${r.genTps ?? 'fail'}`),
        '',
        B.gpuUsed === false
          ? '<span class="a">note:</span> every model reported size_vram = 0. These are CPU numbers\non a machine with an unused GPU in it. Labelled honestly rather than\nquietly presented as GPU results.'
          : '',
      ].filter(Boolean).join('\n');
    },

    rhythm: () => {
      const R = S.rhythm;
      if (!R) return 'no rhythm data';
      const ramp = ' .:-=+*#%@';
      const max = Math.max(1, R.max);
      const out = ['     ' + Array.from({ length: 24 }, (_, h) => (h % 6 === 0 ? String(h).padStart(2, '0') : '  ')).join('').slice(0, 48)];
      for (let d = 0; d < 7; d += 1) {
        let row = `  ${DAYS[d]}  `;
        for (let h = 0; h < 24; h += 1) {
          const v = R.cells[d][h];
          const i = v === 0 ? 0 : Math.max(1, Math.round(Math.sqrt(v / max) * (ramp.length - 1)));
          row += ramp[i] + ramp[i];
        }
        out.push(row);
      }
      out.push('');
      out.push(`  busiest ${DAYS[R.peak.weekday]} ${String(R.peak.hour).padStart(2, '0')}:00 with ${R.peak.count} commits, ${R.sampled} timestamps sampled`);
      return out.join('\n');
    },

    neofetch: () => {
      const L = (S.languages || []).slice(0, 4).map((l) => `${l.name} ${l.pct.toFixed(0)}%`).join(', ');
      const art = [
        '   <span class="a">/\\</span>    ', '  <span class="a">/  \\</span>   ', ' <span class="a">/ /\\ \\</span>  ',
        '<span class="a">/ /  \\ \\</span> ', '<span class="a">\\ \\  / /</span> ', ' <span class="a">\\ \\/ /</span>  ',
        '  <span class="a">\\  /</span>   ', '   <span class="a">\\/</span>    ',
      ];
      const info = [
        `<span class="u">ubhay</span>@<span class="u">github</span>`,
        '-----------------',
        `Repos     ${S.repos?.total} (${S.repos?.private} private)`,
        `Commits   ${int(S.repos?.totalCommits)}`,
        `Languages ${L}`,
        `Uptime    ${int(S.profile?.accountAgeDays)} days`,
        `Shell     the one you are typing in`,
        `GPU       ${data.bench?.gpu?.name || 'unknown'}`,
        `GPU used  ${data.bench?.gpuUsed === false ? 'no, and that is a bug' : 'yes'}`,
      ];
      return art.map((a, i) => `${a}  ${info[i] || ''}`).join('\n');
    },

    open: (arg) => {
      const r = repos.find((x) => x.name.toLowerCase() === (arg || '').toLowerCase());
      if (!r) return `usage: open &lt;repo&gt;`;
      if (r.isPrivate) return `${r.name} is private. Opening anyway, expect a 404.` + (open(r.url, '_blank'), '');
      open(r.url, '_blank');
      return `opening ${r.url}`;
    },

    goto: (arg) => {
      const target = document.getElementById(String(arg || '').toLowerCase());
      if (!target) return 'usage: goto hero|signal|work|rhythm|arcade|receipts|contact';
      close();
      target.scrollIntoView({ behavior: 'smooth' });
      return '';
    },

    clear: () => { [...body.children].slice(0, -1).forEach((n) => n.remove()); return ''; },
    exit: () => { close(); return ''; },
    sudo: () => 'nice try',
  };

  function run(raw) {
    const line = raw.trim();
    write(`<span class="a">$</span> <span class="u">${esc(line)}</span>`);
    if (!line) return;
    history.push(line); hIdx = history.length;
    const [cmd, ...rest] = line.split(/\s+/);
    const fn = COMMANDS[cmd.toLowerCase()];
    if (!fn) {
      write(`<span class="a">${esc(cmd)}</span>: not found. try <span class="u">help</span>`);
      return;
    }
    const out = fn(rest.join(' '));
    if (out) write(out);
  }

  function open_() {
    if (!root.hidden) return;
    root.hidden = false;
    if (!body.children.length) {
      const prompt = document.createElement('div');
      prompt.className = 'term-line';
      prompt.innerHTML = '<span class="a">$</span>';
      input = document.createElement('input');
      input.setAttribute('aria-label', 'Terminal input');
      input.autocomplete = 'off';
      input.spellcheck = false;
      prompt.appendChild(input);
      body.appendChild(prompt);
      write(`<span class="u">ubhay@github</span>  type <span class="a">help</span> for commands, Esc to close`);
      write('');
    }
    input.focus();
  }
  function close() { root.hidden = true; input?.blur(); }

  root.addEventListener('click', (e) => { if (e.target === root) close(); else input?.focus(); });

  addEventListener('keydown', (e) => {
    // Backtick opens it, but not while someone is typing in a real field.
    if (e.key === '`' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) {
      e.preventDefault(); open_(); return;
    }
    if (root.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (document.activeElement !== input) return;

    if (e.key === 'Enter') { e.preventDefault(); const v = input.value; input.value = ''; run(v); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hIdx > 0) input.value = history[--hIdx] || ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ''; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const parts = input.value.split(/\s+/);
      const frag = (parts[parts.length - 1] || '').toLowerCase();
      const pool = parts.length <= 1 ? Object.keys(COMMANDS) : repos.map((r) => r.name);
      const hits = pool.filter((n) => n.toLowerCase().startsWith(frag));
      if (hits.length === 1) { parts[parts.length - 1] = hits[0]; input.value = parts.join(' '); }
      else if (hits.length > 1) write(hits.join('  '));
    }
  });
}
