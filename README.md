# Class exercises

These exercises are static HTML pages and require no build step.

## Gioia Interview Coding

Open [code.html](code.html) to code interview transcripts using an AI-assisted
Gioia workflow: participant-centered first-order concepts, interpretive
second-order themes, and aggregate dimensions when supported by the evidence.

1. Paste a transcript or upload text, Markdown, Interview Practice JSON,
   Word (.docx), or a PDF with selectable text. Select several files to create a
   project with multiple interviews and a shared codebook. Word and PDF
   extraction runs locally using the pinned libraries in vendor/.
2. Review extracted text, name each interview, identify its source as real or
   simulated, and choose participant/interviewer/excluded speaker roles.
   Baseline Interview Practice exports retain their simulated provenance and
   import the transcript without coaching. Scanned PDFs require OCR elsewhere.
3. Optionally enter a research question and define categories in **Codebook**.
   Edit category labels, descriptions, inclusion/exclusion criteria, examples,
   and parent groupings at all three levels. Uncheck **Allow AI to suggest new
   categories** to apply only the supplied first-order concepts.
4. Select **Generate Gioia coding**. The page codes participant passages in
   batches, reconciles concepts across interviews, and drafts themes and
   dimensions. Review the coded quotations and select a quotation to see its
   exact transcript context. Add, edit, remove, or mark coding reviewed; inspect
   the connected **Gioia structure** and supporting evidence.
5. After changing categories or criteria, select **Recode with current criteria**.
   Accept or reject proposed category, grouping, and coding changes. Accepting
   all applies only unprotected changes; student-reviewed conflicts require
   individual resolution. Merges redirect references; deletion preserves source
   text and detaches child categories.
6. Download **Project JSON** to move the complete analysis between devices, or
   **Codebook JSON** to reuse categories. Coding CSV, Markdown reports,
   structure SVG, and print are also available.

The exercise uses the same class Responses Worker, gpt-6-luna, low reasoning
effort, optional direct OpenAI endpoint, and key handling as Interview Practice.
Imported documents are not sent to an extraction service. Generating or recoding
submits extracted text and codebook criteria to the endpoint in Settings and
incurs model usage. Exact quotations and hierarchy references are validated;
invalid results leave the current project intact.

The current project and pending analysis are saved in separate IndexedDB
storage. Refresh, cancel, and provider failures retain completed batches; use
**Resume analysis** to continue. Editing a paused project clears its stale
candidate analysis. If storage is unavailable, work remains in the open tab;
download before closing it. API keys and settings are excluded from exports.
Project imports reset in-flight operations and pending recoding proposals.

The built-in teaching sample is fictional and remains labeled simulated.
Analysis drafts require student interpretation and review. The generated data
structure does not establish saturation or a complete grounded theory. Method
reference: [Gioia, Corley & Hamilton (2013)](https://doi.org/10.1177/1094428112452151).

## Customer Interview Practice

Open `interview.html` to practice customer discovery with a fictional customer and a live Mom Test scorecard.

1. Export `personas.json` from Persona Builder or JTBD, then upload or paste it into Interview Practice. A JTBD job-story export is also accepted. On the same website and browser, use the buttons to load either exercise’s saved personas directly.
2. Choose a customer, review the imported business context, and optionally enter three learning goals.
3. Start the interview, ask questions, and use the separate coaching panel to improve your follow-ups. Enter sends a question; Shift+Enter inserts a newline. Use **Dictate question**, allow microphone access, and choose **Stop dictation** to review the confirmed words before sending. Existing typed text is preserved; interim recognition is shown separately.
4. End the interview for a debrief. Export JSON or Markdown before starting a new interview if you want to retain the previous practice record.

The customer and coach use `gpt-6-luna` with `low` reasoning through the existing class Responses Worker. Settings also support a direct OpenAI Responses endpoint with an optional remembered API key. The Worker must permit this model and forward structured Responses requests. Live requests incur the configured provider’s API usage.

Use **Read latest reply** or a reply’s **Read aloud** button for natural AI speech, or enable **Auto voice** for new greetings and answers. The default uses `gpt-4o-mini-tts` through the matching `/v1/audio/speech` route on the class Worker, with conversational phrasing and expression-aware delivery. All customer dialogue and coaching still use GPT 6 Luna. The Worker must forward the speech request and return audio with CORS enabled. A direct OpenAI endpoint uses the existing API-key setting; the key is never forwarded to other hosts. Speech incurs provider API usage. Generated audio is cached only in memory (up to eight segments) for replay and never included in exports.

Voice matching uses explicit `gender`, `pronouns`, or `voice_style` fields, plus explicit descriptions in `demographics_background` and `face_prompt`. Feminine profiles use Marin, masculine profiles use Cedar, and unknown or nonbinary profiles use Alloy. Names, occupations, and photographs are never used to infer gender. **Customer voice style** in Settings overrides this choice; **Browser voice** is a deliberate device-based alternative, never a silent fallback after a service error. Speech language and speed are adjustable, and the language also instructs the customer’s replies. **Stop audio** cancels generation and playback. If autoplay is blocked, **Play ready audio** starts the already generated clip without another API call. Audio does not autoplay when restoring an interview, and coaching retries do not repeat customer audio. Starting dictation or sending a new question interrupts playback; leaving the tab, ending the interview, or starting another interview stops active media.

The stage places the **exact imported `face_image_data_url`** beside the customer’s name, role, expression, and live speaking/listening status, against the profile’s background. The frameless portrait is aligned to the scene’s base. A conservative in-browser CSS mask blends plain, light studio backdrops into the scene; it leaves the source image intact and makes no network requests. Transparent, complex, low-contrast, or inaccessible images retain their original presentation. The portrait has an audio-level speaking indicator and an expression label, rather than fabricated lip or facial movement over the photograph. When no usable image exists, the page uses the prior 2D SVG illustration with six reply expressions, blinking, listening/thinking/speaking states, and approximate lip sync. Natural audio drives the illustrated mouth from a Web Audio analyser, with a timed fallback; browser speech uses native boundary events. A failed portrait load is explicitly labelled. Settings can override the profile’s office, home, café, clinic, or workshop background; **Show customer scene** in Settings hides the scene. Older saved interviews restore their original portrait when available. Reduced-motion preferences disable the speaking indicator, blinking, head movement, and mouth animation.

Speech-service maintenance: OpenAI has announced removal of `gpt-4o-mini-tts` snapshots on January 6, 2027 and recommends Realtime 2.1 Mini. The current Audio speech route is verified working; migrating to Realtime requires a compatible server/session transport, rather than substituting a Realtime model in this TTS request. Plan that migration before shutdown. See [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations) and [text-to-speech documentation](https://developers.openai.com/api/docs/guides/text-to-speech).

Dictation requires HTTPS (or localhost), microphone permission, and a browser supporting `SpeechRecognition` or `webkitSpeechRecognition`. Browser/device support and available voices vary. Some browsers send microphone audio to their speech service; this page saves only confirmed text and never records audio. Unsupported or denied speech features leave typed interviewing available. Speech and avatar preferences are saved locally with the existing settings; they are excluded from practice exports.

Browser IndexedDB restores the current interview, including any pending reply, score, or debrief. Use the indicated retry button after an interruption. If browser storage is blocked, the page continues in memory and explains that downloads are needed to retain work. Saved data is local to the website and browser; there is no account or instructor backend.

Scores are an AI-assisted classroom rubric adapted from [The Mom Test](https://www.momtestbook.com/teachers), not an official grading system. Customer responses and discoveries are fictional training material, not evidence of market demand. Exports omit the private scenario, portrait data, and API settings.

## Local validation

Run the coding and interview unit checks:

    node --test tests/code.test.cjs tests/interview.test.cjs

Serve the repository and open tests/code-browser.html, then select **Run checks**
for deterministic checks of the actual coding page. The suite uses isolated
browser storage and mocked Responses calls; it covers multi-interview coding,
criteria edits, protected proposal review, exact quotation navigation, manual
and fixed-codebook coding, malformed model output, cancel/reload/resume,
transcript file imports, actual Word/PDF extraction, scanned-PDF rejection,
exports, blocked storage, and mobile overflow. No provider calls are made.

Run `node --test tests/interview.test.cjs` for dependency-free import, scoring, reference, response, conversation-isolation, and export checks.

Serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/interview.html`. Use `http://127.0.0.1:8765/tests/iframe.html` to check scrolling in a fixed-height embedded host.

Open `http://127.0.0.1:8765/tests/interview-media.html` and choose **Run checks** for deterministic browser lifecycle checks. These run the actual page inside an isolated frame with mocked speech playback/generation, storage, and Responses APIs; they never use the microphone or provider. They cover dictation finals/interims, microphone denial, exact portrait reuse, studio-background blending and reset, responsive scene layout and controls, gender/pronoun matching and overrides, natural playback and caching, autoplay recovery, service failures, cancellation, scoring retries, unsupported APIs, and restoration of old interviews. Also verify real device speech manually, including permission denial, no installed voices, hidden-tab cleanup, long replies, and reduced motion. Cross-origin embedded hosts must allow microphone access (for example, `allow="microphone"` on their iframe).

For browser verification, exercise file and pasted imports, both saved-persona sources, desktop/mobile layouts, keyboard input, refresh recovery, reply/scoring/debrief retries, blocked storage, cancellation, and both downloads. A live smoke interview should include a hypothetical buying question, a question about a specific past incident, and a follow-up based on the actual answer.
