# Wordshelf

Look up a word you came across, and Wordshelf saves it into a themed book on your shelf.
Each day one of your words sits pinned at the top so you can use it a few times and make it stick.
Polish rewrites a message using the words you've learnt, before you send it on WhatsApp or email.

- Static site: `index.html`, `style.css`, `app.js` (words are saved on the phone, in localStorage)
- Vercel functions: `api/word.js` (dictionary + Gemini librarian), `api/polish.js` (Gemini editor)
- Needs one Vercel environment variable: `GEMINI_API_KEY`
- Add to home screen from the browser's share menu to use it like an app.
