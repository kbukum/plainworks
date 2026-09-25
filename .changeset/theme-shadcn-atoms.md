---
"@plainworks/theme": patch
---

Make the unmodified shadcn atoms accessible in every scheme and mode:

- The focus ring stays at 3:1 even as the atoms' half-opacity halo, and light text is a touch darker so translucent labels (such as inactive tabs) stay at 4.5:1.
- Under forced colors, focus falls back to a system-color outline, since browsers drop box-shadow rings.
- Tab panels and slider thumbs show a focus outline; the atoms leave both without one.
- `--radius`, `--foreground`, and `--secondary` alias the plain tokens for atoms that read them directly.
