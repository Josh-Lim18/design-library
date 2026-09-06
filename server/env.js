// Load a local .env file (KEY=value lines) into process.env before anything
// else reads it. Imported first from server/index.js so ANTHROPIC_API_KEY and
// friends are available to every module. No .env file? That's fine.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}
