# Veronica Benini YouTube Genre Discovery Pack

Version: 0.1.0
Prepared: 2026-07-31
Target repository: `mediaforge` (private pnpm TypeScript/Node.js monorepo)

## Purpose

This pack defines a reusable YouTube genre for creator-led content about strategic
reinvention, independence, business, communication, feminism, personal time and
lifestyle design. It also defines a creator-specific profile for Veronica Benini.

The pack is designed for the existing Mediaforge pipeline:

- long-form and Shorts;
- typed, resumable production stages;
- localization;
- image, speech and FFmpeg rendering;
- metadata and YouTube upload;
- canonical episode filesystem through `createEpisodePathResolver`.

## The central recommendation

Use a reusable genre and a separate creator profile:

```text
genre: strategic-reinvention
creatorProfile: veronica-benini
```

Do **not** implement `veronica-benini` as a genre. The genre is reusable; the creator
profile contains her voice, vocabulary, boundaries, rights, offers and approval rules.

## Critical editorial constraint

Veronica has publicly stated that she writes newsletters and records podcasts without
AI support and considers this position important. Therefore the default implementation
must be:

```text
Human-authored source → AI-assisted adaptation/localization/production → human approval
```

The factory must not invent first-person opinions, experiences, claims or personal
stories in her name. Generative script drafting is disabled in the supplied creator
profile unless she explicitly approves another policy.

## Recommended reading order

1. `01-research/veronica-research-dossier.md`
2. `02-strategy/genre-and-channel-strategy.md`
3. `02-strategy/content-pillars-and-formats.md`
4. `03-product-spec/genre.strategic-reinvention.yaml`
5. `03-product-spec/creator.veronica-benini.yaml`
6. `03-product-spec/content-source.schema.json`
7. `03-product-spec/approval-workflow.md`
8. `04-implementation/mediaforge-architecture-changes.md`
9. `04-implementation/CODEX_IMPLEMENTATION_PROMPT.md`
10. `05-collaboration/veronica-onboarding-questionnaire.md`

## Pack contents

- Public research dossier and source register
- Book and intellectual-property map
- Reusable genre definition
- Creator profile
- Content-source and episode-blueprint schemas
- Editorial approval state machine
- Public/premium funnel
- Multilingual strategy
- 90-day pilot plan
- Rights and permissions checklist
- Veronica onboarding questionnaire
- Codex implementation prompt
- Sample episode briefs and content matrix

## Status

This is a discovery and implementation-planning pack. It is not permission to use
Veronica's name, books, voice, likeness, paid content or personal stories.

Before production, obtain written agreement on:

- ownership and usage rights;
- public versus premium content;
- adaptation and translation rights;
- voice and likeness;
- human authorship policy;
- review and publishing authority;
- revenue share and termination.


---

# Veronica Benini — Public Research Dossier

Research date: 2026-07-31
Official spelling: **Veronica Benini**
Public alias: **@Spora**

## Executive positioning

Veronica's public positioning is best described as a creator-strategist and
entrepreneur who helps women build greater personal and professional independence.

Her work combines five recurring dimensions:

1. **Strategic reinvention** — changing work, business or lifestyle deliberately.
2. **Independent business** — positioning, communication, marketing, sales and offers.
3. **Women, power and money** — feminism, representation, negotiation and autonomy.
4. **Personal time and life design** — reducing noise, reclaiming time and defining
   success personally.
5. **Personal narrative as teaching material** — using lived experience to introduce
   a practical framework or decision.

The strongest content identity is not generic motivation. It is:

```text
Personal experience + provocative framing + practical strategy + a concrete action
```

## Current public proposition

The current website leads with strategies for becoming independent and the courage
to change. The public offer combines courses and consultations across business,
communication, marketing, planning and lifestyle topics.

Current course/product themes visible on the official store include:

- Vision boards and goal planning
- Professional repositioning and multi-interest careers (`MULTIFAIGA`)
- Business foundations
- Communication and marketing strategy
- Newsletter strategy
- Storytelling (`StoryFaiga`)
- Influencer marketing
- Launch strategy
- Content strategy
- User-generated content
- Local marketing
- Memberships and online courses
- Strategic consulting as a profession
- Solo travel (`VIAGGETTY`)
- Home and interior-project planning (`LAVORETTY`)
- Introductory and advanced ChatGPT material

## Current editorial direction

Veronica describes personal time as a central luxury and says she deliberately moved
away from Instagram toward a more controlled private environment. Her `PRESENTE`
format is described as:

- podcast Monday to Friday;
- video on Saturday;
- newsletter on Sunday.

This matters commercially. A YouTube channel should not replace or leak `PRESENTE`.
It should be a controlled discovery and trust layer that directs qualified viewers
toward her newsletter, courses, membership or consultations.

## AI position

A current public newsletter archive states that her newsletters and podcasts are
created without AI support and that maintaining this position is important to her.

This does not necessarily rule out a collaboration, but it changes the product:

### Correct proposition

- Veronica remains the source of ideas, stories, opinions and teaching.
- The system extracts and structures approved human-authored material.
- AI assists with segmentation, visual planning, localization, captions, rendering,
  metadata drafts and production QA.
- Every first-person script and every localized version receives human approval.
- Synthetic voice, avatar or likeness remains disabled unless separately authorized.

### Incorrect proposition

- Scrape her website and imitate her voice automatically.
- Generate opinions or personal stories that she did not write or record.
- Turn premium material into public videos without a content boundary.
- Auto-publish high-volume content without approval.

## Content pillars

### 1. Strategic reinvention

Core questions:

- How do you recognize that a life or job no longer fits?
- How do you move without an impulsive “mollo tutto” decision?
- How can small deliberate changes create a larger transformation?
- What is a realistic transition plan?

### 2. Business and independence

Core questions:

- How do you convert expertise into a viable offer?
- How do you position a multi-interest professional identity?
- How do communication, content and sales work together?
- Which work creates freedom rather than another trap?

### 3. Women, power, money and representation

Core questions:

- Why are women discouraged from discussing money and power?
- How do objectification and double standards affect decisions?
- How can someone take a position without becoming a generic “empowerment” brand?
- How do boundaries, negotiation and economic independence interact?

### 4. Reclaiming time

Core questions:

- What consumes personal time without producing value?
- How does someone define enough?
- How can a person reduce digital noise and algorithmic pressure?
- How can work be redesigned around life rather than the reverse?

### 5. Practical lifestyle design

Core questions:

- How do solo travel, home design and local work become tools of autonomy?
- How can planning reduce fear without pretending risk does not exist?
- How can practical constraints be turned into a design brief?

### 6. Creator and market strategy

Core questions:

- How is AI changing online education and information?
- What still depends on trust, experience and a human relationship?
- How should creators structure public, paid and private spaces?
- How can a local or independent business compete without copying large-scale media?

## Characteristic communication mechanics

A faithful format should support:

- direct opening statements;
- colloquial Italian;
- humour and playful naming;
- first-person experience;
- an explicit opinion;
- a reframe that resists conventional advice;
- concrete steps, exercises or questions;
- a closing line with personality rather than a generic motivational CTA.

The system must not learn this style through blind scraping. It should use a
creator-approved vocabulary, examples and source corpus.

## Media evidence

Her public history includes:

- multiple TEDx talks;
- podcast originals for Spotify and Audible;
- online courses with video, audio, written summaries and exercises;
- newsletters and personal essays;
- strategic consultations;
- four principal books plus a shorter related ebook.

This makes her material suitable for a source-led, multimodal production pipeline.

## Strategic opportunity

The YouTube opportunity is strongest when positioned as:

> A low-burden, creator-controlled international video layer that transforms
> Veronica's approved human-authored material into high-quality long-form videos,
> Shorts and localized audio without replacing her authorship or premium ecosystem.

## Risks

- **Authenticity risk:** AI-generated first-person language would conflict with her
  stated authorship position.
- **Premium leakage:** public video could cannibalize paid material.
- **Rights risk:** publisher, collaborator or platform rights may limit adaptation.
- **Persona risk:** automatic imitation can flatten her distinctive language.
- **Context risk:** personal stories can become misleading when abbreviated.
- **Sensitivity risk:** current life events must never be auto-selected for production.
- **Localization risk:** literal translation can damage humour, politics and cultural
  framing.
- **volume risk:** “more content” can conflict with her deliberate reduction of social
  exposure.

## Research conclusion

There is enough public information to design the genre and a pilot proposal.

There is not enough information to publish safely without a creator onboarding,
rights register, private/public content map and explicit approval workflow.


---

# Books and Intellectual-Property Map

Research date: 2026-07-31

## Principal books

### Tacco 12

Publisher: Sperling & Kupfer
Original publication: 2013

Public subject area:

- high heels, posture and presentation;
- confidence and self-expression;
- a practical, playful teaching format.

Potential video use:

- historical retrospective;
- how an early niche became a platform and business;
- confidence, presentation and the evolution of her positioning.

Default rights status: **permission required**.

### La vita inizia dove finisce il divano

Publisher: De Agostini
Publication: 2019

Public subject area:

- recognizing when an established life no longer fits;
- leaving expectations imposed by others;
- rebuilding after disruption;
- community, online identity and entrepreneurship;
- beginning again through action.

Potential video use:

- personal-story video essays;
- “decision anatomy” episodes;
- reinvention frameworks;
- narrative Shorts that lead to a practical question.

Default rights status: **permission required**.

### La mia posizione preferita

Publisher: De Agostini
Publication: 2021

Public subject area:

- women, money, success and power;
- feminist consciousness and public positioning;
- employment, entrepreneurship and leadership;
- fragility, freedom and changing things concretely.

Potential video use:

- opinion-led video essays;
- myth versus reality;
- workplace and negotiation scenarios;
- feminist explainers;
- money and power discussion.

Default rights status: **permission required**.

### Revoluscion

Publisher: De Agostini
Publication: 2022

Public subject area:

- “smart-shifting” rather than impulsive escape;
- small and large changes;
- fear, conformity and prejudice;
- constructing a life around genuine priorities;
- reflective exercises contributed with psychotherapist Laura Buonarrivo.

Potential video use:

- structured frameworks;
- exercises;
- transition plans;
- case-study diagnosis;
- decision-tree videos.

Default rights status: **permission required from all relevant rights holders**,
including confirmation of the scope of Laura Buonarrivo's contributed material.

## Associated shorter publication

### 12 regole per essere felici sui tacchi

Publisher: Sperling
Format: shorter practical ebook

Treat as a related publication, not as a separate strategic content pillar.

Default rights status: **permission required**.

## Adaptation rules

A book title or public synopsis is not permission to adapt the book.

For each source, record:

- author;
- publisher;
- co-author or contributor;
- territorial rights;
- language rights;
- audiovisual adaptation rights;
- excerpt limits;
- marketing permissions;
- permitted platforms;
- permitted monetization;
- term and revocation;
- required attribution.

## Safe pre-permission use

Before explicit adaptation rights are obtained, the pipeline may only:

- maintain bibliographic metadata;
- create internal topic maps from public publisher descriptions;
- propose original interview questions;
- create a video about the existence and high-level public premise of a book;
- use short quotations only after legal/editorial review.

It must not:

- reconstruct chapters;
- paraphrase substantial protected expression;
- translate or narrate the book;
- create “the book in 10 minutes” summaries;
- reproduce proprietary exercises;
- treat purchase of a copy as an adaptation license.

## Recommended rights strategy

Use books as **interview and topic anchors**, not as automatically ingested source
material.

The preferred workflow is:

1. Veronica selects a book-derived idea.
2. She records a fresh explanation or supplies a newly written source note.
3. The fresh source becomes the canonical production input.
4. The book is referenced and linked as context.
5. The video does not substitute for the book.

This protects both authenticity and commercial value.


---

# Genre and Channel Strategy

## Genre

```yaml
genreId: strategic-reinvention
creatorProfileId: veronica-benini
```

## Genre promise

Help viewers make deliberate changes in work, business, money, identity and personal
time through creator-led stories, strategic reframing and practical action.

## Target audience

Primary:

- Italian-speaking women considering a professional or personal change;
- freelancers and entrepreneurs who need clearer positioning or commercial strategy;
- multi-interest professionals who resist a single narrow identity;
- women seeking greater economic, professional or time autonomy.

Secondary:

- independent-business owners;
- creators and consultants;
- viewers interested in feminism, representation and practical life design;
- international viewers reached through approved localization.

## Recommended channel role

The channel should serve as a **public editorial and acquisition layer**, not a free
replacement for courses, `PRESENTE` or consultations.

```text
YouTube discovery
  → trusted long-form explanation
  → newsletter/free resource
  → paid course, membership or consultation
```

## Content tiers

### Tier A — Public discovery

Suitable for YouTube:

- original perspective on a broad problem;
- selected personal stories approved for public retelling;
- high-level frameworks;
- one practical exercise;
- public case studies;
- market and cultural commentary;
- answers to recurring audience questions.

### Tier B — Lead-generation depth

Suitable for gated free resources:

- worksheets;
- checklists;
- planning templates;
- self-assessment;
- extended examples;
- email mini-series.

### Tier C — Paid depth

Keep inside paid products:

- complete proprietary methods;
- full course sequences;
- detailed workbooks;
- premium podcast/video archives;
- direct feedback;
- community discussions;
- individual strategy.

### Tier D — Private or blocked

Never auto-produce:

- private correspondence;
- unapproved current life events;
- health, relationship, legal or safety matters;
- unpublished manuscripts;
- client-confidential material;
- content whose rights are unclear.

## Format portfolio

### Long-form flagship

Duration: 10–16 minutes
Purpose: positioning, trust and depth
Cadence: one per week during pilot

### Tactical lesson

Duration: 5–8 minutes
Purpose: solve one defined problem
Cadence: optional second weekly upload after validation

### Shorts

Duration: 25–55 seconds
Purpose: discovery, question framing and memorable reframes
Cadence: three per flagship episode

### Audio edition

Purpose: podcast-style consumption and accessibility
Condition: use original or explicitly approved voice; no automatic voice clone.

### Newsletter companion

Purpose: deepen the episode, capture email and route toward paid value.

## Narrative grammar

Every flagship episode should use:

1. **Provocative hook**
2. **Recognizable situation**
3. **Creator-owned story, observation or case**
4. **The conventional interpretation**
5. **Veronica's reframe**
6. **A named framework or ordered method**
7. **A realistic immediate action**
8. **A creator-specific CTA**

The structure is stable; the exact language remains human-authored or creator-approved.

## Channel architecture

### Recommended pilot

Use one Italian-primary YouTube channel.

For each approved Italian video:

- upload Italian original audio;
- provide localized titles, descriptions and subtitles;
- attach reviewed human-produced dubbed tracks where available;
- use one canonical video URL rather than duplicating the same video across many
  channels during the pilot.

YouTube supports additional audio tracks on a single video or Short. This reduces
channel fragmentation and consolidates performance signals.

### Do not rely on unreviewed auto-dubbing

YouTube automatic dubbing can be useful for discovery tests, but its own documentation
warns that errors can occur and automatic dubs cannot be edited. Because Veronica's
work relies on humour, wordplay, feminism and personal voice:

- set dubs to manual review;
- prefer Mediaforge-produced translations;
- review terminology and cultural adaptation;
- publish only approved languages.

### When to create separate channels

Create a dedicated localized channel only when:

- the language has a sustainable native publishing cadence;
- titles, thumbnails, community interaction and offers are localized;
- analytics show recurring audience demand;
- a reviewer can approve language and cultural nuance;
- the commercial funnel supports that market.

## Recommended language order

1. Italian — canonical, original voice and source of truth.
2. English — broad international reach and YouTube's strongest translation bridge.
3. Spanish — relevant to her Spain-based life and a large addressable audience.
4. German — strong market for structured professional and personal-development content.
5. French — relevant to her biography and suitable for the subject matter.
6. Portuguese — expansion after the workflow is stable.

This requires adding `it` to the current Mediaforge locale model.

## Success metrics

Primary:

- returning viewers;
- average percentage viewed;
- qualified newsletter conversions;
- paid-product assisted conversions;
- approval time per asset;
- production hours saved for Veronica.

Secondary:

- Shorts-to-long-form conversion;
- language-track watch time;
- comment quality;
- completion rate by format;
- localization defect rate.

Do not optimize the pilot primarily for raw publishing volume.


---

# Content Pillars and Formats

## Pillar 1 — Ricominciarsi / Strategic Reinvention

Viewer job:

> Help me understand what needs to change and build a realistic transition.

Long-form patterns:

- “You do not need to leave everything. You need to identify this first.”
- Anatomy of a reinvention decision.
- Small shifts that create irreversible change.
- What envy can reveal about an unlived life.
- A postmortem of a change that did not go to plan.

Shorts:

- one false belief;
- one decision question;
- one “before you quit” test;
- one line that reframes fear.

CTA:

- planning freebie;
- `Revoluscion` or related offer where rights and commercial strategy permit;
- consultation.

## Pillar 2 — Independent Work and Business

Viewer job:

> Help me turn experience and interests into a coherent, sellable offer.

Long-form patterns:

- Find the fil rouge across many interests.
- Why “choose one passion” can be bad positioning advice.
- Offer, positioning and content: which comes first?
- Why a business that depends on constant visibility is not independent.
- How to design a service around time constraints.

Shorts:

- positioning diagnosis;
- pricing or offer myth;
- one marketing anti-pattern;
- one question to test an idea.

CTA:

- `MULTIFAIGA`;
- business academy;
- strategy session.

## Pillar 3 — Storytelling and Communication

Viewer job:

> Help me communicate clearly without turning myself into a generic online persona.

Long-form patterns:

- Storytelling is structure, not oversharing.
- The difference between a story and a diary entry.
- How to use personal experience without making the audience do emotional labour.
- Why “authenticity” without a point is not a content strategy.
- Build a recurring format that viewers recognize.

Shorts:

- hook teardown;
- bad/good opening comparison;
- story beat in 40 seconds;
- phrase or naming mechanism.

CTA:

- `StoryFaiga`;
- content strategy course;
- newsletter strategy.

## Pillar 4 — Women, Money, Power and Position

Viewer job:

> Help me recognize double standards and take a practical position.

Long-form patterns:

- Why money is difficult to discuss.
- The cost of making women “acceptable”.
- Power without imitation of male leadership stereotypes.
- Boundaries as economic infrastructure.
- How objectification affects buying, work and visibility.

Shorts:

- one double standard;
- one sentence to use in negotiation;
- one myth;
- one cultural example with context.

CTA:

- book or related resource;
- newsletter;
- approved campaign.

Editorial rule:

Factual political, economic or health claims require citations and review. Do not
convert opinion into universal fact.

## Pillar 5 — Personal Time and Anti-Noise

Viewer job:

> Help me stop giving my time to systems that do not improve my life.

Long-form patterns:

- Time, not visibility, as the scarce asset.
- What leaving algorithmic platforms teaches a creator.
- The difference between growth and scale.
- How to design a private, accountable community.
- What to stop before adding another productivity system.

Shorts:

- one time audit;
- one algorithmic-pressure reframe;
- one “remove before optimize” action.

CTA:

- `PRESENTE`;
- newsletter;
- planning resource.

## Pillar 6 — Life Design in Practice

Viewer job:

> Show me how autonomy works in concrete travel, home and local-business decisions.

Long-form patterns:

- Solo travel as a graduated skill, not a personality type.
- Fear as information rather than prohibition.
- Designing a rental home without wasting money.
- Planning reversible changes.
- Local marketing that creates real-world participation.

Shorts:

- practical travel check;
- reversible-design principle;
- local-marketing example;
- planning shortcut.

CTA:

- `VIAGGETTY`;
- `LAVORETTY`;
- local marketing course.

## Episode modes

| Mode | Use | Typical duration |
|---|---|---:|
| Story → strategy | Personal story leads to framework | 12–16 min |
| Tactical lesson | Solve one specific problem | 5–8 min |
| Position essay | Opinion plus evidence and action | 10–14 min |
| Myth / reality | Correct an oversimplification | 6–10 min |
| Decision framework | Structured questions or tree | 8–12 min |
| Case diagnosis | Apply method to a supplied case | 10–15 min |
| Q&A | Answer an audience question | 4–8 min |
| Guided exercise | Viewer completes an action | 5–12 min |

## Short extraction rules

A Short must stand alone. It may derive from a long-form episode only when it contains:

- one complete claim;
- enough context to avoid distortion;
- one emotional or intellectual turn;
- one action or open question;
- no cliffhanger that misrepresents the long video.

Do not create Shorts from personal disclosures merely because the segment is dramatic.


---

# Public / Premium Funnel

## Objective

Use YouTube to increase qualified discovery without undermining Veronica's decision
to prioritize private, accountable and paid spaces.

## Funnel

```text
Short
  → flagship YouTube video
  → topic-specific free resource or newsletter
  → selected course / PRESENTE / consultation
```

## Value boundary

A public video should provide a complete and useful result, but not the entire paid
method.

### Public video may include

- the problem;
- a distinctive reframe;
- a high-level method;
- one worked example;
- one starter exercise;
- the decision criteria for next steps.

### Premium material retains

- full sequence;
- all worksheets;
- implementation variations;
- templates;
- detailed examples;
- feedback;
- community;
- accountability;
- access to Veronica.

## CTA mapping

| Pillar | Primary CTA | Secondary CTA |
|---|---|---|
| Reinvention | Planning resource / newsletter | Consultation |
| Business | Relevant academy or `MULTIFAIGA` | Strategy session |
| Storytelling | `StoryFaiga` | Content strategy |
| Women / power | Newsletter or book | `PRESENTE` |
| Time / anti-noise | `PRESENTE` | Newsletter |
| Travel / lifestyle | `VIAGGETTY` or `LAVORETTY` | Newsletter |

## Attribution model

Each episode manifest should store:

- target offer;
- campaign identifier;
- UTM parameters;
- landing page;
- publish language;
- source episode;
- content tier;
- rights scope.

## Guardrail

The factory must reject a public render when the source is marked:

- `premium`;
- `private`;
- `permission-required`;
- `blocked`;
- `sensitive-review`;

unless an explicit publication grant is present.


---

# Multilingual Strategy

## Canonical language

For this creator, **Italian must be canonical**.

The current Mediaforge locale model uses:

```text
en, de, es, fr, pt
```

Add:

```text
it
```

Do not translate an English reconstruction of an Italian source. The correct chain is:

```text
Italian human source
  → approved Italian script
  → language-specific adaptation
  → native review
  → dubbed audio, subtitles and localized metadata
```

## Translation modes

### Literal-safe

Use for:

- factual instructions;
- lists;
- simple planning steps;
- technical product explanations.

### Cultural adaptation required

Use for:

- humour;
- slang;
- playful brand terms;
- feminist and political framing;
- personal stories;
- Italian workplace or cultural examples;
- calls to action linked to market-specific products.

## Protected terms

The creator profile contains terms that should remain unchanged unless Veronica
approves a localized form:

- Spora
- StoryFaiga
- MULTIFAIGA
- VIAGGETTY
- LAVORETTY
- Corsetty
- PRESENTE
- Revoluscion

Each localized script should include a terminology report:

```json
{
  "preservedTerms": [],
  "adaptedTerms": [],
  "reviewNotes": []
}
```

## Publishing model

Preferred:

- one canonical video;
- localized title and description;
- language subtitles;
- reviewed additional audio tracks;
- language-specific CTA destination.

Fallback:

- separate rendered video per language only where the upload integration cannot attach
  additional audio tracks or the market requires materially different visuals/content.

## Voice policy

Priority:

1. Veronica records the canonical Italian audio.
2. Approved human dub actor.
3. Approved synthetic voice that is not presented deceptively.
4. YouTube auto-dub for low-risk experiments with manual publication review.

Voice cloning is disabled by default.

## Localization QA

Every language requires:

- semantic review;
- tone review;
- terminology review;
- claims/citations review;
- CTA and pricing review;
- subtitle timing review;
- pronunciation review;
- thumbnail text review.

## Language rollout

### Stage 1

Italian only. Prove the editorial and production loop.

### Stage 2

English and Spanish for the best-performing evergreen episodes.

### Stage 3

German and French based on watch-time and conversion evidence.

### Stage 4

Portuguese after the localized production and review workflow is stable.

## Technical output paths

Preserve the established Mediaforge paths:

```text
episodes/<id>/languages/script-it.md
episodes/<id>/languages/script-en.md
episodes/<id>/languages/script-es.md
episodes/<id>/languages/script-de.md
episodes/<id>/languages/script-fr.md
episodes/<id>/languages/script-pt.md

episodes/<id>/languages/short/script-it.md
episodes/<id>/languages/short/script-en.md
...
```

All active code must resolve these through `createEpisodePathResolver`.


---

# 90-Day Pilot Plan

## Pilot objective

Validate whether a creator-controlled, source-led factory can:

- preserve Veronica's authorship;
- save production time;
- create useful long-form and Shorts;
- grow qualified newsletter and offer traffic;
- localize proven content without voice dilution.

## Scope

- 12 Italian flagship videos
- 36 Italian Shorts
- localized pilot for the top 4 evergreen videos
- English and Spanish first
- reviewed subtitles and metadata for all pilot localizations
- no automatic public publishing

## Phase 0 — Agreement and setup, week 0

Deliverables:

- signed rights and responsibility matrix;
- public/premium/private content map;
- creator vocabulary and tone guide;
- approved source formats;
- approval SLA;
- channel and analytics access;
- pilot CTA and attribution plan.

Exit criteria:

- no unresolved voice, likeness or book-rights assumptions;
- creator profile signed off;
- one source package accepted by the pipeline.

## Phase 1 — Editorial proof, weeks 1–4

Cadence:

- 1 flagship Italian video per week;
- 3 Shorts per flagship;
- manual creator approval at script and final-render gates.

Recommended topics:

1. You do not need to leave everything: identify what must change.
2. Multi-interest is not confusion: find the fil rouge.
3. Storytelling is not oversharing.
4. Your time is a business constraint, not a reward.

Success criteria:

- creator rates voice fidelity at least 8/10;
- fewer than two major editorial rewrites per episode by week 4;
- no rights or source-provenance defects;
- measured production-time baseline.

## Phase 2 — Repeatability, weeks 5–8

Cadence:

- 1 flagship Italian video per week;
- 3 Shorts per flagship;
- standard source package and review checklist.

Recommended topics:

5. Why “choose one niche” is incomplete advice.
6. Public audience versus private community.
7. A realistic plan for professional repositioning.
8. Boundaries, money and independence.

Additional deliverable:

- localize the two strongest evergreen episodes into English and Spanish;
- upload reviewed language tracks where channel capabilities allow.

Success criteria:

- script approval within one review cycle for at least half of episodes;
- localization defect rate below 3 material issues per language;
- qualified CTA clicks measurable per episode.

## Phase 3 — Commercial validation, weeks 9–12

Recommended topics:

9. Fear is information: how to plan around it.
10. Content strategy before content volume.
11. Stop optimizing what should be removed.
12. A creator business that does not require permanent availability.

Additional deliverable:

- localize two more evergreen episodes;
- compare native Mediaforge dubs with YouTube auto-dub on internal/unlisted tests;
- produce pilot report.

## Pilot report

Measure:

- production hours per episode;
- Veronica review minutes;
- revision count;
- cost per long video and Short;
- average percentage viewed;
- returning viewers;
- subscriber conversion;
- newsletter conversion;
- offer-assisted conversion;
- language-track watch time;
- localization quality;
- incidents and blocked sources.

## Go / no-go criteria

Proceed when:

- authorship and tone are preserved;
- the workflow saves meaningful creator time;
- at least one public-to-owned-audience conversion path is proven;
- approval and rights controls work reliably;
- international versions retain meaning and commercial fit.

Do not scale merely because the factory can render more videos.


---

# Mediaforge Architecture Changes

## Known repository context

The existing repository is a private pnpm TypeScript/Node.js monorepo.

Primary operational surface:

```text
apps/cli
```

Relevant packages include:

```text
packages/shared
packages/domain
packages/config
packages/story-localization
packages/image-generation
packages/speech
packages/rendering
packages/metadata
packages/youtube-upload
packages/visual-planning
packages/observability
packages/dark-truth
```

Current canonical locales:

```text
en, de, es, fr, pt
```

Current variants:

```text
full, short
```

Current canonical script paths:

```text
episodes/<id>/languages/script-<locale>.md
episodes/<id>/languages/short/script-<locale>.md
```

Active code must use:

```text
createEpisodePathResolver
packages/shared/src/episode-filesystem.ts
```

Do not reintroduce legacy `script.md` layouts.

## Required product changes

### 1. Add Italian

Extend the locale union, Zod schemas, CLI options, path tests, metadata, speech,
caption and upload handling to include `it`.

Migration requirement:

- preserve all existing locales;
- do not change existing path semantics;
- provide compile-time exhaustive handling;
- update fixtures and snapshots.

### 2. Add generic genre registry

Introduce a genre abstraction rather than embedding prompt logic in CLI commands.

Suggested domain:

```text
packages/genres
  src/
    genre.ts
    registry.ts
    loaders/
    strategic-reinvention/
```

A genre definition should configure:

- editorial promise;
- episode modes;
- required beats;
- source policy;
- short extraction policy;
- visual defaults;
- metrics;
- approval requirements.

### 3. Add creator profiles

Suggested domain:

```text
packages/creator-profiles
```

A creator profile overlays:

- canonical locale;
- terminology;
- tone constraints;
- authorship policy;
- voice and likeness policy;
- content boundaries;
- offers and CTAs;
- approval authority.

The genre remains reusable.

### 4. Add content-source provenance

Create a first-class source manifest validated by Zod and JSON Schema.

Required invariants:

- every script beat traces to at least one source;
- rights and access level are explicit;
- source hash is stable;
- publishing is blocked for unclear rights;
- sensitive sources require review;
- private/premium source cannot become public by default.

### 5. Add source-led script adaptation

The stage must not behave like open-ended ghostwriting.

Inputs:

- approved source manifests;
- approved transcripts or notes;
- episode blueprint;
- creator profile;
- genre.

Outputs:

- canonical script;
- beat-to-source map;
- unsupported-inference report;
- quotations and claims register;
- editorial warnings.

For Veronica:

```text
generativeFirstPersonDrafting = false
generativeOpinionDrafting = false
```

### 6. Add approval domain

Approvals must be persistent, fingerprint-bound and audited.

Suggested package:

```text
packages/approvals
```

Required:

- stage and locale granularity;
- invalidation graph;
- second reviewer for high-risk material;
- CLI status/grant/reject/revoke;
- upload hard gate;
- structured observability events.

### 7. Add editorial-documentary visual planner

Do not reuse the `dark-truth` cinematic grammar by default.

Support:

- kinetic typography;
- creator footage;
- approved photos;
- diagrams;
- decision trees;
- timelines;
- worksheets;
- contextual B-roll;
- illustrative metaphors;
- 16:9 and independently composed 9:16 layouts.

### 8. Add multilingual-audio packaging

The rendering package should produce:

```text
master video
canonical audio
localized audio stems
localized subtitles
localized titles/descriptions
localized thumbnail text
audio-track manifest
```

The YouTube package should support a single canonical video with additional reviewed
audio tracks where the API and channel capability permit it.

Do not silently fall back to separate public uploads. The fallback must be explicit.

### 9. Add public/premium policy enforcement

An episode carries:

```text
contentTier: public | lead-generation | premium | private
```

The public renderer and uploader reject premium/private source leakage.

### 10. Add CTA attribution

Episode metadata must include:

- offer ID;
- campaign ID;
- locale-specific destination;
- UTM parameters;
- public/premium boundary;
- analytics correlation ID.

## Reliability work to preserve

The implementation must continue the existing direction:

- strict TypeScript;
- Zod at boundaries;
- explicit stage contracts;
- deterministic workspace resolution;
- idempotent and resumable commands;
- stable manifests;
- content fingerprints and invalidation;
- bounded concurrency;
- typed provider interfaces;
- structured errors and logs;
- dry-run support;
- duplicate-upload protection.

## Known risks to inspect before implementation

Do not assume these have been resolved:

- conflicting script paths and workspace resolvers;
- stale generated artifacts;
- stale `apps/cli/bin/mediaforge.js` distribution;
- per-scene speech generation inefficiency;
- unsafe image filenames;
- bearer-token leakage in telemetry;
- weak remote-render schemas;
- legacy and current pipeline coexistence;
- unverified edit-batch semantics;
- skeleton-only stories pipeline.

## Recommended implementation phases

### Phase A — read-only audit

- inspect repository and branch;
- map authoritative schemas and pipeline DAG;
- verify current test status;
- identify stale/legacy paths;
- write a plan and decision register;
- do not modify production behavior.

### Phase B — foundational domain

- add `it`;
- genre registry;
- creator profiles;
- source schema;
- approval domain.

### Phase C — pipeline integration

- source-led script adaptation;
- editorial visual planner;
- localization QA;
- audio-track packaging;
- CTA metadata.

### Phase D — uploader and safety

- publish gate;
- multi-language audio capability adapter;
- explicit fallback;
- duplicate prevention;
- audit logging.

### Phase E — pilot fixture

- one fully mocked Italian episode;
- English and Spanish localizations;
- full + Short;
- no real external API calls;
- deterministic acceptance tests.

## Definition of done

- no legacy path reintroduction;
- full strict TypeScript build;
- Zod validation at all file/provider/CLI boundaries;
- deterministic fixtures;
- unit and integration tests;
- resume and invalidation tests;
- approval bypass tests;
- rights-block tests;
- no secret leakage;
- documentation and migration guide;
- an operator can run an end-to-end dry run from a clean checkout.


---

# Veronica Onboarding Questionnaire

## 1. Goal and ownership

1. What is the primary objective: reach, authority, newsletter growth, course sales,
   `PRESENTE`, consultations or international expansion?
2. Whose YouTube channel will publish the content?
3. Who owns the channel, raw material, project files, rendered assets and translations?
4. Who has final editorial and publishing authority?
5. What result would make a 90-day pilot successful?

## 2. Human authorship and AI

6. Which uses of AI are acceptable?
   - transcription;
   - content indexing;
   - outline extraction;
   - editing and shortening;
   - translation;
   - subtitles;
   - metadata;
   - visual generation;
   - synthetic voice;
   - avatar or likeness.
7. Must every spoken sentence originate from text or audio you wrote/recorded?
8. May the system propose new examples or only structure supplied examples?
9. How should the use of AI be disclosed publicly?
10. Which stages must always be reviewed by you?

## 3. Source material

11. Which material can be supplied?
    - recordings;
    - newsletter drafts;
    - public newsletters;
    - podcasts;
    - course transcripts;
    - book manuscripts;
    - talks;
    - consultations;
    - audience questions;
    - photos and B-roll.
12. Which sources are public, paid, private or confidential?
13. Which topics or periods of your life are off limits?
14. Which recurring stories are approved for reuse?
15. May existing public posts be adapted, or must you supply a fresh recording?
16. How long should source files be retained?

## 4. Books and third-party rights

17. Which book rights do you control?
18. Which rights remain with publishers?
19. Are translations or audiovisual adaptations permitted?
20. Does any collaborator have rights in exercises, stories or chapters?
21. What attribution and linking is required?
22. Which book-derived topics should be fresh explanations rather than adaptations?

## 5. Voice and likeness

23. Will you record canonical Italian narration?
24. May edited excerpts from existing recordings be used?
25. Is a human dubbing actor acceptable?
26. Is synthetic dubbing acceptable?
27. Is voice cloning acceptable? Under which contract and revocation rules?
28. May supplied photographs and footage be used?
29. Is generated likeness or an avatar prohibited?
30. Which visual portrayals feel false or unacceptable?

## 6. Editorial identity

31. Provide ten examples that sound exactly like you.
32. Provide ten examples that do not sound like you.
33. Which words, jokes and branded terms must remain unchanged?
34. Which expressions should never appear?
35. How much colloquial or explicit language should remain on YouTube?
36. How should political or feminist positions be reviewed?
37. Which claims require sources on screen or in the description?
38. Which subjects should always include a professional disclaimer?

## 7. Public versus premium

39. What must remain exclusive to `PRESENTE`?
40. What must remain exclusive to each course?
41. How much of a method can a public video teach?
42. Which free resources should YouTube promote?
43. Which offer maps to each content pillar?
44. Are prices and offers localized by market?
45. Which CTA is appropriate when there is no direct offer?

## 8. Formats and schedule

46. Preferred long-form duration?
47. Preferred Short duration?
48. Talking head, voice-over, documentary essay or mixed?
49. How many videos can you realistically review per week?
50. Should the channel publish weekly or in seasons?
51. Which days should uploads occur?
52. Should comments be open, moderated or limited?
53. Who responds to comments?

## 9. Languages

54. Confirm Italian as the source language.
55. Rank English, Spanish, German, French and Portuguese.
56. Do you prefer one multilingual channel or separate channels?
57. Who approves each language?
58. May humour and branded terms be adapted?
59. Which markets have localized offers and support?
60. Are automatic YouTube dubs acceptable after manual review?

## 10. Approval and incident handling

61. Who can approve sources, scripts, dubs, thumbnails and publication?
62. What is the expected review turnaround?
63. What happens when a published video is no longer accurate or desired?
64. How quickly must content be unpublished after revocation?
65. Who handles copyright claims, complaints or corrections?
66. Which topics require a second reviewer?
67. How should current personal events be protected from automatic selection?

## 11. Commercial agreement

68. Fixed fee, revenue share or hybrid?
69. Who pays model, voice, rendering and review costs?
70. Who owns localized channels and their audiences?
71. What happens to assets and channels when the collaboration ends?
72. May the reusable genre be used with other creators?
73. May the Veronica creator profile be reused after termination? Recommended answer:
    no, except for required archival/audit retention.
74. Which reporting and analytics are shared?
75. What confidentiality terms apply?

## Required onboarding outputs

- signed content-rights matrix;
- approved creator profile;
- source inventory;
- public/premium/private map;
- voice and likeness authorization;
- terminology glossary;
- CTA catalogue;
- language approval matrix;
- review SLA;
- takedown and revocation process.


---

# Rights and Permissions Checklist

This is an operational checklist, not legal advice.

## Identity and brand

- [ ] Permission to use `Veronica Benini`.
- [ ] Permission to use `@Spora`.
- [ ] Permission to use logos and visual identity.
- [ ] Permission to use course and product names.
- [ ] Rules for domain names, handles and channel naming.

## Source content

- [ ] Creator owns or controls each source.
- [ ] Access level recorded.
- [ ] Public adaptation rights recorded.
- [ ] Commercial use recorded.
- [ ] Platform scope includes YouTube.
- [ ] Short-form extraction permitted.
- [ ] Translation rights recorded per language.
- [ ] Retention and deletion rules recorded.
- [ ] Revocation process agreed.

## Books

- [ ] Publisher rights reviewed.
- [ ] Audiovisual adaptation rights reviewed.
- [ ] Translation rights reviewed.
- [ ] Excerpt limits reviewed.
- [ ] Contributor rights reviewed.
- [ ] Attribution and purchase links agreed.
- [ ] No full-summary substitution for the book.

## Courses and premium material

- [ ] Public/premium boundary documented.
- [ ] Proprietary exercises listed.
- [ ] Paid transcripts excluded from automatic ingestion.
- [ ] Private community content excluded.
- [ ] Customer material excluded or anonymized with explicit permission.

## Voice

- [ ] Canonical recording permission.
- [ ] Editing permission.
- [ ] Dubbing permission.
- [ ] Synthetic voice permission, if any.
- [ ] Voice-clone training scope, if any.
- [ ] Model/provider named.
- [ ] Term, deletion and revocation specified.
- [ ] Disclosure policy specified.

## Likeness

- [ ] Photography usage.
- [ ] Video footage usage.
- [ ] Thumbnail usage.
- [ ] Generated likeness or avatar decision.
- [ ] Geographic and time scope.
- [ ] Takedown process.

## Publishing

- [ ] Channel ownership.
- [ ] Final approval authority.
- [ ] Auto-publishing disabled unless later authorized.
- [ ] Comment and moderation policy.
- [ ] Correction policy.
- [ ] Emergency takedown contact.
- [ ] Copyright-claim responsibility.
- [ ] Music, stock and generated-asset licenses.

## Localization

- [ ] Approved languages.
- [ ] Native reviewer per language.
- [ ] Protected terminology.
- [ ] Cultural adaptation rules.
- [ ] Local offer and pricing accuracy.
- [ ] Local disclaimers.
- [ ] Localized voice disclosure.

## Data protection and security

- [ ] Access roles.
- [ ] Encryption and secret management.
- [ ] Source retention.
- [ ] Deletion and termination.
- [ ] Audit logging.
- [ ] No sensitive source text in logs.
- [ ] Incident response.
- [ ] Provider data-use and training settings reviewed.

## Commercial terms

- [ ] Production fee.
- [ ] Revenue share.
- [ ] Cost allocation.
- [ ] Ownership of reusable genre.
- [ ] Ownership of creator profile.
- [ ] Ownership of project files and renders.
- [ ] Analytics access.
- [ ] Termination and transition.


---

# Sample Episode Briefs

These are proposals, not scripts. Each requires an approved Veronica source.

## 1. Non devi mollare tutto

Mode: decision framework
Pillar: strategic reinvention
Thesis: The first useful decision is not “leave or stay,” but identifying precisely
what no longer works and what must be protected.

Required source:

- Veronica's fresh explanation of smart-shifting;
- one approved personal or client-neutral example.

Public value:

- four-question diagnostic;
- one next action.

Premium boundary:

- full transition plan and workbook remain paid.

## 2. Essere Multifaiga non significa essere confusa

Mode: myth / reality
Pillar: business and repositioning
Thesis: Multiple interests become an advantage when connected by a buyer-relevant
fil rouge.

Required source:

- approved `MULTIFAIGA` explanation;
- one fresh example.

Shorts:

- “Choose one passion” is incomplete advice.
- The difference between interests and positioning.
- One fil-rouge question.

## 3. Storytelling non è raccontare tutto

Mode: tactical lesson
Pillar: storytelling
Thesis: A useful personal story has a point, a structure and a boundary.

Required source:

- fresh `StoryFaiga` explanation;
- one story that may be used publicly.

Framework:

- context;
- tension;
- turn;
- meaning;
- action.

## 4. Il tuo tempo è un vincolo di progetto

Mode: position essay
Pillar: time and independence
Thesis: Personal time should shape the business model before growth tactics are added.

Required source:

- Veronica's current position on time;
- approved examples of choices she made.

CTA:

- `PRESENTE` or planning resource.

## 5. Perché “trova la tua nicchia” può bloccarti

Mode: myth / reality
Pillar: business
Thesis: A niche is a commercial decision, not a prison for identity.

## 6. Pubblico non significa accessibile a tutti, sempre

Mode: position essay
Pillar: creator strategy
Thesis: A creator can build a public channel while preserving private spaces,
boundaries and accountability.

## 7. La paura è informazione

Mode: guided exercise
Pillar: life design
Thesis: Fear should produce a risk checklist and a smaller first step, not automatic
retreat or fake fearlessness.

## 8. Prima di creare più contenuti, decidi cosa devono fare

Mode: tactical lesson
Pillar: content strategy
Thesis: Content volume without a role in awareness, positioning, promotion or sales
creates work rather than a system.

## 9. Parlare di soldi è una competenza

Mode: position essay
Pillar: women, money and power
Thesis: Avoiding money language weakens negotiation and independence.

Requires:

- claim review;
- cultural localization;
- careful distinction between opinion and financial advice.

## 10. Cosa togliere prima di ottimizzare

Mode: decision framework
Pillar: anti-noise
Thesis: Removal often produces more time than a new productivity technique.

## 11. Viaggiare da sola si impara

Mode: story to strategy
Pillar: practical life design
Thesis: Solo travel is a progression of planning and exposure, not an innate personality
trait.

Requires:

- current safety review;
- no universal assurances;
- link to official travel advice where relevant.

## 12. Un business indipendente non dipende dalla tua presenza continua

Mode: case diagnosis
Pillar: business and time
Thesis: A business model should separate relationship and trust from permanent
availability.

CTA:

- relevant academy, membership or consultation.


---
