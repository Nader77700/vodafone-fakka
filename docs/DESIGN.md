# DESIGN.md - Vodafone Fakka & Etisalat VIP Multi-Session Design System

## Vibe
- Telecom Executive Cyberpunk & High-Security Dark Terminal (Dark Luxury, Crisp High-Contrast Telecommunications Dashboard with Neon Red & Gold Accents).

## Color
- Primary: #DC2626 (Vibrant Telecom Red)
- On Primary: #FFFFFF
- Accent: #D97706 (Amber VIP Gold)
- On Accent: #000000
- Background: #0B0B0E (Ultra-Deep Obsidian Charcoal)
- Foreground: #F4F4F5 (Crisp Off-White)
- Muted: #1C1C24 (Subtle Elevated Surface)
- Border: #2A2A38 (Dark Border Accent)
- Secondary: #991B1B (Deep Wine Red)

## Typography
- Heading: Cairo, Alexandria, Inter, sans-serif (family: 'Cairo', sans-serif, weight: 700)
- Body: Cairo, Inter, system-ui, sans-serif (family: 'Cairo', sans-serif, weight: 400)

## Visual Language
- Core visual signature: Deep charcoal terminal panels with glowing red/amber status pill badges, live telemetry indicators, and monospaced terminal consoles with emerald log feeds.
- Material & depth: Layered elevation (0B0B0E base -> 14141A cards -> 1E1E28 interactive badges) with subtle 1px border glows.
- Containers & buttons: Rounded rectangular control cards with crisp micro-borders, segmented session switchers with active glow, and icon-paired action triggers.
- Layout rhythm: Compact telemetry headers, responsive session selector ribbon with session pills, clean separation between active session context and background runners.

## Animation
- Entrance: Session cards fade-slide 180ms ease-out.
- Interaction: Active session pill expands smoothly with subtle ring highlight.
- Console: Terminal log feed autoscrolls smoothly on incoming line updates.

## Forbidden
- No flat white surfaces or blinding bright backgrounds.
- No mixing of session states or unisolated shared global variables.
- No decorative emojis in technical headers or action buttons.
