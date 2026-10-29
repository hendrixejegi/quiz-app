
# QuizPop — Design Specification

## Identity and product intent

QuizPop turns a room full of people into a friendly live quiz competition. The identity is playful, confident, and comic-inspired: bold ink, flat color, crisp offset shadows, and expressive typography. Keep the current question, timer, accepted answer, and standings immediately understandable.

The original logo is a lavender Q speech bubble with a golden comic burst, dark outlines, and a warm-white counter. The wordmark reads **QuizPop**, with both words joined and capitalized. Use `frontend/public/quizpop-mark.svg` for the header and favicon. Keep the mark uncropped, at least 32px wide in the interface, with clear space around it. Its built-in colors stay constant in both themes. The home control has the accessible name “QuizPop home”; its adjacent logo image is decorative.

Adapted from the supplied Cole Martin design notes: palette, Space Grotesk/Space Mono, 8px spacing, and compact corner geometry. The supplied quiz screenshot informs color blocking, dark outlines, and comic energy. Neither reference supplies product copy, features, or navigation. Do not reproduce its character artwork or import portfolio sections.

## Color and typography

| Role | Token | Value | Application |
| --- | --- | --- | --- |
| Primary | `--primary` | `#A79CFF` | Main actions, ready-made quiz section, selected answer |
| Highlight | `--yellow` | `#F4B942` | Quiz count, second demo action, first-place medal |
| Supporting / positive | `--mint` | `#88C999` | Success icon, third demo action, positive outcome edge |
| Ground | `--ground` | `#F9F8F5` | Warm-white page |
| Surface | `--surface` | `#FFFFFF` | Forms, sharing, host controls, answers |
| Inset | `--inset` | `#F0EEE8` | Question editor and neutral badges |
| Fixed ink | `--ink` | `#111827` | Outlines and labels on bright brand fills |
| Text | `--text` | `#111827` | Main text |
| Secondary text | `--muted` | `#4B5563` | Instructions, labels, metadata |
| Positive text / tint | `--positive` / `--positive-bg` | `#245E37` / `#DBF0DF` | Confirmed positive outcomes |
| Error text / tint | `--negative` / `--negative-bg` | `#A8233C` / `#FFE7EB` | Validation and failed outcomes |
| Warning text / tint | `--warning` / `--warning-bg` | `#704600` / `#FBE8BA` | Connecting and reconnecting |

Use dark ink on lavender, yellow, and mint; do not put white button labels on these fills. Avoid gradients, glows, transparency effects, and soft blurred shadows. The page stays mostly neutral; large color fields belong to quiz discovery, actions, selections, and celebrations. Distinguish semantic outcomes with words and icons as well as color.

Dark mode uses neutral charcoal `#171717`, surfaces `#242424`, inset panels `#303030`, warm-white text `#F9F8F5`, secondary text `#CBC8C0`, and visible outlines `#AAA69F`. Retain the original brand fills with fixed dark ink. Semantic text/tint pairs become lighter-on-dark: positive `#A3DDB2`/`#233C2B`, error `#FFA5B5`/`#42232B`, warning `#F4CB79`/`#44381F`.

- **Space Grotesk:** headings, wordmark, buttons, controls, answer text, and strong emphasis. Use weights 400–700. Desktop display reaches 80px at 1.04 line-height; mobile starts around 40px. Question prompts use 24–34px with a readable 1.35 line-height.
- **Space Mono:** body, labels, instructions, timer figures, codes, and metadata. Body is 13–16px at roughly 1.7 line-height; metadata is 11–12px. Inputs remain at least 16px. Use monospace and sans-serif fallbacks so unavailable webfonts never block the interface.
- Keep headings in one ink color. Permit long user-created questions, quiz titles, and names to wrap; never truncate essential content.

## Geometry, components, and layout

Use an 8px spacing rhythm, 12–16px control gaps, 20–30px panel padding, and 48–80px major section spacing. The page frame has equal outer margins and a 1440px maximum; the main content is about 980px wide. Forms and lobby screens use narrower readable measures.

Cards and controls have 8px corners and 2px outlines. Resting major panels have a crisp `4px 4px 0 #111827` shadow; buttons use 3px offsets. Nested inputs use an outline without a competing shadow. Keep round shapes for the correct-answer selector, status dots, and podium medals. Avoid decorating every row or adding comic artwork beside active questions.

Buttons have at least 44px touch targets, visible focus, and brief physical hover/press movement. A disabled action looks disabled and does not move on hover. Copy controls show the existing confirmed “Copied” state. Correct-answer selectors have a 44px hit area around the smaller visual ring.

### Existing screen hierarchy

- **Home and creation:** “Make your next quiz pop.” introduces the product. A lavender ready-made quiz section contains the real categories and start actions in lavender, yellow, and mint. Join-by-code and custom quiz creation remain immediately identifiable. The builder shows title, question order, choices, correct-answer selectors, timer settings, validation, and creation actions.
- **Link issuance:** a mint success mark leads into the participant URL and join code, a copy action, and the private host-lobby action. Explain that the host link is a secret.
- **Participant join and lobby:** emphasize the quiz title, room information, identity fields, waiting state, and concise play instructions. Preserve entered values after validation errors.
- **Host:** emphasize quiz state, participant count, join code, connection state, roster or standings, and the real start action. Keep secret host credentials out of visible share content.
- **Active play:** prioritize question text, persistent countdown, flat progress bar, and large answer buttons. A selected answer uses lavender plus a pressed state; acceptance remains server-confirmed. Urgency uses text and color without flashing.
- **Question results:** show personal outcome, awarded points, rank movement, and the top three. Display connection and timer transitions clearly without moving the leaderboard unexpectedly.
- **Final results:** gold, lavender, and mint medals mark the top three, followed by remaining rankings and per-question review. Support ties, one or two participants, and long names. Reveal correct answers only when the server permits.
- **Future administration:** use the same readable forms and neutral surfaces. Destructive deletion must name the event and associated data affected. This rebrand adds no admin screens.

On tablet, reduce outer margins to 32px and stack the results side panel once its columns become cramped. At 700px and below, use 20px outer margins, stacked demo categories, single-column answer editing, full-width primary actions, and an icon-only theme toggle with its accessible label intact. Keep score and name columns readable, wrap names and URLs, and prevent page-level horizontal scrolling at 320px and above.

## Motion, accessibility, and live states

Use 150ms press/hover feedback and stable timer progress. Restrict ambient motion to a small waiting dot. Under `prefers-reduced-motion: reduce`, disable animation and transitions. Avoid entrance effects that delay questions or answer controls.

Every interactive element must support keyboard focus and a visible outline. Associate fields with labels or accessible names, retain pressed states on selected answers and correct-choice controls, and use polite status messages where appropriate. Aim for WCAG AA text contrast; never rely solely on color, shadows, or position for an outcome. Countdown announcements should communicate meaningful thresholds rather than every second.

Design loading, connecting, reconnecting, offline, empty quiz, invalid content, waiting lobby, active question, submitted answer, expired question, intermediate standings, and final review. Errors such as duplicate names, invalid links, full rooms, rejected answers, and connection failures use clear text within the relevant area.

## Behavioral boundaries and compatibility

The server owns deadlines, session transitions, accepted answers, and scoring. Preserve current routes, API contracts, quiz limits, fixed scoring, late-join rules, reconnect tokens, and the final-answer reveal policy. Preserve the legacy theme storage key so existing preferences survive the rebrand; participant session storage must also remain intact. This change requires no database migration.

Validate with existing frontend and backend tests, a production frontend build, screenshots at desktop/tablet/mobile sizes in both themes, keyboard and reduced-motion checks, and the host-to-results flow against a running API. Test long names and prompts as well as normal content. Document any checks the environment prevents.
