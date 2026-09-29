// Fixture: a stand-in `ui` `forms` concern (band 2) that imports nothing. It exists as a LEGAL
// downward target — the higher `data` band (band 3) importing it is `data → forms`, exactly the
// direction the internal order permits, so no `no-ui-upward-*` rule may flag that edge.
export const field = "field"
