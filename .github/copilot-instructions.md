# Project Guidelines

## Git Workflow

- At the start of each task, check the working tree and pull the latest changes with `git pull --ff-only` before investigating or editing project files.
- Preserve pre-existing working-tree changes. Do not stage or commit changes that are not part of the current task; ask before proceeding if task changes overlap with pre-existing edits.
- After completing a task, stage only the changes made for that task, create a descriptive commit, and push the current branch with `git push`.
- Do not create an empty commit when a task produces no repository changes. Report that no push was needed.
- Never force-push. If a pull, commit, or push fails, stop and report the error rather than bypassing it.
