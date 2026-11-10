#!/usr/bin/env node
// Hynish Archive MCP server (stdio). No dependencies. Needs Node 18 or newer.
//
// What it serves: the Hynish Archive (Panchsheel Hynish, Plot GH-08A, Sector-1, Greater Noida West) as eight read-only tools.
// Where the data comes from:
//   public  - HYNISH_PUBLIC_DIR (a folder holding records.json, text.json ...) or, when unset, the live site's /api/v1/ files.
//   private - HYNISH_PRIVATE_DIR, only when set and present on this computer. Nothing private is ever fetched from the web.
// Try a tool without an MCP client:  node hynish-mcp.mjs --call search '{"query":"election"}'
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const VERSION = '1.0.0';
const BASE = (process.env.HYNISH_BASE_URL || 'https://protbhai.github.io/hynish-archive').replace(/\/+$/, '');
const PUB_DIR = process.env.HYNISH_PUBLIC_DIR || '';
const PRIV_DIR = process.env.HYNISH_PRIVATE_DIR || '';
const log = (...a) => process.stderr.write('[hynish-mcp] ' + a.join(' ') + '\n');

// ---------- loading ----------
async function readSet(dir, url) {
  const get = async name => {
    if (dir) { const p = path.join(dir, name); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
    const r = await fetch(`${url}/${name}`, { headers: { 'user-agent': 'hynish-mcp/' + VERSION } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Could not read ${url}/${name}: HTTP ${r.status}`);
    return r.json();
  };
  const [index, records, text, changes, society] = await Promise.all(['index.json', 'records.json', 'text.json', 'changes.json', 'society.json'].map(get));
  if (!records) throw new Error(`No records.json in ${dir || url}`);
  return { index: index || {}, records, text: text || [], changes: (changes && changes.changes) || [], society };
}

let storeP = null;
const store = () => (storeP ||= build());

async function build() {
  const sets = { public: await readSet(PUB_DIR, BASE + '/api/v1') };
  if (PRIV_DIR && fs.existsSync(path.join(PRIV_DIR, 'records.json'))) sets.private = await readSet(PRIV_DIR, '');
  const S = { sets, editions: Object.keys(sets), recs: [], byUid: new Map(), texts: new Map(), hidden: new Set() };
  for (const ed of S.editions) {
    for (const r of sets[ed].records) { S.recs.push(r); S.byUid.set(r.uid, r); }
    for (const t of sets[ed].text) S.texts.set(t.uid, t);
  }
  // When both editions are loaded the same record can be in both. Show it once:
  // same id and title -> keep the private wording (fuller); same file -> keep the public copy (it has a web link).
  if (sets.private) {
    const pubSha = new Map(sets.public.records.filter(r => r.type === 'document').map(r => [r.sha256, r]));
    for (const r of sets.private.records) {
      if (r.type === 'document') { const p = pubSha.get(r.sha256); if (p) { S.hidden.add(r.uid); p.also = r.uid; } continue; }
      const p = S.byUid.get('pub:' + r.id);
      if (p && p.type === r.type && p.title === r.title) { S.hidden.add(p.uid); r.also = p.uid; }
    }
  }
  S.asOf = sets.public.index.as_of || '';
  S.units = indexUnits(S);
  log(`loaded ${S.recs.length} records, ${S.texts.size} document texts, editions: ${S.editions.join(' + ')}`);
  return S;
}

// ---------- search ----------
const STOP = new Set('a an and are as at be by did do does for from has have how i in is it of on or that the this to was were what when where which who why with about any tell me show'.split(' '));
// A few society words in both scripts, so an English question also finds Hindi text and the other way round.
const GLOSS = [['election', 'चुनाव', 'निर्वाचन'], ['parking', 'पार्किंग'], ['meeting', 'बैठक', 'मीटिंग'], ['order', 'आदेश'], ['notice', 'सूचना', 'नोटिस'],
  ['maintenance', 'रखरखाव', 'मेंटेनेंस'], ['electricity', 'बिजली', 'विद्युत'], ['court', 'न्यायालय', 'कोर्ट'], ['builder', 'बिल्डर'], ['society', 'सोसाइटी', 'समिति'],
  ['president', 'अध्यक्ष'], ['secretary', 'सचिव'], ['treasurer', 'कोषाध्यक्ष'], ['registrar', 'रजिस्ट्रार', 'निबंधक'], ['handover', 'हस्तांतरण', 'हैंडओवर'],
  ['resident', 'निवासी'], ['member', 'सदस्य'], ['account', 'लेखा', 'खाता'], ['audit', 'ऑडिट', 'लेखापरीक्षा'], ['complaint', 'शिकायत'], ['authority', 'प्राधिकरण'],
  ['petition', 'याचिका'], ['water', 'पानी', 'जल'], ['lift', 'लिफ्ट'], ['tower', 'टावर'], ['flat', 'फ्लैट']];
const SYN = new Map();
for (const g of GLOSS) for (const w of g) SYN.set(stem(w), g.map(stem).filter(x => x !== stem(w)));

function stem(t) {
  if (/^[a-z]+$/.test(t) && t.length > 3) {
    if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
    if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  }
  return t;
}
const tokens = s => ((s || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []).map(stem);

function indexUnits(S) {
  const units = [];
  const add = (rec, title, body, extra) => {
    const tf = new Map(); let len = 0;
    for (const t of tokens(title)) { tf.set(t, (tf.get(t) || 0) + 3); len += 1; }
    for (const t of tokens(body)) { tf.set(t, (tf.get(t) || 0) + 1); len += 1; }
    units.push({ rec, tf, len: Math.max(len, 1), body, ...extra });
  };
  for (const r of S.recs) {
    if (S.hidden.has(r.uid)) continue;
    const f = r.fields || {};
    const more = ['number', 'parties', 'forum', 'prayers', 'outcome', 'missing', 'holder', 'lead', 'years'].map(k => f[k]).filter(x => typeof x === 'string' && x).join('\n');
    add(r, `${r.title} ${r.id}`, [r.text, more, r.topic].filter(Boolean).join('\n'), { where: 'record' });
    const t = S.texts.get(r.uid);
    if (t) for (const pg of t.pages) {
      const txt = pg.text || '';
      for (let i = 0; i < txt.length; i += 1200) add(r, '', txt.slice(i, i + 1300), { where: 'document text', page: pg.page });
    }
  }
  const df = new Map(); let total = 0;
  for (const u of units) { total += u.len; for (const t of u.tf.keys()) df.set(t, (df.get(t) || 0) + 1); }
  return { units, df, avg: total / Math.max(units.length, 1) };
}

function quote(body, terms) {
  const flat = (body || '').replace(/\s+/g, ' ').trim();
  const low = flat.toLowerCase(); let at = -1;
  for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0) return flat.slice(0, 260) + (flat.length > 260 ? ' …' : '');
  const a = Math.max(0, at - 90), b = Math.min(flat.length, at + 190);
  return (a > 0 ? '… ' : '') + flat.slice(a, b) + (b < flat.length ? ' …' : '');
}

const asList = v => (Array.isArray(v) ? v : v ? [v] : []).map(x => String(x).toLowerCase());
const TYPE_ALIAS = { events: 'event', sources: 'source', cases: 'case', findings: 'finding', documents: 'document', chapters: 'chapter', facts: 'fact', 'missing records': 'missing' };
function keep(r, a) {
  const types = asList(a.types).map(t => TYPE_ALIAS[t] || t);
  if (types.length && !types.includes(r.type)) return false;
  if (a.edition && a.edition !== 'all' && r.edition !== a.edition) return false;
  if (a.topic && !(r.topic || '').toLowerCase().includes(String(a.topic).toLowerCase())) return false;
  if (a.case && r.case !== String(a.case).toUpperCase()) return false;
  if ((a.date_from || a.date_to) && !r.date) return false;
  if (a.date_from && r.date < a.date_from) return false;
  if (a.date_to && r.date > a.date_to + '￿') return false;
  return true;
}

function brief(S, r, extra = {}) {
  const o = { uid: r.uid, id: r.id, type: r.type, edition: r.edition, visibility: r.visibility, title: r.title };
  if (r.date) o.date = r.date;
  if (r.topic) o.topic = r.topic;
  o.evidence = r.evidence;
  Object.assign(o, extra);
  const link = r.url || r.file_url; if (link) o.link = link;
  if (r.also) o.also_in_other_edition = r.also;
  o.last_checked = r.last_checked;
  return o;
}

async function search(a) {
  const S = await store(); const q = tokens(a.query).filter(t => !STOP.has(t));
  if (!q.length) throw new Error('Give a query with at least one search word.');
  const { units, df, avg } = S.units; const N = units.length; const k1 = 1.4, b = 0.6;
  const terms = []; for (const t of new Set(q)) { terms.push([t, 1, t]); for (const s of SYN.get(t) || []) terms.push([s, 0.7, t]); }
  const phrase = q.length > 1 ? (a.query || '').toLowerCase().replace(/\s+/g, ' ').trim() : '';
  const best = new Map();
  for (const u of units) {
    if (!keep(u.rec, a)) continue;
    let score = 0; const hit = new Set();
    for (const [t, w, root] of terms) {
      const f = u.tf.get(t); if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
      score += w * idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * u.len / avg)); hit.add(root);
    }
    if (!score) continue;
    score *= Math.pow(hit.size / new Set(q).size, 1.5);
    if (phrase && u.body.toLowerCase().replace(/\s+/g, ' ').includes(phrase)) score *= 1.6;
    const cur = best.get(u.rec.uid);
    if (!cur) best.set(u.rec.uid, { u, score, pages: u.page ? [u.page] : [] });
    else { if (u.page && !cur.pages.includes(u.page)) cur.pages.push(u.page); if (score > cur.score) { cur.u = u; cur.score = score; } }
  }
  let hits = [...best.values()];
  const byScore = (x, y) => y.score - x.score;
  hits.sort(a.sort === 'newest' ? (x, y) => (y.u.rec.date || '').localeCompare(x.u.rec.date || '') || byScore(x, y) : byScore);
  const limit = Math.min(Math.max(a.limit || 10, 1), 50);
  const words = terms.map(t => t[0]);
  return {
    query: a.query, total_matches: hits.length, shown: Math.min(limit, hits.length), sort: a.sort === 'newest' ? 'newest' : 'relevance',
    results: hits.slice(0, limit).map(h => brief(S, h.u.rec, {
      found_in: h.u.where, ...(h.u.page ? { page: h.u.page } : {}), ...(h.pages.length > 1 ? { matching_pages: h.pages.sort((x, y) => x - y).slice(0, 20) } : {}),
      quote: quote(h.u.body, words), score: Math.round(h.score * 100) / 100,
    })),
  };
}

// ---------- the other tools ----------
function find(S, id, type) {
  const s = String(id || '').trim(); if (!s) return [];
  const exact = S.byUid.get(s) || S.byUid.get(s.replace(/^public:/i, 'pub:').replace(/^private:/i, 'priv:'));
  if (exact) return [exact];
  const up = s.toUpperCase();
  let m = S.recs.filter(r => r.id.toUpperCase() === up && (!type || r.type === type));
  const shown = m.filter(r => !S.hidden.has(r.uid));
  return shown.length ? shown : m;
}
const srcDetail = (S, r) => (r.sources || []).map(id => S.byUid.get(`${r.uid.split(':')[0]}:${id}`)).filter(Boolean)
  .map(s => ({ id: s.id, title: s.title, evidence: s.evidence, ...(s.date ? { date: s.date } : {}), ...(s.url || s.file_url ? { link: s.url || s.file_url } : {}), ...(s.file ? { file: s.file } : {}) }));
const sameEd = (r, x) => x.edition === r.edition;

async function getRecord(a) {
  const S = await store(); const m = find(S, a.id);
  if (!m.length) throw new Error(`No record with id "${a.id}". Use search to find the id.`);
  return {
    records: m.map(r => {
      const o = { ...r, sources_detail: srcDetail(S, r) }; delete o.sources;
      if (r.type === 'source') {
        o.cited_by = S.recs.filter(x => sameEd(r, x) && (x.sources || []).includes(r.id)).map(x => ({ uid: x.uid, type: x.type, title: x.title, ...(x.date ? { date: x.date } : {}) }));
        const d = r.file && S.recs.find(x => sameEd(r, x) && x.type === 'document' && x.file === r.file); if (d) o.document = { uid: d.uid, text_status: d.fields.text_status };
      }
      if (r.type === 'case') o.events = S.recs.filter(x => sameEd(r, x) && x.type === 'event' && x.case === r.id).sort((x, y) => y.date.localeCompare(x.date)).map(x => ({ uid: x.uid, date: x.date, title: x.title, evidence: x.evidence }));
      if (r.type === 'document') o.text_available = S.texts.has(r.uid) ? 'yes: call get_document' : 'no: ' + r.fields.text_status;
      if (r.also) o.also_in_other_edition = r.also;
      return o;
    }),
  };
}

async function timeline(a) {
  const S = await store();
  let ev = S.recs.filter(r => r.type === 'event' && !S.hidden.has(r.uid) && keep(r, a));
  ev.sort((x, y) => x.date.localeCompare(y.date)); if (a.order !== 'oldest') ev.reverse();
  const limit = Math.min(Math.max(a.limit || 40, 1), 200);
  return { total: ev.length, shown: Math.min(limit, ev.length), order: a.order === 'oldest' ? 'oldest first' : 'newest first',
    events: ev.slice(0, limit).map(r => brief(S, r, { text: r.text, ...(r.case ? { case: r.case } : {}), sources: r.sources })) };
}

async function caseStatus(a) {
  const S = await store(); const today = new Date().toISOString().slice(0, 10);
  const cases = S.recs.filter(r => r.type === 'case' && !S.hidden.has(r.uid) && (!a.edition || a.edition === 'all' || r.edition === a.edition));
  const eventsOf = c => S.recs.filter(x => sameEd(c, x) && x.type === 'event' && x.case === c.id).sort((x, y) => y.date.localeCompare(x.date));
  const head = c => {
    const ev = eventsOf(c); const next = ev.filter(e => e.date > today).pop();
    return { ...brief(S, c), number: c.fields.number, forum: c.fields.forum, record_held: c.evidence,
      last_event: ev.find(e => e.date <= today) ? (({ date, title, evidence }) => ({ date, title, evidence }))(ev.find(e => e.date <= today)) : null,
      next_date: next ? { date: next.date, title: next.title, evidence: next.evidence } : null };
  };
  if (!a.case) return { cases: cases.map(head), note: 'Call again with case set to an id (C01) or a case number for the full picture.' };
  const q = String(a.case).toLowerCase().trim(); const digits = q.replace(/[^0-9/]/g, '');
  const m = cases.filter(c => c.id.toLowerCase() === q || c.uid.toLowerCase() === q || (digits.length >= 4 && c.fields.number.includes(digits)) || c.title.toLowerCase().includes(q) || c.fields.number.toLowerCase().includes(q));
  if (!m.length) throw new Error(`No case matches "${a.case}". Known cases: ${cases.map(c => `${c.id} (${c.fields.number})`).join('; ')}`);
  return {
    cases: m.map(c => {
      const ev = eventsOf(c); const src = new Set([...(c.sources || []), ...ev.flatMap(e => e.sources || [])]);
      return { ...head(c), parties_as_titled: c.fields.parties, summary: c.text, prayers: c.fields.prayers, outcome: c.fields.outcome, still_missing: c.fields.missing,
        events: ev.map(e => ({ uid: e.uid, date: e.date, title: e.title, evidence: e.evidence, text: e.text })),
        missing_records: S.recs.filter(x => sameEd(c, x) && x.type === 'missing' && (x.sources || []).some(s => src.has(s))).map(x => ({ uid: x.uid, title: x.title, status: x.evidence, holder: x.fields.holder })),
        documents: S.recs.filter(x => sameEd(c, x) && x.type === 'document' && ((x.sources || []).some(s => src.has(s)) || [...src].some(s => { const so = S.byUid.get(`${c.uid.split(':')[0]}:${s}`); return so && so.file && so.file === x.file; })))
          .map(x => ({ uid: x.uid, title: x.title, text_status: x.fields.text_status, ...(x.file_url ? { link: x.file_url } : {}) })),
        sources_detail: srcDetail(S, c) };
    }),
    note: `Status is as recorded on ${S.asOf}. This archive is not a live court feed; check the court's own site for anything later.`,
  };
}

async function getDocument(a) {
  const S = await store(); let m = find(S, a.id, 'document').filter(r => r.type === 'document');
  if (!m.length) { const q = String(a.id || '').toLowerCase(); m = S.recs.filter(r => r.type === 'document' && !S.hidden.has(r.uid) && q.length > 3 && (r.title.toLowerCase().includes(q) || r.file.toLowerCase().includes(q))).slice(0, 5); }
  if (!m.length) throw new Error(`No document matches "${a.id}". Use search with types ["document"].`);
  if (m.length > 1) return { several_match: m.map(r => brief(S, r, { file: r.file, text_status: r.fields.text_status })), note: 'Call again with one uid.' };
  const r = m[0]; const t = S.texts.get(r.uid) || (r.fields.duplicateOf && S.texts.get(`${r.uid.split(':')[0]}:${r.fields.duplicateOf}`));
  const out = { ...brief(S, r), file: r.file, sha256: r.sha256, pages: r.fields.pages, bytes: r.fields.bytes, review: r.fields.review, text_status: r.fields.text_status, sources_detail: srcDetail(S, r) };
  if (!t) return { ...out, text: null, note: 'No text is held for this file. ' + (r.file_url ? 'Open the link to read the original.' : 'The original is in the private edition on the owner\'s computer.') };
  const max = Math.min(Math.max(a.max_chars || 12000, 500), 60000); const pages = [];
  if (a.page) { const p = t.pages.find(x => x.page === a.page); if (!p) throw new Error(`Page ${a.page} not found; the text has pages 1 to ${t.pages.length}.`); pages.push({ page: p.page, text: p.text.slice(0, max), ...(p.text.length > max ? { cut: true } : {}) }); }
  else {
    let used = 0; const from = Math.max(a.from_page || 1, 1);
    for (const p of t.pages) {
      if (p.page < from) continue;
      if (used && used + p.text.length > max) { out.next_page = p.page; break; }
      pages.push({ page: p.page, text: p.text.slice(0, max), ...(p.text.length > max ? { cut: true } : {}) }); used += p.text.length;
    }
  }
  return { ...out, text_pages_total: t.pages.length, extracted_with: t.extracted_with, text: pages,
    note: 'Machine-extracted text. For exact wording, check the original file.' + (r.edition === 'public' ? ' Phone, PAN, Aadhaar-style and flat numbers are masked in this text.' : '') };
}

async function changesSince(a) {
  const S = await store(); const since = String(a.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('Give date as YYYY-MM-DD.');
  const out = { since, log: [] };
  for (const ed of S.editions) for (const c of S.sets[ed].changes) if (c.date >= since) out.log.push({ edition: ed, ...c });
  const ev = S.recs.filter(r => r.type === 'event' && !S.hidden.has(r.uid) && r.date >= since).sort((x, y) => y.date.localeCompare(x.date));
  out.events_dated_on_or_after = ev.slice(0, 60).map(r => brief(S, r, { text: r.text }));
  out.tracking_began = S.sets.public.changes[0]?.date || null;
  out.note = `The change log starts on ${out.tracking_began}; edits before that day are not in it. "log" lists records added, changed or removed in the archive. "events_dated_on_or_after" lists things that happened on or after ${since}, whenever they were added.`;
  return out;
}

async function missingRecords(a) {
  const S = await store();
  const m = S.recs.filter(r => r.type === 'missing' && !S.hidden.has(r.uid) && keep(r, a) && (!a.status || r.evidence.toLowerCase().includes(String(a.status).toLowerCase())));
  return { total: m.length, missing: m.map(r => brief(S, r, { status: r.evidence, why_it_matters: r.text, holder: r.fields.holder, lead: r.fields.lead, sources: r.sources })) };
}

async function societyFacts(a) {
  const S = await store(); const soc = S.sets.public.society; const q = tokens(a.query).filter(t => !STOP.has(t));
  let facts = S.recs.filter(r => r.type === 'fact');
  if (q.length) facts = facts.filter(r => { const tk = new Set(tokens(r.title + ' ' + r.text)); return q.some(t => tk.has(t)); });
  const srcIds = soc ? soc.sources : [];
  return { plot: soc?.plot, facts: facts.map(r => ({ uid: r.uid, label: r.title, value: r.text, evidence: r.evidence })), ...(q.length ? {} : { towers: soc?.towers }),
    caveat: soc?.caveat, sources_detail: srcIds.map(id => S.byUid.get('pub:' + id)).filter(Boolean).map(s => ({ id: s.id, title: s.title, evidence: s.evidence, link: s.url || s.file_url || '' })),
    limitations: S.sets.public.index.limitations, last_checked: soc?.last_checked };
}

// ---------- tool list ----------
const str = d => ({ type: 'string', description: d }); const num = d => ({ type: 'integer', description: d });
const EDITION = { type: 'string', enum: ['all', 'public', 'private'], description: 'Which edition to read. Default: all that are loaded.' };
const TOOLS = [
  { name: 'search', fn: search, description: 'Search the Hynish Archive (Panchsheel Hynish society, Greater Noida West): events, cases, findings, sources, missing records, society facts and the full text of held documents, in English or Hindi. Returns the best matches with a short quote, the evidence label and a link. Start here when you do not know a record id.',
    inputSchema: { type: 'object', required: ['query'], properties: { query: str('Words to look for.'), types: { type: 'array', items: { type: 'string', enum: ['event', 'source', 'case', 'finding', 'missing', 'document', 'chapter', 'fact'] }, description: 'Only these record types.' }, topic: str('Only this topic, e.g. Elections.'), edition: EDITION, date_from: str('YYYY-MM-DD. Only dated records on or after this day.'), date_to: str('YYYY-MM-DD or a year. Only dated records on or before it.'), sort: { type: 'string', enum: ['relevance', 'newest'], description: 'Default relevance.' }, limit: num('How many results, 1 to 50. Default 10.') } } },
  { name: 'get_record', fn: getRecord, description: 'One full record by id (for example T37, S07, C01, F04, M05, DOC056, or pub:T37 / priv:T37), with its sources spelled out. For a case it adds the dated events; for a source it adds what cites it.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str('Record id or uid.') } } },
  { name: 'timeline', fn: timeline, description: 'Dated events of the Hynish story between two dates, newest first unless asked. Can be narrowed to a topic or a case.',
    inputSchema: { type: 'object', properties: { date_from: str('YYYY-MM-DD.'), date_to: str('YYYY-MM-DD or a year.'), topic: str('e.g. Elections, Electricity, Land & project.'), case: str('Case id, e.g. C01.'), order: { type: 'string', enum: ['newest', 'oldest'] }, edition: EDITION, limit: num('1 to 200. Default 40.') } } },
  { name: 'case_status', fn: caseStatus, description: 'Court and authority cases about Hynish. With no input: the list of cases with last event and next date. With a case id or number: parties as the court titles them, forum, summary, prayers, outcome, every dated event, held documents and what is still missing. Status is as of the archive date, not live.',
    inputSchema: { type: 'object', properties: { case: str('Case id (C01), case number (17915/2025) or words from its title. Leave out for the list.'), edition: EDITION } } },
  { name: 'get_document', fn: getDocument, description: 'The text of a held document by page, with its link, file hash and review status. Long documents come in parts: follow next_page.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: str('Document id (DOC056) or uid, or words from its title.'), page: num('Only this page.'), from_page: num('Start from this page.'), max_chars: num('Most characters to return. Default 12000.') } } },
  { name: 'changes_since', fn: changesSince, description: 'What is new since a date: records added, changed or removed in the archive (from its change log), and events dated on or after that day.',
    inputSchema: { type: 'object', required: ['date'], properties: { date: str('YYYY-MM-DD.') } } },
  { name: 'missing_records', fn: missingRecords, description: 'Records the archive does not hold yet: what each is, why it matters, who holds it, and any lead.',
    inputSchema: { type: 'object', properties: { topic: str('Only this topic.'), status: str('Missing, Partly or Mostly.'), edition: EDITION } } },
  { name: 'society_facts', fn: societyFacts, description: 'Fixed facts about the society from the approved plan and project records: plot, towers, floors, homes, parking, green area, electrical load, common facilities, with sources.',
    inputSchema: { type: 'object', properties: { query: str('Optional words to narrow the facts, e.g. parking.') } } },
];

async function call(name, args) {
  const t = TOOLS.find(x => x.name === name); if (!t) throw new Error(`Unknown tool "${name}".`);
  const out = await t.fn(args || {}); const S = await store();
  out.archive = { as_of: S.asOf, editions_loaded: S.editions, note: 'Dated archive, not a live status service. Quote the evidence label with any fact; news reports are attributed, not adopted. Not legal advice.'
    + (S.sets.private ? ' Records marked visibility "private" are for the owner only: do not repeat them in anything public.' : '') };
  return out;
}

// ---------- command-line test mode ----------
if (process.argv[2] === '--call') {
  try { console.log(JSON.stringify(await call(process.argv[3], JSON.parse(process.argv[4] || '{}')), null, 1)); }
  catch (e) { console.error('Error: ' + e.message); process.exit(1); }
  process.exit(0);
}

// ---------- MCP over stdio (JSON-RPC, one message per line) ----------
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return; // a notification: nothing to answer
  try {
    if (method === 'initialize') {
      const want = params?.protocolVersion;
      return send({ jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOLS.includes(want) ? want : PROTOCOLS[0], capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'hynish-archive', title: 'Hynish Archive', version: VERSION },
        instructions: 'Read-only knowledge base on Panchsheel Hynish (Plot GH-08A, Sector-1, Greater Noida West). Use search first, then get_record, case_status or get_document. Every answer carries an evidence label, a date and the archive\'s as_of date. Say those with any fact you repeat.' } });
    }
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } })) } });
    if (method === 'tools/call') {
      try { const out = await call(params?.name, params?.arguments); return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 1) }], isError: false } }); }
      catch (e) { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true } }); }
    }
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } }); }
}
const rl = readline.createInterface({ input: process.stdin, terminal: false });
const pending = new Set();
rl.on('line', line => {
  line = line.trim(); if (!line) return;
  let msg; try { msg = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
  for (const m of Array.isArray(msg) ? msg : [msg]) { const p = handle(m).finally(() => pending.delete(p)); pending.add(p); }
});
rl.on('close', async () => { await Promise.allSettled([...pending]); process.exit(0); });
