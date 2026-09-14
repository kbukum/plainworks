// Fixture: the `ui` `layout` concern (band 1) illegally importing its sibling `feedback` (also
// band 1) — a same-band sideways import baseline rule A forbids ("a concern folder never imports a
// sibling concern; shared pieces sink lower"). Must trip `no-ui-upward-layout` and only it.
export { spinner } from "../feedback/index"
