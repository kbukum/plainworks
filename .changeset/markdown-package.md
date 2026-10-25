---
"@plainworks/markdown": patch
---

Add `@plainworks/markdown`, a safe renderer for untrusted Markdown such as model output. It renders GitHub-flavored Markdown, drops raw HTML, keeps only absolute `http`, `https` and `mailto` links, never loads images, bounds the input, and gives code blocks a language label and a copy button.
