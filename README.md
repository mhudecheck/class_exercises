# Class exercises

These exercises are static HTML pages and require no build step.

## Customer Interview Practice

Open `interview.html` to practice customer discovery with a fictional customer and a live Mom Test scorecard.

1. Export `personas.json` from Persona Builder or JTBD, then upload or paste it into Interview Practice. A JTBD job-story export is also accepted. On the same website and browser, use the buttons to load either exercise’s saved personas directly.
2. Choose a customer, review the imported business context, and optionally enter three learning goals.
3. Start the interview, ask questions, and use the separate coaching panel to improve your follow-ups. Enter sends a question; Shift+Enter inserts a newline.
4. End the interview for a debrief. Export JSON or Markdown before starting a new interview if you want to retain the previous practice record.

The customer and coach use `gpt-6-luna` through the existing class Responses Worker. Settings also support a direct OpenAI Responses endpoint with an optional remembered API key. Live requests incur the configured provider’s API usage.

Browser IndexedDB restores the current interview, including any pending reply, score, or debrief. Use the indicated retry button after an interruption. If browser storage is blocked, the page continues in memory and explains that downloads are needed to retain work. Saved data is local to the website and browser; there is no account or instructor backend.

Scores are an AI-assisted classroom rubric adapted from [The Mom Test](https://www.momtestbook.com/teachers), not an official grading system. Customer responses and discoveries are fictional training material, not evidence of market demand. Exports omit the private scenario, portrait data, and API settings.

## Local validation

Run `node --test tests/interview.test.cjs` for dependency-free import, scoring, reference, response, conversation-isolation, and export checks.

Serve the repository with `python3 -m http.server 8765 --bind 127.0.0.1`, then open `http://127.0.0.1:8765/interview.html`. Use `http://127.0.0.1:8765/tests/iframe.html` to check scrolling in a fixed-height embedded host.

For browser verification, exercise file and pasted imports, both saved-persona sources, desktop/mobile layouts, keyboard input, refresh recovery, reply/scoring/debrief retries, blocked storage, cancellation, and both downloads. A live smoke interview should include a hypothetical buying question, a question about a specific past incident, and a follow-up based on the actual answer.
