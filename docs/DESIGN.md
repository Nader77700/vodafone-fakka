## Vibe
- Dark premium telecom utility with Vodafone red accents on a near-black surface; restrained hierarchy through typography and spacing.

## Color
- Primary: #E60000
- On Primary: #FFFFFF
- Accent: #FF3B3B
- On Accent: #FFFFFF
- Background: #0B0B14
- Foreground: #FFFFFF
- Muted: #151523
- Border: rgba(255, 255, 255, 0.08)
- Secondary: #FFFFFF
- Color rules:
  - Primary and Accent are red family; Accent is a lighter, more energetic red used for selected states and highlights.
  - Background is near-black with a subtle red undertone; Muted is the card surface.
  - Border is a low-opacity white line to keep separation without heavy strokes.
  - Primary/On and Accent/On ≥ 4.5:1.
  - Red appears only on CTAs, active states, and key icons; never as large flat fills.

## Typography
- Heading & Body: Montserrat (family: 'Montserrat Variable', weight: 400-700, url: https://resource-static.bj.bcebos.com/fonts/Montserrat-VariableFont_wght.woff2)

## Visual Language
- Core visual signature: red glow on active/focus elements and 1px low-opacity white borders against deep dark cards.
- Material & depth: flat cards with subtle inner glow; minimal shadows; depth created by surface brightness (Background → Muted → Popover).
- Containers & buttons: rounded rectangles, small red icon badges, white text labels, compact CTAs with full red fill only on primary actions.
- Layout rhythm: generous vertical spacing, clear section titles, grouped cards with consistent padding; accent red reserved for CTAs and status indicators.

## Animation
- Entrance: cards fade up 200-300ms with ease-out.
- Interaction: scale-press on tappable cards (0.97), color transition on focus/hover.
- Scroll / transition: page-level slide/fade between sibling routes, content lists lazy-render with fade-in rows.

## Forbidden
- No large flat red fills on backgrounds or hero sections.
- No generic drop shadows or left-border accent bars.
- No emojis or CSS-faked logos.

## Additional Notes
- RTL layout for Arabic.
- Maintain existing Header and Bottom Navigation across all Vodafone offers pages.
- Mobile-first: compact cards, no horizontal overflow, touch targets ≥ 48×48px.
