// The consulting page, at #/consult.
//
// Same overlay mechanism as the dossiers and for the same reason: the WebGL
// flight behind this page must not be torn down for a navigation. The brief
// asks for this page to be calmer than the rest, so the motion here is one
// fade and nothing else, and every claim on it is a number that appears
// somewhere else on the site with its measurement attached.

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const SERVICES = [
  {
    tag: '01',
    title: 'Operator on loan',
    price: 'retainer, part-time',
    body: 'Chief-of-staff work for a founder who has more surface area than hours. Own the parts nobody else has time to own: the P&L nobody reconciles, the vendor nobody chases, the roadmap nobody sequences. I ran the Puja vertical at Sri Mandir this way.',
    proof: 'Owned a category P&L; cut ops load 40% with Python and LLM automations.',
  },
  {
    tag: '02',
    title: 'Automation audit',
    price: 'two to three weeks, fixed',
    body: 'I sit with the team doing the repetitive thing, time it, and come back with the three processes worth automating and the ones that are not. Then I build the first one so the estimate has evidence behind it.',
    proof: 'Publishing pipeline: 500+ SKUs, four hours of manual work down to twelve minutes.',
  },
  {
    tag: '03',
    title: 'Local-first AI',
    price: 'project',
    body: 'Most workloads sold as "needs a frontier model" run on an 8 GB card for the price of the electricity. I will tell you which of yours do, measure both, and stand up the one that wins. If the API is genuinely cheaper I will say so.',
    proof: 'Every model number on this site is a real local benchmark, including the one that came out badly.',
  },
  {
    tag: '04',
    title: 'Zero to team',
    price: 'engagement',
    body: 'Standing up an organisation that did not exist: hiring, structure, process, funding. Jarurat Care went from nothing to 160+ staff with attrition under 5%, which is the number I am proudest of.',
    proof: '0 to 160+ staff, <5% attrition, ₹10L+ CSR raised.',
  },
];

const PROCESS = [
  ['Call', 'Thirty minutes. You describe the problem, I tell you whether I am the right person. About a third of the time the answer is no and that call is still free.'],
  ['Scope', 'A written brief: what gets done, what it costs, what "finished" means, and what I need from you. No engagement starts without it.'],
  ['Build', 'Weekly written updates with the numbers attached. If a number moves the wrong way you hear about it that week, not at the end.'],
  ['Hand over', 'Documentation, a walkthrough, and the code. Everything I build is yours and runs without me.'],
];

export function mountConsult({ audio, onOpen, onClose, warp } = {}) {
  const root = el('div');
  root.id = 'consult';
  root.className = 'overlay';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Consulting');
  root.tabIndex = -1;
  document.body.appendChild(root);

  const P = window.PROFILE || {};
  const contact = P.contact || {};

  root.innerHTML = `
    <div class="dos-bar">
      <span class="mono" style="color:var(--faint);font-size:11px;letter-spacing:.22em">// AVAILABLE</span>
      <button class="btn" data-close>close</button>
    </div>
    <div class="dos-wrap">
      <p class="dos-eyebrow">Consulting</p>
      <h2 class="dos-title">Work with me</h2>
      <p class="dos-manifesto">Strategy that survives contact with the build, because the same person does both.</p>
      <div class="dos-thesis">
        <p>Most consulting fails in the gap between the deck and the repository. The person who wrote the
        strategy cannot ship it, and the person who ships it was not in the room when it was decided. I
        do both halves, which means the plan is constrained by what the system can actually do from the
        first meeting rather than the third.</p>
        <p>Everything below is priced as a scope, not an hourly rate, because an hourly rate pays me to
        be slow.</p>
      </div>

      <p class="dos-h3">What that looks like</p>
      <div class="con-grid">
        ${SERVICES.map((s) => `
          <article class="card">
            <div class="row" style="margin-bottom:12px">
              <span class="mono" style="color:var(--accent)">${s.tag}</span>
              <span class="mono" style="color:var(--faint);font-size:11px">${s.price}</span>
            </div>
            <h3>${s.title}</h3>
            <p>${s.body}</p>
            <p class="mono" style="font-size:11.5px;color:var(--good);border-top:1px solid var(--line);padding-top:12px;margin:14px 0 0">${s.proof}</p>
          </article>`).join('')}
      </div>

      <p class="dos-h3" style="margin-top:52px">How it runs</p>
      <ol class="con-steps">
        ${PROCESS.map(([t, b], i) => `
          <li><span class="mono">0${i + 1}</span><div><h4>${t}</h4><p>${b}</p></div></li>`).join('')}
      </ol>

      <p class="dos-h3" style="margin-top:52px">The receipts</p>
      <div class="dos-numbers" id="con-nums"></div>

      <div class="con-cta">
        <h3>Thirty minutes, no deck.</h3>
        <p>Tell me what is stuck. If I am not the right person I will say so on the call and point you at
        who is.</p>
        <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:20px">
          <a class="btn cta" href="mailto:${contact.email || 'ubhayvatsaanand@gmail.com'}?subject=Consulting">email</a>
          ${contact.whatsapp ? `<a class="btn" href="${contact.whatsapp}">whatsapp</a>` : ''}
          ${contact.linkedin ? `<a class="btn" href="${contact.linkedin}">linkedin</a>` : ''}
          <a class="btn" href="#hero" data-close>back to the flight</a>
        </div>
        <p class="mono" style="font-size:11.5px;color:var(--faint);margin:18px 0 0">
          Based in Bengaluru. Comfortable across IST and CET; US timezones by arrangement.</p>
      </div>
    </div>`;

  // The numbers are lifted from the same objects the rest of the page renders,
  // so this section cannot drift from the career section above it.
  const nums = root.querySelector('#con-nums');
  const picked = [
    { value: '40%', label: 'ops load removed', note: 'Sri Mandir puja vertical, via Python and LLM automations.' },
    { value: '160+', label: 'staff, from zero', note: 'Jarurat Care Foundation, attrition held under 5%.' },
    { value: '12 min', label: 'was four hours', note: 'Publishing pipeline across 500+ SKUs.' },
    { value: '-32%', label: 'API latency', note: 'Middleware work at Visteon; team velocity up 35%.' },
  ];
  nums.innerHTML = picked.map((n) => `
    <div class="dos-num"><b>${n.value}</b><span>${n.label}</span><small>${n.note}</small></div>`).join('');

  function open({ push = true } = {}) {
    warp?.();
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('open'));
    document.body.style.overflow = 'hidden';
    root.scrollTop = 0;
    root.focus();
    if (push && location.hash !== '#/consult') location.hash = '#/consult';
    onOpen?.();
    audio?.blip?.();
  }

  function close({ push = true } = {}) {
    root.classList.remove('open');
    document.body.style.overflow = '';
    setTimeout(() => { if (!root.classList.contains('open')) root.hidden = true; }, 260);
    if (push && location.hash === '#/consult') history.pushState('', '', location.pathname + location.search);
    onClose?.();
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) {
      // The "back to the flight" link is also an anchor; let it move the page.
      if (e.target.closest('a')) { close({ push: false }); return; }
      e.preventDefault();
      close();
    }
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden) { e.preventDefault(); close(); }
  });
  addEventListener('hashchange', () => {
    if (location.hash === '#/consult') open({ push: false });
    else if (!root.hidden) close({ push: false });
  });
  if (location.hash === '#/consult') open({ push: false });

  return { open, close, isOpen: () => !root.hidden };
}
