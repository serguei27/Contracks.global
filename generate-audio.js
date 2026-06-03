#!/usr/bin/env node
/**
 * Contracks Global — Audio Generator (for GitHub Actions / Replit)
 * Reads text from the real article page, calls ElevenLabs with timestamps,
 * writes  audio/<slug>.mp3  +  audio/<slug>.sentences.json  at the repo root.
 *
 *   node generate-audio.js --html l2-article7.html --slug l2-article7 [--voice <id>]
 *
 * Needs:  npm install   (cheerio, dotenv, node-fetch from package.json)
 * Key:    ELEVENLABS_API_KEY env var (a GitHub Secret in the Action)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CONFIG = {
  apiKey:  process.env.ELEVENLABS_API_KEY,
  voiceId: process.env.ELEVENLABS_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9',
  modelId: 'eleven_multilingual_v2',
  outputDir: path.join(process.cwd(), 'audio'),     // → repo-root /audio/
  voiceSettings: { stability: 0.55, similarity_boost: 0.80, style: 0.15, use_speaker_boost: true }
};

const SELECTOR = '.article-subtitle, .article-body h2, .article-body p, .article-body .key-line, .article-body .step-title, .article-body .proof-box strong';
const SENT_RE = /[^.!?]+[.!?]+(?:["'”’)\]]+)?\s*|[^.!?]+$/g;
const splitSents = t => (t.match(SENT_RE) || [t]).map(s => s.trim()).filter(Boolean);
const round = x => parseFloat((x ?? 0).toFixed(3));

function extractBlocks(htmlPath) {
  const $ = cheerio.load(fs.readFileSync(htmlPath, 'utf8'));
  const blocks = [];
  $(SELECTOR).each((_, el) => {
    if ($(el).closest('.cta-block, nav, footer').length) return;
    const t = $(el).text().trim();
    if (t) blocks.push(t);
  });
  if (!blocks.length) { console.error(`No matching content in ${htmlPath}`); process.exit(1); }
  return blocks;
}

async function generate({ htmlPath, slug }) {
  const { default: fetch } = await import('node-fetch');
  if (!CONFIG.apiKey) { console.error('ELEVENLABS_API_KEY not set'); process.exit(1); }

  const blocks = extractBlocks(htmlPath);
  const sentences = [];
  blocks.forEach((b, bi) => splitSents(b).forEach(text => sentences.push({ text, block: bi })));

  let fullText = ''; const offs = [];
  sentences.forEach((s, i) => {
    if (i > 0) fullText += sentences[i].block === sentences[i - 1].block ? ' ' : '\n\n';
    const start = fullText.length; fullText += s.text; offs.push([start, fullText.length]);
  });

  console.log(`Generating ${slug}: ${blocks.length} blocks, ${sentences.length} sentences, ${fullText.length} chars`);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${CONFIG.voiceId}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': CONFIG.apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ text: fullText, model_id: CONFIG.modelId, voice_settings: CONFIG.voiceSettings })
  });
  if (!res.ok) { console.error(`ElevenLabs ${res.status}:`, await res.text()); process.exit(1); }
  const data = await res.json();

  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  const mp3 = Buffer.from(data.audio_base64, 'base64');
  fs.writeFileSync(path.join(CONFIG.outputDir, `${slug}.mp3`), mp3);

  const a = data.alignment || {};
  const cs = a.character_start_times_seconds || [];
  const ce = a.character_end_times_seconds || [];
  const aligned = Array.isArray(a.characters) && a.characters.length === fullText.length;
  const dur = ce[ce.length - 1] || 0;

  const out = sentences.map((s, i) => {
    const [a0, a1] = offs[i];
    return { i, start: round(aligned ? cs[a0] : dur * a0 / fullText.length),
             end: round(aligned ? ce[a1 - 1] : dur * a1 / fullText.length), text: s.text };
  });
  fs.writeFileSync(path.join(CONFIG.outputDir, `${slug}.sentences.json`),
    JSON.stringify({ duration: round(out.at(-1)?.end || dur), voice: CONFIG.voiceId, sentences: out }, null, 2));

  console.log(`Done: audio/${slug}.mp3 (${(mp3.length/1024).toFixed(0)} KB) + audio/${slug}.sentences.json (${out.length} sentences)`);
  if (!aligned) console.log('Note: used proportional timing (alignment length differed).');
}

const args = process.argv.slice(2);
const get = f => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const htmlPath = get('--html'), slug = get('--slug'), voice = get('--voice');
if (voice) CONFIG.voiceId = voice;
if (!htmlPath || !slug) { console.log('Usage: node generate-audio.js --html <file> --slug <slug> [--voice <id>]'); process.exit(0); }
generate({ htmlPath, slug }).catch(e => { console.error(e.message); process.exit(1); });
