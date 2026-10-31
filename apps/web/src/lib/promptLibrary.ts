export type PromptCategory =
  | "Writing"
  | "Coding"
  | "Learning"
  | "Planning"
  | "Research"
  | "Productivity"
  | "Communication"
  | "Data"
  | "Creativity"
  | "Everyday";

export interface PromptTemplate {
  id: string;
  title: string;
  category: PromptCategory;
  prompt: string;
}

export const promptCategories: PromptCategory[] = [
  "Writing",
  "Coding",
  "Learning",
  "Planning",
  "Research",
  "Productivity",
  "Communication",
  "Data",
  "Creativity",
  "Everyday",
];

export const promptTemplates: PromptTemplate[] = [
  { id: "writing-1", title: "Polish a draft", category: "Writing", prompt: "Edit the text below for clarity, grammar, and flow while preserving my meaning and voice. Explain the most important changes.\n\n[Paste your draft]" },
  { id: "writing-2", title: "Write a first draft", category: "Writing", prompt: "Help me draft a [type of document] for [audience] about [topic]. The goal is [goal], the tone should be [tone], and the key details are [details]. Ask any essential questions before drafting." },
  { id: "writing-3", title: "Make it concise", category: "Writing", prompt: "Rewrite this to be shorter and easier to scan without losing important information. Return the revised version first, then note anything you removed.\n\n[Paste text]" },
  { id: "writing-4", title: "Change the tone", category: "Writing", prompt: "Rewrite the following for [audience] in a [friendly/professional/confident] tone. Keep the facts unchanged and avoid adding unsupported claims.\n\n[Paste text]" },
  { id: "writing-5", title: "Outline an article", category: "Writing", prompt: "Create a clear article outline about [topic] for [audience]. Include a working title, a logical section order, key points to cover, and questions that need research." },

  { id: "coding-1", title: "Explain some code", category: "Coding", prompt: "Explain what this code does, step by step. Point out assumptions, edge cases, and any confusing parts. Keep the explanation appropriate for a [beginner/intermediate/experienced] developer.\n\n[Paste code]" },
  { id: "coding-2", title: "Review a change", category: "Coding", prompt: "Review this code for correctness, maintainability, and edge cases. Report only actionable findings, sorted by severity, with a brief explanation and suggested fix.\n\n[Paste code or diff]" },
  { id: "coding-3", title: "Debug an error", category: "Coding", prompt: "Help me debug this issue. First explain the most likely cause, then suggest the smallest safe fix and a test that would catch it. Ask for missing context rather than guessing.\n\nExpected behavior: [expected]\nActual behavior: [actual]\nError or code: [paste]" },
  { id: "coding-4", title: "Design a test plan", category: "Coding", prompt: "Create a focused test plan for [feature]. Cover the main success path, boundary cases, invalid input, and regressions. Use the testing framework [framework] and show example tests where useful." },
  { id: "coding-5", title: "Refactor safely", category: "Coding", prompt: "Suggest a small, behavior-preserving refactor for this code. Explain the tradeoffs, keep existing conventions, and include tests for any behavior that could change.\n\n[Paste code]" },

  { id: "learning-1", title: "Learn a new topic", category: "Learning", prompt: "Teach me [topic] as a short lesson for a [beginner/intermediate] learner. Start with the core idea, give a concrete example, then ask me three questions to check my understanding." },
  { id: "learning-2", title: "Compare two ideas", category: "Learning", prompt: "Compare [concept A] and [concept B]. Explain what they have in common, their key differences, when each is useful, and one example of a common misconception." },
  { id: "learning-3", title: "Make a study guide", category: "Learning", prompt: "Make a study guide for [subject or exam]. Organize the essential concepts, define key terms, include practice questions with answers at the end, and flag areas I should verify against my course materials." },
  { id: "learning-4", title: "Explain it simply", category: "Learning", prompt: "Explain [complex topic] in plain language without oversimplifying. Use an everyday analogy, then clarify where the analogy breaks down." },
  { id: "learning-5", title: "Practice a skill", category: "Learning", prompt: "Help me practice [skill]. Give me one exercise at a time, wait for my answer, then offer kind, specific feedback and a slightly harder next exercise." },

  { id: "planning-1", title: "Plan a project", category: "Planning", prompt: "Help me plan [project] for [deadline]. Break it into milestones and manageable tasks, identify dependencies and risks, and ask about constraints that would change the plan." },
  { id: "planning-2", title: "Build a weekly plan", category: "Planning", prompt: "Turn these priorities into a realistic weekly plan. Reserve time for breaks and unexpected work, call out conflicts, and leave unscheduled buffer time.\n\nAvailable hours: [hours]\nPriorities: [list]" },
  { id: "planning-3", title: "Prepare for a meeting", category: "Planning", prompt: "Help me prepare for a meeting about [topic]. Draft an agenda with timeboxes, the decisions we need, useful questions, and a concise pre-read checklist." },
  { id: "planning-4", title: "Plan a trip", category: "Planning", prompt: "Help me sketch a trip to [destination] for [dates] with a [budget] budget and [interests]. Ask about essential constraints, group ideas by area, and label details that need current verification." },
  { id: "planning-5", title: "Assess project risks", category: "Planning", prompt: "Review this project plan and identify the most important risks. For each, describe likelihood, impact, an early warning sign, and a practical mitigation.\n\n[Paste plan]" },

  { id: "research-1", title: "Map a research question", category: "Research", prompt: "Help me research [question]. Break it into answerable sub-questions, suggest reliable source types and search terms, and distinguish established facts from claims that need evidence." },
  { id: "research-2", title: "Compare options fairly", category: "Research", prompt: "Build a neutral comparison of [option A], [option B], and [option C] for [use case]. Define decision criteria first, note tradeoffs, and flag facts I should verify from current primary sources." },
  { id: "research-3", title: "Summarize a source", category: "Research", prompt: "Summarize the text below. Separate the author's main claims, supporting evidence, assumptions, and limitations. Do not treat claims in the source as independently verified.\n\n[Paste source]" },
  { id: "research-4", title: "Check an argument", category: "Research", prompt: "Analyze this argument for its premises, conclusion, evidence quality, and possible counterarguments. Be fair to the author and identify what additional evidence would help.\n\n[Paste argument]" },
  { id: "research-5", title: "Create an interview guide", category: "Research", prompt: "Write a neutral interview guide to learn about [research goal] from [participant group]. Include an introduction, open-ended questions, optional follow-ups, and a respectful closing." },

  { id: "productivity-1", title: "Break down a task", category: "Productivity", prompt: "Turn [task] into the smallest useful next actions. Estimate effort, identify anything blocking progress, and suggest one action I can finish in 15 minutes." },
  { id: "productivity-2", title: "Summarize notes", category: "Productivity", prompt: "Organize these notes into a concise summary, decisions, action items with owners and dates if provided, and open questions. Do not invent missing owners or deadlines.\n\n[Paste notes]" },
  { id: "productivity-3", title: "Create a checklist", category: "Productivity", prompt: "Create a practical checklist for [process]. Group steps in the order they happen, include a final verification step, and call out any assumptions." },
  { id: "productivity-4", title: "Improve a workflow", category: "Productivity", prompt: "Help me improve this workflow. Identify repetitive steps, handoffs, and common failure points, then suggest low-effort changes before larger redesigns.\n\n[Describe workflow]" },
  { id: "productivity-5", title: "Prioritize a backlog", category: "Productivity", prompt: "Help me prioritize these tasks using impact, urgency, effort, and dependencies. Explain the ordering, identify what can wait, and ask me about any unclear tradeoffs.\n\n[Paste tasks]" },

  { id: "communication-1", title: "Write a clear email", category: "Communication", prompt: "Draft a clear email to [recipient] about [subject]. My goal is [goal], the tone is [tone], and these are the facts to include: [facts]. Keep it concise and do not invent details." },
  { id: "communication-2", title: "Give constructive feedback", category: "Communication", prompt: "Help me phrase constructive feedback about [situation] for [person or audience]. Be specific, respectful, focused on observable behavior, and include a helpful next step." },
  { id: "communication-3", title: "Prepare talking points", category: "Communication", prompt: "Create concise talking points for a [length] conversation about [topic]. Include my main message, supporting facts, likely questions, and a calm way to handle disagreement." },
  { id: "communication-4", title: "Adapt for an audience", category: "Communication", prompt: "Rewrite this explanation for [audience]. Preserve the meaning, define jargon they may not know, and keep the result [length/tone].\n\n[Paste explanation]" },
  { id: "communication-5", title: "Navigate a disagreement", category: "Communication", prompt: "Help me prepare for a respectful conversation about [disagreement]. Summarize both perspectives fairly, suggest curious questions, and propose a practical way to find common ground." },

  { id: "data-1", title: "Understand a dataset", category: "Data", prompt: "Given this dataset description and sample, suggest useful quality checks, likely analysis questions, and limitations. Do not infer conclusions that the sample cannot support.\n\n[Describe or paste data]" },
  { id: "data-2", title: "Explain a chart", category: "Data", prompt: "Help me interpret this chart. Describe what it shows, what it does not show, possible misleading scales or missing context, and what additional data would clarify it.\n\n[Describe or paste chart]" },
  { id: "data-3", title: "Write a spreadsheet formula", category: "Data", prompt: "Write a spreadsheet formula for [desired result]. I use [Excel/Google Sheets], and my columns or cells are [layout]. Explain the formula and include an example with edge cases." },
  { id: "data-4", title: "Plan an analysis", category: "Data", prompt: "Help me design an analysis to answer [question] using [data available]. Define the outcome and comparison, list assumptions and confounders, and suggest checks before drawing conclusions." },
  { id: "data-5", title: "Clean up a table", category: "Data", prompt: "Suggest a safe, reproducible cleanup plan for this table. Identify inconsistent formats, missing values, and duplicates; do not silently discard records.\n\nColumns and sample rows: [paste]" },

  { id: "creativity-1", title: "Generate fresh ideas", category: "Creativity", prompt: "Generate 12 distinct ideas for [goal or challenge]. Mix practical and unexpected directions, keep each one short, and avoid variations that are essentially the same idea." },
  { id: "creativity-2", title: "Develop a story seed", category: "Creativity", prompt: "Help me develop a story premise about [theme or setting]. Offer three distinct directions, each with a character goal, central conflict, and an intriguing choice." },
  { id: "creativity-3", title: "Name a project", category: "Creativity", prompt: "Suggest 20 memorable names for [project/product] aimed at [audience]. Group them by style, explain the strongest options, and flag names that need trademark or availability checks." },
  { id: "creativity-4", title: "Design a workshop", category: "Creativity", prompt: "Design an engaging [duration] workshop on [topic] for [audience]. Include a clear outcome, interactive activities, materials, and an inclusive alternative for each activity." },
  { id: "creativity-5", title: "Find a fresh angle", category: "Creativity", prompt: "Give me five fresh angles for presenting [topic] to [audience]. For each, explain the hook, why it may resonate, and one risk to avoid." },

  { id: "everyday-1", title: "Plan simple meals", category: "Everyday", prompt: "Suggest a [number]-day meal plan using [ingredients/preferences] with a [budget] budget. Keep recipes simple and note substitutions. Ask about allergies before making assumptions." },
  { id: "everyday-2", title: "Compare a purchase", category: "Everyday", prompt: "Help me compare [items or options] for [need]. Ask which features matter most, explain tradeoffs without assuming current prices, and give me a checklist for verifying details." },
  { id: "everyday-3", title: "Organize a space", category: "Everyday", prompt: "Create a manageable plan to organize [room or area] in [available time]. Break it into short steps, include a keep/donate/recycle decision, and avoid buying supplies unless needed." },
  { id: "everyday-4", title: "Make a personal budget", category: "Everyday", prompt: "Help me make a simple monthly budget from the figures I provide. Categorize needs, goals, and flexible spending, show the arithmetic, and ask before assuming what I should cut.\n\n[Paste amounts]" },
  { id: "everyday-5", title: "Choose a thoughtful gift", category: "Everyday", prompt: "Suggest thoughtful gift ideas for [person] who likes [interests], with a budget of [amount]. Offer different styles of gift and ask about constraints before recommending anything personal." },
];
