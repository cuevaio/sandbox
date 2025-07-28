import { CodeSandbox } from "@codesandbox/sdk";

const sdk = new CodeSandbox(process.env.CSB_API_KEY);
const sandbox = await sdk.sandboxes.create({
	id: "rqfz8v",
});

console.log(sandbox.id);
const client = await sandbox.connect();

const output = await client.commands.run("echo 'Hello World'");

console.log(output); // Hello World

const lsResult = await client.commands.run("ls");

console.log(lsResult);

const cloneResult = await client.commands.run(
	"git clone https://github.com/cuevaio/pdf-to-html.git",
);

console.log(cloneResult);

const ls2Result = await client.commands.run("ls");

console.log(ls2Result);

await sdk.sandboxes.shutdown(sandbox.id);

console.log("Sandbox shutdown");
