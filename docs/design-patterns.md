# Design patterns used in Hark

Pattern names come from *Designing Interfaces: Patterns for Effective Interaction Design*, 3rd edition (Jenifer Tidwell, Charles Brewer, Aynne Valencia, O'Reilly 2020). Page level reasoning comes from *Don't Make Me Think, Revisited* (Steve Krug). I used the names to decide what not to invent. When a pattern already existed for a job, I used it and spent the time on the parts of Hark that are new.

## Layout

| Pattern | Where in Hark | What it buys |
|---|---|---|
| Visual Framework | Sidebar, top bar, and content padding are identical on every page | A student always knows where they are; the page content is the only thing that changes |
| Center Stage | Recording page puts the transcript in the widest column and tools beside it | The transcript is the content, so it gets the room |
| Titled Sections | Home is split into Quick access, Courses, and Recent | Three labeled areas scan faster than one long list (Krug: break pages into clearly defined areas) |
| Grid of Equals | Recording cards on Home and Course pages are the same size and shape | Equal cards say "pick any one," which is the right message for a library |
| Cards | Each recording is a card with a color stripe, waveform, title, and one meta line | Fewer words per item; the waveform does the work a file icon would |
| Two-Panel Selector | Search results on the left, matching transcript in context on the right | The source of a match is never more than a glance away |
| Collapsible Panels | Summary, notes, and moments on the recording page each fold | The right rail stays useful on a laptop screen |

## Lists and navigation

| Pattern | Where in Hark | What it buys |
|---|---|---|
| Sortable Table | Recent table on Home sorts by name, course, length, date, status | Anything that looks like a table should sort like one |
| Dynamic Queries | Filter chips on Course and Search pages narrow results without a page change | Immediate feedback, nothing to submit |
| Thumbnail Grid | Course page shows eight cards in two rows | Scanning by shape and color before reading titles |
| Jump to Item | Clicking a timestamp seeks the player; Enter in Find jumps to the next match | The transcript is navigation for the audio |

## Actions and feedback

| Pattern | Where in Hark | What it buys |
|---|---|---|
| Prominent Done Button | One blue Start transcribing button on the New recording sheet; one blue New button in the sidebar | The next step is obvious (Krug: make it obvious what is clickable) |
| Good Defaults and Smart Prefills | Balanced model preselected, last used course preselected, file name becomes the title | Most people never need to change a setting |
| Input Hints | Drop zone lists accepted formats and the time limit before a file is dropped | Say what will work before someone tries |
| Progress Indicator | Transcribing card shows percent, time left, and named pipeline steps | A multi minute wait feels shorter when it is explained |
| Cancelability | Cancel on the Transcribing card, Esc closes the sheet | People try things when they know they can back out |
| Spinners and Loading Indicators | Model download shows size and percent, not a bare spinner | A 145 MB download needs to say it is 145 MB |
| Button Groups | Player controls grouped left, time and speed grouped right | Related actions sit together |
| Preview | Search results show the matching sentence with the term highlighted | Decide before you click |

## Forms

| Pattern | Where in Hark | What it buys |
|---|---|---|
| Structured Format | Course picker is chips with color dots, not a free text field | No typos, no "HCIM605" vs "HCIM 605" |
| Error Messages | Unsupported file type is named in the message with the formats that do work | The fix is in the error |
| Autocompletion | Find in transcript suggests words that appear in the transcript | Saves typing and shows what is there |

## Color as information

Color coding is not a named pattern in the book, but the chapter on visual design and the "Things that are related logically are related visually" rule from Krug cover it. Each course owns one system color. The same color appears on the sidebar dot, card stripe, folder tile, row icon, and chip. Blue is reserved for actions so a course can never look like a button. All text and accent colors meet the WCAG 2.1 AA contrast floor of 4.5:1, which is the reason the final palette uses a system blue rather than the navy and gold direction from the branding board.

## What I did not use

- Wizards. Transcribing is one sheet with three choices, not a multi step flow.
- Module Tabs on the recording page. Summary, notes, and moments stack in the rail so the transcript never leaves the screen.
- Hover Tools. Everything that matters is visible, since hover does not exist on a phone or for keyboard users.
