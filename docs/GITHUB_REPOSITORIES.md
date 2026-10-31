# GitHub repositories

Use **GitHub repository** in the chat composer to browse a repository and
attach source files to a message.

- Enter an HTTPS `github.com/owner/repository` URL. Public repositories do not
  need a token.
- For a private repository, provide a fine-grained personal access token scoped
  to that repository with **Contents: read-only** permission.
- Select up to 10 text files on the repository's default branch. Each file
  can be up to 180 KB and must be valid UTF-8 text. Binary and oversized files
  cannot be attached.
- The token is sent only to CONDUIT's local API for GitHub requests. It is
  temporary, never saved, and cleared when the picker closes.
- Repository metadata and contents are not saved as a separate connection.
  Selected file contents are included in the encrypted chat history and sent
  to the configured AI provider only when you send the message.

GitHub access is read-only. Large repositories may have a truncated file list;
the picker shows at most 2,500 entries.
