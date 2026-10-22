// Discovery intake question schema.
// SOURCE OF TRUTH: skills/discovery-intake/schema.json — the question ids are the
// contract shared with the discovery-intake skill. Keep ids identical; regenerate
// this constant from the JSON rather than editing questions here by hand.

export type DiscoveryQuestionType = 'long' | 'text' | 'single' | 'multi';

export interface DiscoveryQuestion {
  id: string;
  t: DiscoveryQuestionType;
  q: string;
  o?: string[];
  hint?: string;
  client?: string;
}

export interface DiscoveryPart {
  id: string;
  title: string;
  say: string;
  private?: boolean;
  q: DiscoveryQuestion[];
}

export interface DiscoverySchema {
  schema: string;
  parts: DiscoveryPart[];
}

export const DISCOVERY_SCHEMA: DiscoverySchema = {
  schema: "maestro.discovery-intake/1",
  parts: [
    {
      id: "s1",
      title: "The story",
      say: "Tell me how this started. What made you want to build this?",
      q: [
        { id: "s1_story", t: "long", q: "How did the idea start?", hint: "Let them talk. Capture the words they use; those words go into the spec." },
        { id: "s1_oneliner", t: "text", q: "If you described the app in one sentence to a friend, what would you say?" },
        { id: "s1_problem", t: "long", q: "What problem does it solve, and for whom?" },
        { id: "s1_today", t: "long", q: "How do those people handle this today, without the app?", hint: "WhatsApp groups, spreadsheets, phone calls, a competitor. The current workaround sets the bar the app has to beat." },
        { id: "s1_whynow", t: "text", q: "Why now? Is something pushing the timing?" },
      ],
    },
    {
      id: "s2",
      title: "Who uses it",
      say: "Let me make sure I understand everyone who would touch this.",
      q: [
        { id: "s2_types", t: "long", q: "Who are the different kinds of people who would use it?", hint: "Customers, drivers, shop owners, admins. Each type usually means its own login and its own screens." },
        { id: "s2_scale", t: "single", q: "At launch, roughly how many people would use it?", o: ["Just us","Under 100","100 to 1,000","1,000 to 10,000","More than 10,000","Not sure"] },
        { id: "s2_admin", t: "long", q: "Who runs it behind the scenes? What do they need to see or change?" },
        { id: "s2_signin", t: "text", q: "Do people need accounts? How should they sign in?", hint: "Phone number, email, Google or Apple, invite only." },
      ],
    },
    {
      id: "s3",
      title: "What it must do",
      say: "Now the part I care about most. I want to find the smallest version that is still worth launching.",
      q: [
        { id: "s3_mvp", t: "long", q: "If the app could only do ONE thing on day one, what would it be?", hint: "This is the first version. Everything else is version two." },
        { id: "s3_must", t: "long", q: "What are the three to five things it absolutely must do?" },
        { id: "s3_journey", t: "long", q: "Walk me through it. A person opens the app for the first time. What happens, step by step, until they are done?" },
        { id: "s3_reference", t: "long", q: "Is there an app that is close to what you imagine? What would you keep, and what would you change?", hint: "The single most useful scoping question. Get the actual app names." },
        { id: "s3_nice", t: "long", q: "What would be nice to have later, but could wait?" },
        { id: "s3_not", t: "long", q: "Is there anything you have decided it should NOT do?" },
      ],
    },
    {
      id: "s4",
      title: "Where it runs",
      say: "A few practical ones about where and how people will use it.",
      q: [
        { id: "s4_platforms", t: "multi", q: "Where does it need to run?", o: ["iPhone (App Store)","Android (Google Play)","Website in a browser","Desktop","Not sure"] },
        { id: "s4_languages", t: "multi", q: "Which languages should it support?", o: ["English","Persian (Farsi)","French","Arabic","Other"], hint: "Persian and Arabic mean right-to-left layout, planned from day one." },
        { id: "s4_regions", t: "text", q: "Which countries or cities will it be used in?", hint: "Affects payments, SMS, app store accounts and privacy law." },
        { id: "s4_offline", t: "single", q: "Does it need to work without internet?", o: ["Yes, often","Sometimes","No","Not sure"] },
      ],
    },
    {
      id: "s5",
      title: "Connections and money",
      say: "Does anything outside the app need to be involved? Payments, maps, messages, other systems?",
      q: [
        { id: "s5_payments", t: "long", q: "Does money move through the app? Who pays whom, and how?", hint: "One-time, subscription, per order, or cash outside the app. An app that holds money between two parties is a different size of project." },
        { id: "s5_integrations", t: "multi", q: "What should it connect to?", o: ["Payments (Stripe, PayPal)","Maps and location","Push notifications","SMS or WhatsApp","Email","Calendar","In-app chat","Video calls","Social login","Accounting or CRM","A system they already use","AI features (chat, recommendations)","None yet","Not sure"] },
        { id: "s5_existing", t: "text", q: "Do you already use software this would need to talk to?" },
        { id: "s5_content", t: "text", q: "Who creates the content in the app (listings, posts, products)? You, or the users?" },
      ],
    },
    {
      id: "s6",
      title: "Data and trust",
      say: "What kind of information will the app be holding about people?",
      q: [
        { id: "s6_data", t: "multi", q: "What kinds of information will it hold?", o: ["Names and contact details","Payment or banking details","Location history","Health or medical","Children's information","Photos or documents","Business or financial records","Messages between users","Nothing sensitive","Not sure"] },
        { id: "s6_residency", t: "single", q: "Any requirement about where the data is stored?", o: ["Must stay in Canada","Must stay in another specific country","No preference","Not sure"] },
        { id: "s6_legal", t: "text", q: "Any rules or regulations you know apply to this kind of business?", hint: "In Ontario: PIPEDA for personal data, PHIPA if health data is involved. Note it, do not advise." },
      ],
    },
    {
      id: "s7",
      title: "What exists already",
      say: "What do you already have in hand that I could look at?",
      q: [
        { id: "s7_name", t: "text", q: "Does it have a name? A domain? A logo?" },
        { id: "s7_assets", t: "multi", q: "What exists today?", o: ["Sketches or drawings","Designs or mockups","A written plan or document","An existing website","An existing app or code","A spreadsheet or database of data","A waitlist or interested users","Nothing yet"] },
        { id: "s7_prior", t: "long", q: "Have you worked with developers or an agency on this before? What happened?", hint: "A previous build that stalled is context, not a red flag on its own. Ask what they have from it." },
        { id: "s7_send", t: "text", q: "What can you send me after the call?" },
      ],
    },
    {
      id: "s8",
      title: "The business",
      say: "How does this work as a business, or what is it for?",
      q: [
        { id: "s8_model", t: "single", q: "How will it make money, or what is it for?", o: ["Subscription","Per-transaction or commission","One-time purchase","Advertising","Free, it supports an existing business","Internal tool for our own company","Not decided"] },
        { id: "s8_customer", t: "text", q: "Who is the paying customer, and is that the same person as the user?" },
        { id: "s8_validation", t: "long", q: "Have you talked with people who would use it? What did they say?" },
        { id: "s8_success", t: "text", q: "Six months after launch, what would make you say it worked?" },
      ],
    },
    {
      id: "s9",
      title: "Timeline and budget",
      say: "Two questions people sometimes find awkward. I ask them plainly because they decide what we can propose.",
      q: [
        { id: "s9_deadline", t: "text", q: "Is there a date this needs to be ready by? What is driving it?" },
        { id: "s9_budget", t: "single", q: "Do you have a budget range in mind for the first version?", o: ["Under $5,000 CAD","$5,000 to $15,000","$15,000 to $40,000","$40,000 to $100,000","Over $100,000","Prefer not to say yet","No idea, would like guidance"], hint: "Ask it straight and do not react to the number. \"No idea\" is a fine answer; it means you propose options." },
        { id: "s9_phased", t: "single", q: "Would you be open to launching a smaller first version and growing it?", o: ["Yes","Maybe","No, it needs to be complete"] },
        { id: "s9_ongoing", t: "single", q: "After launch, who looks after it?", o: ["We would want you to maintain it","We would hire someone","Not sure"] },
      ],
    },
    {
      id: "s10",
      title: "Working together",
      say: "Last few, about how we would work if we go ahead.",
      q: [
        { id: "s10_decider", t: "text", q: "Who makes the final decisions on this project?" },
        { id: "s10_contact", t: "text", q: "Who would I talk to day to day, and how do you prefer to communicate?", hint: "WhatsApp, email, phone. Which language." },
        { id: "s10_cadence", t: "single", q: "How often would you want to see progress?", o: ["Weekly demo","Every two weeks","Monthly","Only at milestones"] },
        { id: "s10_ownership", t: "single", q: "Do you expect to own the code and the accounts at the end?", o: ["Yes, fully","Not sure what that means","Happy for the developer to host it"], hint: "Recommend yes. It protects them and it protects you." },
        { id: "s10_quotes", t: "text", q: "Are you talking with other developers as well?", hint: "Either answer is fine. It tells you how to position the proposal." },
        { id: "s10_questions", t: "long", q: "What questions do you have for me?" },
      ],
    },
    {
      id: "s11",
      title: "Wrap-up",
      say: "Here is what happens next: I will write up what I heard, go through it with my team, and come back within a few days with questions, a suggested first version and a rough range. Does that work?",
      q: [
        { id: "s11_open", t: "long", q: "Things they could not answer or need to check", client: "Anything you still need to find out or decide?" },
        { id: "s11_promised", t: "long", q: "What I promised to send, and by when", client: "Anything you would like us to send you?" },
        { id: "s11_next", t: "text", q: "Next call or follow-up date", client: "When is a good time for a follow-up call?" },
      ],
    },
    {
      id: "p",
      title: "Private notes",
      private: true,
      say: "Not shown to the person interviewed. Fill in right after the call while it is fresh.",
      q: [
        { id: "p_read", t: "long", q: "Your read: clarity, energy, who talked, what they care about most" },
        { id: "p_flags", t: "multi", q: "Signals to weigh", o: ["No budget, or would not discuss it","Expects it in weeks","Scope grew while we talked","Wants equity or revenue share instead of payment","Marketplace with two sides to fill","Needs money to move through the app","No clear decision maker","Previous developer relationship ended badly","Clear problem and real users","Has assets ready (designs, data, users)","Realistic about phasing"] },
        { id: "p_viability", t: "single", q: "Gut viability", o: ["1 Pass","2 Doubtful","3 Possible","4 Promising","5 Strong"] },
        { id: "p_scoping", t: "long", q: "Questions for the scoping session" },
      ],
    },
  ],
};

// ─── Derived helpers ─────────────────────────────────────────────────────────

export type DiscoveryAnswerValue = string | string[];
export type DiscoveryIntakeAnswers = Record<string, DiscoveryAnswerValue>;

/** Parts shown to the person being interviewed (skips the private part `p`). */
export function getPublicDiscoveryParts(): DiscoveryPart[] {
  return DISCOVERY_SCHEMA.parts.filter((part) => !part.private);
}

/** Every answerable (non-private) question, in schema order. */
export function getPublicDiscoveryQuestions(): DiscoveryQuestion[] {
  return getPublicDiscoveryParts().flatMap((part) => part.q);
}

function isAnswered(value: DiscoveryAnswerValue | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.some((entry) => typeof entry === 'string' && entry.trim().length > 0);
  return typeof value === 'string' && value.trim().length > 0;
}

export function countDiscoveryProgress(answers: DiscoveryIntakeAnswers): { answered: number; total: number } {
  const questions = getPublicDiscoveryQuestions();
  const answered = questions.filter((question) => isAnswered(answers[question.id])).length;
  return { answered, total: questions.length };
}

export function formatDiscoveryAnswer(value: DiscoveryAnswerValue | undefined): string | null {
  if (!isAnswered(value)) return null;
  return Array.isArray(value) ? value.filter((entry) => entry.trim().length > 0).join(', ') : (value as string).trim();
}

/** Prompt body sent to `orchestrate` on every discovery turn (schema + answers + rules). */
export function buildDiscoveryPrompt(input: {
  answers: DiscoveryIntakeAnswers;
  transcript: string;
  userText: string;
}): string {
  const schemaLines = getPublicDiscoveryParts().map((part) => {
    const questions = part.q.map((question) => {
      const bits = [`    - id: ${question.id} · type: ${question.t} · question: ${question.client ?? question.q}`];
      if (question.o) bits.push(`      options: ${question.o.join(' | ')}`);
      if (question.hint) bits.push(`      hint (for you, not the person): ${question.hint}`);
      return bits.join('\n');
    });
    return `  Part ${part.id} — ${part.title}\n    intro you may adapt: "${part.say}"\n${questions.join('\n')}`;
  });

  const unanswered = getPublicDiscoveryQuestions()
    .filter((question) => !isAnswered(input.answers[question.id]))
    .map((question) => question.id);

  return [
    'You are running a guided DISCOVERY INTAKE for a new software project. You interview the person in plain, friendly language, a few questions at a time, and you record what they say in their own words.',
    '',
    'QUESTION SCHEMA (ids are the contract — use them exactly):',
    ...schemaLines,
    '',
    'ANSWERS CAPTURED SO FAR (JSON keyed by question id):',
    JSON.stringify(input.answers, null, 2),
    '',
    `STILL UNANSWERED, in order: ${unanswered.length > 0 ? unanswered.join(', ') : '(none)'}`,
    '',
    'STRICT RULES:',
    "1. Read the person's latest message. Capture any answers it contains, even to questions you did not ask yet. Put them in \"answers\" using the person's own words (do not paraphrase into jargon).",
    '2. Then reply with a short, warm message that asks the next 2 or 3 unanswered questions in plain language. Never more than 3. Follow the schema order unless the conversation naturally jumps ahead. Skip part "p" entirely; it is private.',
    '3. Tell the person they can skip any question, and that they can type /done at any time to finish.',
    '4. For "multi" questions the answer is a string[] of the chosen options (or their own words). For "single" questions the answer is one option string. For "text" and "long" the answer is a string.',
    '5. "answers" must contain ONLY newly captured answers from this turn, never ones already captured above. If nothing new was captured, use {}.',
    '6. "next" lists the ids you just asked. Set "done": true only when every non-private question is answered or the person asked to finish.',
    '7. Your reply MUST end with a fenced json block in exactly this shape:',
    '```json',
    '{ "answers": { "<id>": "value or [\\"a\\", \\"b\\"]" }, "next": ["<id>", "<id>"], "done": false }',
    '```',
    '8. Nothing after the fenced block.',
    '',
    input.transcript ? `CONVERSATION SO FAR:\n${input.transcript}\n` : '',
    `PERSON'S LATEST MESSAGE:\n${input.userText}`,
  ].join('\n');
}

export interface ParsedDiscoveryReply {
  message: string;
  answers: DiscoveryIntakeAnswers;
  next: string[];
  done: boolean;
}

const FENCED_JSON_RE = /```json\s*([\s\S]*?)```/gi;

function normalizeAnswers(raw: unknown): DiscoveryIntakeAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const validIds = new Set(getPublicDiscoveryQuestions().map((question) => question.id));
  const out: DiscoveryIntakeAnswers = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!validIds.has(key)) continue;
    if (typeof value === 'string') {
      if (value.trim().length > 0) out[key] = value.trim();
    } else if (Array.isArray(value)) {
      const entries = value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim());
      if (entries.length > 0) out[key] = entries;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return out;
}

/**
 * Splits the assistant text from the trailing fenced json block. Tolerates a
 * missing or malformed block (treated as "no new answers"). Also tolerates the
 * orchestrate wrapper leaking through as raw `{ "title", "content" }` JSON.
 */
export function parseDiscoveryReply(raw: string): ParsedDiscoveryReply {
  let text = raw ?? '';
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const wrapper = JSON.parse(trimmed) as { content?: unknown };
      if (typeof wrapper.content === 'string') text = wrapper.content;
    } catch {
      // not a wrapper — fall through and parse as plain text
    }
  }

  const matches = [...text.matchAll(FENCED_JSON_RE)];
  const last = matches.length > 0 ? matches[matches.length - 1] : null;
  if (!last) {
    return { message: text.trim(), answers: {}, next: [], done: false };
  }

  const start = last.index ?? 0;
  const message = (text.slice(0, start) + text.slice(start + last[0].length)).trim();
  try {
    const parsed = JSON.parse(last[1].trim()) as { answers?: unknown; next?: unknown; done?: unknown };
    return {
      message,
      answers: normalizeAnswers(parsed.answers),
      next: Array.isArray(parsed.next) ? parsed.next.filter((entry): entry is string => typeof entry === 'string') : [],
      done: parsed.done === true,
    };
  } catch {
    return { message, answers: {}, next: [], done: false };
  }
}

/** Markdown export of the intake record. */
export function discoveryRecordToMarkdown(answers: DiscoveryIntakeAnswers): string {
  const title = formatDiscoveryAnswer(answers.s1_oneliner) ?? 'Untitled';
  const lines: string[] = [`# Discovery: ${title}`, ''];
  const unanswered: string[] = [];

  for (const part of getPublicDiscoveryParts()) {
    lines.push(`## ${part.title}`, '');
    for (const question of part.q) {
      const label = question.client ?? question.q;
      const answer = formatDiscoveryAnswer(answers[question.id]);
      lines.push(`**${label}**`, '');
      if (answer) {
        lines.push(answer, '');
      } else {
        lines.push('_(no answer)_', '');
        unanswered.push(label);
      }
    }
  }

  lines.push('## Not yet answered', '');
  if (unanswered.length === 0) {
    lines.push('_(everything answered)_');
  } else {
    for (const label of unanswered) lines.push(`- ${label}`);
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** Scoping brief handed to the council via brainstormFromChat. */
export function buildDiscoveryScopingBrief(answers: DiscoveryIntakeAnswers): string {
  return [
    'You are scoping a software project from a discovery intake record. Treat every figure you give as an inference from the record, not a quote. Answer the numbered questions in order and keep each answer concrete.',
    '',
    discoveryRecordToMarkdown(answers).trimEnd(),
    '',
    '## Questions for the council',
    '',
    'Q1. Viability: is this worth building, and what is the one-line pitch?',
    'Q2. The smallest launchable version: what is in, what is out?',
    'Q3. Platform and stack, with reasons tied to the answers above.',
    'Q4. Risks and unknowns that must be cleared before quoting.',
    'Q5. A phased plan with a rough range per phase in CAD. Label every estimate as inferred.',
    'Q6. Questions to send back to the person before writing a proposal.',
  ].join('\n');
}
