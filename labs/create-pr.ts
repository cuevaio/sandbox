import { csb } from "@/lib/code-sandbox";

export type CreatePRResult = {
	success: boolean;
	data?: {
		prUrl: string;
		branchName: string;
		sandboxId: string;
		forked?: boolean;
		forkUrl?: string;
	};
	error?: string;
};

export type CreatePROptions = {
	repoUrl: string;
	commitMessage?: string;
	prTitle?: string;
	prBody?: string;
	fileChanges?: {
		path: string;
		content: string;
	}[];
};

/**
 * Creates a PR for a GitHub repository using CodeSandbox
 * @param options Configuration for creating the PR
 * @returns Promise with the result of the PR creation
 */
export async function createGitHubPR(
	options: CreatePROptions,
): Promise<CreatePRResult> {
	const {
		repoUrl,
		commitMessage = "feat: Automated update via AI agent",
		prTitle = "🤖 AI Agent Update: Automated changes",
		prBody = "This PR was automatically created by an AI agent.",
		fileChanges = [],
	} = options;

	try {
		// Validate environment variables
		const accessToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

		if (!accessToken) {
			return {
				success: false,
				error: "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is required",
			};
		}

		// Parse GitHub repo URL
		const repoMatch = repoUrl.match(
			/github\.com\/([^\/]+)\/([^\/]+)(?:\.git)?(?:\/)?$/,
		);
		if (!repoMatch) {
			return {
				success: false,
				error: "Invalid GitHub repository URL format",
			};
		}

		let [, owner, repoName] = repoMatch;
		repoName = repoName.replace(/\.git$/, "").toLowerCase();
		owner = owner.replace(/\.git$/, "").toLowerCase();

		// Initialize CodeSandbox
		const sdk = csb;
		const sandbox = await sdk.sandboxes.resume("wmwx2g");
		const client = await sandbox.connect();

		// Authenticate with GitHub
		await client.commands.run(
			`echo "${accessToken}" | gh auth login --with-token`,
		);
		await client.commands.run("gh auth setup-git");
		await client.commands.run("git config --global user.name 'code0'");
		await client.commands.run(
			"git config --global user.email 'anthony@crafterstation.com'",
		);

		// Get authenticated user info
		const userInfoResult = await client.commands.run(
			`gh api user --jq '.login'`,
		);
		console.log("User info result:", userInfoResult);
		const authenticatedUsername = userInfoResult.trim().toLowerCase();

		// Check if user owns the repository
		const isOwner = owner === authenticatedUsername;
		let workingRepoUrl = repoUrl;
		let forked = false;
		let forkUrl = "";

		if (!isOwner) {
			// Fork the repository
			try {
				forked = true;
				forkUrl = `https://github.com/${authenticatedUsername}/${repoName}`;
				workingRepoUrl = forkUrl;
				console.log("Forked repository:", forkUrl);
			} catch (error) {
				// Check if fork already exists
				try {
					await client.commands.run(
						`gh repo view ${authenticatedUsername}/${repoName}`,
					);
					forked = true;
					forkUrl = `https://github.com/${authenticatedUsername}/${repoName}`;
					workingRepoUrl = forkUrl;
					console.log("Using existing fork:", forkUrl);
				} catch {
					return {
						success: false,
						error: `Failed to fork repository and no existing fork found: ${error instanceof Error ? error.message : "Unknown error"}`,
					};
				}
			}
		}

		// Clone the repository (original or fork) if it doesn't exist
		const repoDir = repoName;
		let directoryExists = false;

		try {
			const testResult = await client.commands.run(
				`test -d ${repoDir} && echo "exists" || echo "not_exists"`,
			);
			directoryExists = testResult.trim() === "exists";
		} catch {
			directoryExists = false;
		}

		if (directoryExists) {
			// Check if it's a valid git repository
			try {
				await client.commands.run(`cd ${repoDir} && git status`);
				console.log("Using existing repository directory");

				// Ensure we're working with the correct remote
				if (forked) {
					try {
						await client.commands.run(
							`cd ${repoDir} && git remote set-url origin ${workingRepoUrl}`,
						);
					} catch {
						await client.commands.run(
							`cd ${repoDir} && git remote add origin ${workingRepoUrl}`,
						);
					}
					try {
						await client.commands.run(
							`cd ${repoDir} && git remote add upstream ${repoUrl}`,
						);
					} catch {
						// Upstream might already exist, update it
						await client.commands.run(
							`cd ${repoDir} && git remote set-url upstream ${repoUrl}`,
						);
					}
				}
			} catch {
				// Directory exists but isn't a valid git repository, remove it
				console.log("Removing invalid directory and cloning fresh");
				await client.commands.run(`rm -rf ${repoDir}`);
				directoryExists = false;
			}
		}

		if (!directoryExists) {
			// Repository doesn't exist or was removed, clone it
			await client.commands.run(`git clone ${workingRepoUrl} ${repoDir}`);
			if (forked) {
				// Add upstream remote for the original repository
				await client.commands.run(
					`cd ${repoDir} && git remote add upstream ${repoUrl}`,
				);
			}
		}

		// Switch to main branch and pull latest changes
		await client.commands.run(`cd ${repoDir} && git checkout main`);

		if (forked) {
			// For forks, sync with upstream first
			try {
				await client.commands.run(`cd ${repoDir} && git fetch upstream`);
				await client.commands.run(`cd ${repoDir} && git merge upstream/main`);
				await client.commands.run(`cd ${repoDir} && git push origin main`);
			} catch (error) {
				console.log("Warning: Could not sync fork with upstream:", error);
			}
		} else {
			await client.commands.run(`cd ${repoDir} && git pull origin main`);
		}

		// Create a new branch
		const branchName = `code0-${Date.now()}`;
		await client.commands.run(`cd ${repoDir} && git checkout -b ${branchName}`);

		// Apply file changes
		if (fileChanges.length > 0) {
			for (const change of fileChanges) {
				await client.fs.writeTextFile(
					`${repoDir}/${change.path}`,
					change.content,
				);
			}
		} else {
			// Default: Update README.md if no specific changes provided
			try {
				const readmeResult = await client.fs.readTextFile(
					`./${repoDir}/README.md`,
				);
				const readmeUpdated = `${readmeResult}\n\n## AI Agent Update\n\nThis update was made by an AI agent (code0) using the CodeSandbox API.\n\n- Automated file modification\n- Demonstration of AI-driven development workflow\n- Generated on: ${new Date().toISOString()}`;
				await client.fs.writeTextFile(`./${repoDir}/README.md`, readmeUpdated);
			} catch {
				// If README.md doesn't exist, create it
				const readmeContent = `# ${repoName}\n\n## AI Agent Update\n\nThis repository was updated by an AI agent (code0) using the CodeSandbox API.\n\n- Automated file modification\n- Demonstration of AI-driven development workflow\n- Generated on: ${new Date().toISOString()}`;
				await client.fs.writeTextFile(`./${repoDir}/README.md`, readmeContent);
			}
		}

		// Stage changes
		await client.commands.run(`cd ${repoDir} && git add .`);

		// Get authenticated user info for co-author
		const userEmailResult = await client.commands.run(
			`cd ${repoDir} && gh api user --jq '.email // (.login + "@users.noreply.github.com")'`,
		);
		const userEmail = userEmailResult.trim().replace(/"/g, "");
		const coAuthor = `${authenticatedUsername} <${userEmail}>`;

		// Commit changes
		const fullCommitMessage = `${commitMessage}\n\nCo-authored-by: ${coAuthor}`;
		await client.commands.run(
			`cd ${repoDir} && git commit -m "${fullCommitMessage}"`,
		);

		// Push branch to the working repository (original or fork)
		await client.commands.run(
			`cd ${repoDir} && git push --set-upstream origin ${branchName}`,
		);

		// Create PR
		let fullPrBody = `${prBody}\n\n### Technical Details:\n- **Commit Author**: code0 (AI Agent)\n- **PR Creator**: ${authenticatedUsername} (via personal access token)\n- **Generated**: ${new Date().toISOString()}\n- **Repository**: ${owner}/${repoName}\n- **Branch**: ${branchName}`;

		if (forked) {
			fullPrBody += `\n- **Fork**: ${forkUrl}\n- **Created from fork**: Yes`;
		}

		let prResult: string;
		if (forked) {
			// Create PR from fork to original repository
			prResult = await client.commands.run(
				`cd ${repoDir} && gh pr create --title "${prTitle}" --body "${fullPrBody}" --head ${authenticatedUsername}:${branchName} --base main --repo ${owner}/${repoName}`,
			);
		} else {
			// Create PR within the same repository
			prResult = await client.commands.run(
				`cd ${repoDir} && gh pr create --title "${prTitle}" --body "${fullPrBody}" --head ${branchName} --base main`,
			);
		}

		// Extract PR URL from result
		const prUrlMatch = prResult.match(/https:\/\/github\.com\/[^\s]+/);
		const prUrl = prUrlMatch
			? prUrlMatch[0]
			: `https://github.com/${owner}/${repoName}/pulls`;

		// Cleanup
		await sdk.sandboxes.shutdown(sandbox.id);

		return {
			success: true,
			data: {
				prUrl,
				branchName,
				sandboxId: sandbox.id,
				forked,
				forkUrl: forked ? forkUrl : undefined,
			},
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Unknown error occurred",
		};
	}
}

// Example usage function
export async function createPRExample() {
	const result = await createGitHubPR({
		repoUrl: "https://github.com/railly/tinte",
		prTitle: "🤖 AI Agent Update: Enhanced documentation",
		prBody: "This PR demonstrates automated GitHub workflow using AI agents.",
		fileChanges: [
			{
				path: "AI_NOTES.md",
				content: `# AI Agent Notes\n\nThis file was created by an AI agent to demonstrate automated workflows.\n\nCreated: ${new Date().toISOString()}\n`,
			},
		],
	});

	console.log("PR Creation Result:", result);
	return result;
}

await createPRExample();
