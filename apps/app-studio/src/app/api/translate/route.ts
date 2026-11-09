import { NextRequest, NextResponse } from 'next/server';

export interface AppCopy {
  name?: string;
  description: string;
  whatsNew: string;
  keywords?: string;       // iOS only, comma-sep, ≤100 chars
  shortDescription?: string; // Android only, ≤80 chars
}

// Verbose language names used in the prompt for better translation quality
const LANGUAGE_NAMES: Record<string, string> = {
  'zh':    'Simplified Chinese (Mainland China)',
  'de':    'German',
  'fr':    'French (France)',
  'es':    'Spanish (Spain)',
  'pt':    'Brazilian Portuguese',
  'it':    'Italian',
  'nl':    'Dutch',
  'ru':    'Russian',
  'ja':    'Japanese',
  'ko':    'Korean',
  'hi':    'Hindi',
  'id':    'Indonesian (Bahasa Indonesia)',
  'tr':    'Turkish',
  'vi':    'Vietnamese',
  'th':    'Thai',
  'pl':    'Polish',
  'uk':    'Ukrainian',
  'sv':    'Swedish',
  'nb':    'Norwegian Bokmål',
  'da':    'Danish',
  'fi':    'Finnish',
  'el':    'Greek',
  'cs':    'Czech',
  'ro':    'Romanian',
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set in .env.local' }, { status: 503 });
  }

  const { english, locale } = await req.json() as { english: AppCopy; locale: string };
  const language = LANGUAGE_NAMES[locale];
  if (!language) {
    return NextResponse.json({ error: `No language mapping for locale: ${locale}` }, { status: 400 });
  }

  const fields = Object.entries(english)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k]) => k);

  const constraints = [
    'keywords: translate AND adapt for local App Store search — comma-separated, total ≤100 characters',
    'shortDescription: ≤80 characters, punchy one-liner',
    'whatsNew: match the format of the English (bullet points if used)',
    'description: preserve line breaks and structure',
    'Keep "Money2Time" as the brand name in all languages',
    'Return ONLY valid JSON — no markdown, no code fences, no explanation',
  ].join('\n- ');

  const prompt = `You are an expert app store copywriter. Translate the following app store metadata from English to ${language} (locale: ${locale}).

The app is called "Money2Time" — it shows users how much everyday purchases cost in terms of their working hours. Tone: professional, friendly, relatable.

Constraints:
- ${constraints}

English source:
${JSON.stringify(english, null, 2)}

Return a JSON object with exactly these keys: ${fields.join(', ')}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 });
  }

  const result = await res.json() as { content: Array<{ text: string }> };
  const raw = result.content[0].text.trim();

  // Strip markdown code fences if Claude wraps the JSON
  const jsonText = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const translated = JSON.parse(jsonText) as AppCopy;
    return NextResponse.json(translated);
  } catch {
    return NextResponse.json({ error: `Failed to parse translation JSON: ${raw.slice(0, 200)}` }, { status: 500 });
  }
}
