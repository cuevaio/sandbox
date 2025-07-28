import { CodeSandbox } from "@codesandbox/sdk";

const accessToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

const sdk = new CodeSandbox(process.env.CSB_API_KEY);
const sandbox = await sdk.sandboxes.resume("wmwx2g");

console.log(sandbox.id);
const client = await sandbox.connect();

// Authenticate with GitHub using the personal access token (this will make cuevaio the PR creator)
await client.commands.run(`echo "${accessToken}" | gh auth login --with-token`);
await client.commands.run("gh auth setup-git");
await client.commands.run("git config --global user.name 'code0'");
await client.commands.run(
	"git config --global user.email 'anthony@crafterstation.com'",
);

await client.commands.run("cd pdf-to-html && git checkout main");

// Create a new branch for the AI agent changes
const branchName = `code0-${Date.now()}`;
await client.commands.run(`cd pdf-to-html && git checkout -b ${branchName}`);

const readmeResult = await client.fs.readTextFile("./pdf-to-html/README.md");

const readmeUpdated = `${readmeResult}\n\n## AI Agent Update\n\nThis update was made by an AI agent (code0) using the CodeSandbox API.\n\n- Automated file modification\n- Demonstration of AI-driven development workflow\n- Generated on: ${new Date().toISOString()}`;

await client.fs.writeTextFile("./pdf-to-html/README.md", readmeUpdated);

// Stage the changes (already in pdf-to-html directory)
await client.commands.run("cd pdf-to-html && git add .");

// Check git status before committing
await client.commands.run("cd pdf-to-html && git status");

// Get the authenticated GitHub user's information for co-author
const userInfoResult = await client.commands.run("cd pdf-to-html && gh api user --jq '.login'");
const username = userInfoResult.trim();
const userEmailResult = await client.commands.run("cd pdf-to-html && gh api user --jq '.email // (.login + \"@users.noreply.github.com\")'");
const userEmail = userEmailResult.trim().replace(/"/g, ''); // Remove quotes
const coAuthor = `${username} <${userEmail}>`;

// Commit the changes (author will be code0, but PR creator will be cuevaio via token)
const commitMessage =
	`feat: AI agent update via CodeSandbox API\n\nAutomated update by code0 AI agent including:\n- Enhanced README documentation\n- Timestamp and metadata addition\n\nCo-authored-by: ${coAuthor}`;
await client.commands.run(`cd pdf-to-html && git commit -m "${commitMessage}"`);

// Push the branch using authenticated credentials (cuevaio's token)
await client.commands.run(
	`cd pdf-to-html && git push --set-upstream origin ${branchName}`,
);

// Create a PR using GitHub CLI (authenticated with cuevaio's token, so PR creator will be cuevaio)
const prTitle = "🤖 AI Agent Update: Automated documentation enhancement";
const prBody = `## AI Agent Contribution

This PR was automatically created by an AI agent (code0) to demonstrate automated development workflows.

### Changes Made:
- Enhanced README.md with AI agent metadata  
- Added timestamp and automation information
- Demonstrated CodeSandbox API integration

### Author Details:
- **Commit Author**: code0 (AI Agent)
- **PR Creator**: cuevaio (via personal access token)
- **Generated**: ${new Date().toISOString()}

### Technical Implementation:
- Automated via CodeSandbox SDK
- Uses terminal API for git operations
- Demonstrates AI agent workflow`;

// Create PR directly
console.log("=== CREATING PR ===");
await client.commands.run(
	`cd pdf-to-html && gh pr create --title "${prTitle}" --body "${prBody}" --head ${branchName} --base main`,
);

// Show final git status and recent commits
await client.commands.run("cd pdf-to-html && git status");
await client.commands.run("cd pdf-to-html && git log --oneline -3");

// Cleanup
await sdk.sandboxes.shutdown(sandbox.id);
