import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { logError } from '../../logUtils';
// import * as myExtension from '../../extension';

import * as projectUtils from '../../projectUtils';

async function waitForStatup(wf? : vscode.WorkspaceFolder) : Promise<void> {
       if (!wf) {
               return;
       }
       let wf2 = wf;
       let counter = 0;
       let p : Promise<void> = new Promise(async (resolve, reject) => {

               async function dowait() {
                       try {
                               await vscode.commands.executeCommand('nbls.project.info', wf2.uri.toString(), { projectStructure: true });
                               resolve();
                       } catch (e) {
                               if (counter < 60) {
                                       counter++;
                                       console.log(`Still waiting for NBLS start, ${counter} seconds elapsed.`);
                                       setTimeout(dowait, 1000);
                                       return;
                               } else {
                                       reject(e);
                               }
                       }
               }
               setTimeout(dowait, 1000);
       });
       return p;
}

let wf = vscode.workspace.workspaceFolders;

suite('Extension Test Suite', function() {
	vscode.window.showInformationMessage('Start all tests.');

        /* Wait for the NBLS to start */
	// the timeout will propagate to beforeAll hook
	this.timeout(30000);
	this.beforeAll(async () => {
	        await waitForStatup(wf![0]);
	});
	// revert for tests
	this.timeout(5000);

        // This test must be run first, in order to activate the extension (and wait for the activation to complete)
        test("Extension loaded", async () => {
                let extension = vscode.extensions.getExtension('oracle-labs-graalvm.gcn');
                assert(extension, "No GCN extension found!");

                await extension.activate();
        });
        // Check if gcn commands have been loaded
        test("GCN commands loaded", async () =>{
                let commands = await vscode.commands.getCommands(true);

                let containsGciCommands = false;
                for (const command of commands) {
                        if (command.indexOf("gcn.") == 0)
                                containsGciCommands = true;
                }

                assert.ok(containsGciCommands, "No GCN command has been loaded");

        });

        // Check if GCN welcome page opens
        test("GCN Welcome page", async () => {
                await vscode.commands.executeCommand("gcn.showWelcomePage");

                // The marvellous vscode completes the command, but still has the active tab set to the previous content,
                // so let's wait a while in a timeouted loop....
                let res = new Promise((resolve, reject) => {
                        let counter = 3; // by default test timeout is 5 secs, increase if set to > 4.
                        function w() {
                                // let label = vscode.window.tabGroups.activeTabGroup.activeTab?.label;
                                // console.log(`Waiting for the active editor to change: counter=${counter}, label =${label}`)
                                if (counter > 0 && vscode.window.tabGroups.activeTabGroup.activeTab?.label !== 'OCI Services for GCN') {
                                        counter--;
                                        setTimeout(w, 1000);
                                        return;
                                }
                                try {
                                        assert.strictEqual(vscode.window.tabGroups.activeTabGroup.activeTab?.label, "OCI Services for GCN", "Welcome page is not being shown");
                                        resolve(true);
                                } catch (err : any) {
                                        reject(err);
                                }
                        }
                        w();
                });
                return res;

        });

	// Check if the workspace has an OCI deployable project inside 
	test('Contains OCI Project', async () => {
		
		let wf = vscode.workspace.workspaceFolders;
		
		if (!wf?.length) {
			assert.throws(()=>logError("Extension host did not load any workspace fodlers!") );
		} else {
			const projectFolder = await projectUtils.getProjectFolder(wf[0]);
			assert.strictEqual(projectFolder.projectType, "GCN", "Specified project should be deployable to OCI");
		}

	});
});