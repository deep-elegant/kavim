# Rule: Generating a plan file

## Goal
based on an initial user prompt create a plan with snippets of the code and deep explanation for a AI assistant how to develop it. Have [ ] next to each task. the explanation should be clear so also junior developer can understand it.


## Output
- **Format:** Markdown (`.md`)
- **Location:** `/spec/plan/`
- **Filename:** `plan-[feature-name].md` (e.g., `plan-user-profile-editing.md`)

## Process
-   **Receive user feature description:** The user explain in high level about the feature
-   **(optional) Files and images for reference:** The user points the AI to a specific files (from codebase or external).
-   **Ask Clarifying Questions:** Before writing the Plan, the AI *should* ask clarifying questions to gather sufficient detail. The goal is to understand the whole picture, the AI should ask questions if:
    - the AI see potential problems or anomalies that need to be settled down.
    - The details the user provided are incomplete.  
Make sure to provide options in letter/number lists so I can respond easily with my selections.
-   **Generate Tasks:** Based on the user description and the external files, create a plan file and generate the main, high-level tasks with snippets of the code and deep explanation for a junior developer how to develop it.
    - Each task must include [ ] so it can be tracked as a checklist.
    - Snippets should be minimal and illustrative, not full implementations unless required.
    - High-level tasks should explain the why and how, not just the what.
-   **Identify Risks & Edge Cases**: Add notes on potential risks, dependencies, or edge cases to consider during implementation.
-   **Inform the user:** Present these tasks to the user in the specified format. For example, say:
"I have generated the high-level tasks based description and the sources you provided (if they were provided). Respond with 'Go' to proceed, or request adjustments if the plan misses something.".
-   **Wait for Confirmation:** Pause and wait for the user to respond with "Go".

## Final instructions
1. Remember! After creating the inital draft of the tasks, wait for the user to respond with "Go".
