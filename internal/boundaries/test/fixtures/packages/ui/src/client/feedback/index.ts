// Fixture: a stand-in `ui` `feedback` concern (band 1, general). `layout` (also band 1) importing
// it is a same-band SIBLING import; baseline rule A forbids a concern importing a sibling, so this
// edge must trip the gate even though neither is "above" the other. Imports nothing itself.
export const spinner = "spinner"
