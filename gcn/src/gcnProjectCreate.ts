
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { MultiStepInput } from "./dialogs";
import { normalizeJavaVersion } from './graalvmUtils';

require('../lib/gcn.ui.api');

/**
 * Title for the whole Wizard
 */
 const title = 'Create New GCN Project';

 /**
  * Number of fixed steps. Update whenever steps in selectCreateOptions change
  */
 const fixedSteps = 11;

 /**
  * Global option
  */
 const LAST_PROJECT_PARENTDIR: string = 'lastMicronautProjectParentDir';

/**
 * Common type for list item display. Value is the code/id, label is the user-facing label, description goes to QuickPickItem.detail.
 */
interface ValueAndLabel {
    label : string;
    value : string;
    detail?: string;
}

/**
 * Internal state of the Wizard
 */
interface State {
    micronautVersion: { label: string, serviceUrl: string};
    applicationType: ValueAndLabel;
    
    javaVersion: {
        label: string, 
        value: string, 
        target: string
    };
    projectName: string;
    basePackage: string;
    language: ValueAndLabel;
    services: ValueAndLabel[];
    buildTool: ValueAndLabel;
    testFramework: ValueAndLabel;
    featureCategories: ValueAndLabel[];
    features: Map<string, ValueAndLabel[]>;
    clouds: ValueAndLabel[];
    target?: string;
}

/**
 * Creation options that the Wizard produces
 */
interface CreateOptions {
    micronautVersion: { label: string, serviceUrl: string};
    applicationType: string;
    javaVersion?: string;
    projectName: string;
    basePackage?: string;
    language: string;
    services?: string[];
    buildTool: string;
    testFramework: string;
    features?: string[];
    clouds?: string[];

    target?: string;
}

/**
 * External variable filled by resolve()
 */
declare var AotjsVM : any;

/**
 * Main entry point to the AOT.js-ed GCN CLI.
 */
var gcnApi : any = undefined;

async function initialize() : Promise<any> {
    if (gcnApi) {
        return new Promise((resolve, _reject) => { resolve(gcnApi); });
    } else {
        AotjsVM.run([]).then((vm : any) => {
            return gcnApi = vm.exports.gcn.ui.API;
        });
    }
}

const OPEN_IN_NEW_WINDOW = 'Open in new window';
const OPEN_IN_CURRENT_WINDOW = 'Open in current window';
const ADD_TO_CURRENT_WORKSPACE = 'Add to current workspace';

export async function createProject(context : vscode.ExtensionContext) : Promise<void> {
    var options : CreateOptions | undefined;
    await initialize();
    options = await initialize().then(() => {
        return selectCreateOptions();
    });

    /*
    for debugging

    options = {
        applicationType : 'APPLICATION',
        language: 'JAVA',
        micronautVersion: { label: '3.7.0', serviceUrl: ''},
        buildTool: 'GRADLE',
        testFramework: 'JUNIT',

        basePackage: 'com.example',
        projectName: 'demo',
        javaVersion: 'JDK_11'
    };
    */

    if (!options) {
        return;
    }

    const targetLocation = await selectLocation(context, options);
    if (!targetLocation) {
        return;
    }
    if (fs.existsSync(targetLocation)) {
        if (!fs.statSync(targetLocation).isDirectory()) {
            vscode.window.showErrorMessage(`The selected location ${targetLocation} is not a directory.`);
            return;
        }
        if (fs.readdirSync(targetLocation).filter(n => n == '.' || n == '..' ? undefined : n).length > 0) {
            vscode.window.showErrorMessage(`The selected location ${targetLocation} is not empty.`);
            return;
        }
    }
    await writeProjectContents(options, targetLocation);

    const uri = vscode.Uri.file(targetLocation);
    if (vscode.workspace.workspaceFolders) {
        const value = await vscode.window.showInformationMessage('New Micronaut project created', OPEN_IN_NEW_WINDOW, ADD_TO_CURRENT_WORKSPACE);
        if (value === OPEN_IN_NEW_WINDOW) {
            await vscode.commands.executeCommand('vscode.openFolder', uri, true);
        } else if (value === ADD_TO_CURRENT_WORKSPACE) {
            vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, undefined, { uri });
        }
    } else if (vscode.window.visibleTextEditors.length > 0) {
        const value = await vscode.window.showInformationMessage('New Micronaut project created', OPEN_IN_NEW_WINDOW, OPEN_IN_CURRENT_WINDOW);
        if (value) {
            await vscode.commands.executeCommand('vscode.openFolder', uri, OPEN_IN_NEW_WINDOW === value);
        }
    } else {
        await vscode.commands.executeCommand('vscode.openFolder', uri, false);
    }
}

async function writeProjectContents(options : CreateOptions, location : string) {
    if (!fs.existsSync(location)) {
        fs.mkdirSync(location, { recursive : true });
    }
    
    function fileHandler(pathName : any, bytes : any, _isBinary : any, isExecutable : any) {
        const p : string = pathName.$as('string');
        const exe : boolean = isExecutable.$as('boolean');
        const data = bytes.$as(Int8Array).buffer;

        const dir = path.dirname(p);

        const view = new Uint8Array(data);

        if (dir && dir != '.') {
            fs.mkdirSync(path.join(location, dir), { recursive : true });
        }
        fs.writeFileSync(path.join(location, p), view, { mode : exe ? 0o777 : 0o666 });
   }

   function j(multi?: string[]) {
    if (!multi) {
        return "";
    } else {
        return multi.join(',');
    }
   }

   let name = options.basePackage || 'com.example';
   // BUG: for some reason, the GCN CLI strips last part of the package name - the original Webapp uses it to create the archive name.
   if (options.projectName) {
    name = name + "." + options.projectName;
   } else {
    name = name + ".project";
   }
   try {
    await gcnApi.create(
        options.applicationType, 
        name,
        j(options.features),
        j(options.services),
        j(options.clouds),
        options.buildTool,
        options.testFramework,
        options.language,
        options.javaVersion,
        'gcn-vscode-extension',
        true,
        fileHandler
    );
   } catch (err) {
    vscode.window.showErrorMessage(`Project generation failed. See log for details`);
    console.log(err);
    throw err;
   }
}

async function selectLocation(context : vscode.ExtensionContext, options : CreateOptions) {
    const lastProjectParentDir: string | undefined = context.globalState.get(LAST_PROJECT_PARENTDIR);
    let defaultDir: vscode.Uri | undefined;
    if (lastProjectParentDir) {
        try {
            defaultDir = vscode.Uri.parse(lastProjectParentDir, true);
        } catch (e) {
            defaultDir = undefined;
        }
    } else {
        defaultDir = undefined;
    }
    const location: vscode.Uri[] | undefined = await vscode.window.showOpenDialog({
        defaultUri: defaultDir,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Choose Project Directory',
        openLabel: 'Create Here'
    });
    if (location && location.length > 0) {
        await context.globalState.update(LAST_PROJECT_PARENTDIR, location[0].toString());
        let appName = options.basePackage;
        if (appName) {
            appName += '.' + options.projectName;
        } else {
            appName = options.projectName;
        }
        return path.join(location[0].fsPath, options.projectName);
    } else {
        return undefined;
    }
}

/**
 * Compute total steps based on state/selections made.
 * @param state current state
 * @returns total steps
 */
    function totalSteps(state : Partial<State>) : number {
    return fixedSteps + (state.featureCategories?.length || 0);
}

function convertLabelledValues(items : any[]) : ValueAndLabel[] {
    const ret : {label: string, value: string}[]  = [];
    for (let i = 0; i < items.length; i++) {
        let v = items[i];
        ret.push({
            label: v.getLabel().$as('string') as string,
            value: v.getValueName().$as('string') as string
        });
    }
    return ret;
}

async function getApplicationTypes(): Promise<ValueAndLabel[]> {
    return convertLabelledValues(gcnApi.applicationTypes().getTypes().toArray());
}

function getJavaVersions(): string[] {
    const versions: string[] = [];

    let items = gcnApi.javaVersions().getOptions().toArray();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const s = item.getName().$as('string') as string;
        let match : string[] | null = s?.match(/JDK_(\d+)/);
        if (match && match.length > 1) {
            versions.push(match[1]);
        }
    }
    return versions;
}

function getDefaultJavaVersion() : string {
    let j = gcnApi.javaVersions().getDefaultOption();
    const s = j.getName().$as('string') as string;
    let match : string[] | null = s?.match(/JDK_(\d+)/);
    return match && match.length > 1 ? match[1] : s;

}

function getLanguages(): ValueAndLabel[] {
    return convertLabelledValues(gcnApi.languages().getOptions().toArray());
}

function getBuildTools() {
    return convertLabelledValues(gcnApi.buildTools().getOptions().toArray());
}

function getTestFrameworks() {
    return convertLabelledValues(gcnApi.testFrameworks().getOptions().toArray());
}

function getClouds() {
    const ret : ValueAndLabel[]  = [];
    const items = gcnApi.clouds().toArray();
    for (let i = 0; i < items.length; i++) {
        let v = items[i];
        ret.push({
            label: v.getTitle().$as('string') as string,
            value: v.getName().$as('string') as string
        });
    }
    return ret;
}

function getServices(): ValueAndLabel[] {
    const ret = [];
    let ss = gcnApi.services().toArray();
    for (let i = 0; i < ss.length; i++) {
        const item = ss[i];
        ret.push({
            label: item.getTitle().$as('string'),
            value: item.getName().$as('string'),
        })
    }
    return ret;
}

function getFeatureCategories() : string[] {
    const ret : string[] = [];
    let cats = gcnApi.features().keySet().toArray();
    for (let i = 0; i < cats.length; i++) {
        ret.push( cats[i].$as('string') as string);
    }
    return ret;
}

interface ValuePickItem extends vscode.QuickPickItem { 
    value : string 
};

function findCategoryObject(cat : string) {
    let cats = gcnApi.features().keySet().toArray();
    for (let i = 0; i < cats.length; i++) {
        if (cats[i].$as('string') == cat) {
            return cats[i];
        }
    }
    return undefined;
}

function getFeaturesFromCategory(category : string) : ValuePickItem[] {
    const ret : ValuePickItem [] = [];
    const key = findCategoryObject(category);
    if (!key) {
        return ret;
    }
    let features = gcnApi.features();
    let arr = features.get(key)?.toArray();
    if (!arr || arr.length == 0) {
        return [];
    }
    for (let i = 0; i < arr.length; i++) {
        let f = arr[i];
        let label : string = f.getTitle().$as('string');
        const val : string = f.getName().$as('string');
        const desc : string = f.getDescription().$as('string');
        const preview : boolean = f.isPreview().$as('boolean');
        const community : boolean = f.isCommunity().$as('boolean');

        if (preview) {
            label = '$(eye) ' + label;
        }
        if (community) {
            label = '$(github) ' + label;
        }

        ret.push({
            value : val,
            label: label,
            detail : desc

        });
    }
    return ret;
}

function getMicronautVersions() : { label : string }[] {
    return [ { label : gcnApi.micronautVersion().$as('string') as string }];
}

function findSelection(from: ValueAndLabel[], selected : ValueAndLabel[] | ValueAndLabel | undefined) {
    const sel = findSelectedItems(from, selected);
    return sel && sel.length > 0 ? sel[0] : undefined;
}

function findSelectedItems(from: ValueAndLabel[], selected : ValueAndLabel[] | ValueAndLabel | undefined) {
    const ret : ValueAndLabel[]= [];
    if (!selected) {
        return ret;
    }
    if (!Array.isArray(selected)) {
        selected = [ selected ];
    }
    const values : Set<string> = new Set();
    selected.forEach(vl => values.add(vl.value));

    for (let check of from) {
        if (values.has(check.value)) {
            ret.push(check);
        }
    }
    return ret;
}

async function selectCreateOptions(): Promise<CreateOptions | undefined> {
    const commands: string[] = await vscode.commands.getCommands();
    const graalVMs: {name: string, path: string, active: boolean}[] = commands.includes('extension.graalvm.findGraalVMs') ? await vscode.commands.executeCommand('extension.graalvm.findGraalVMs') || [] : [];

	async function collectInputs(): Promise<State> {
		const state = {} as Partial<State>;
        await MultiStepInput.run(input => pickMicronautVersion(input, state));
		return state as State;
	}

	async function pickMicronautVersion(input: MultiStepInput, state: Partial<State>) {
        const selected: any = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: totalSteps(state),
			placeholder: 'Pick Micronaut version',
			items: getMicronautVersions(),
			activeItems: state.micronautVersion,
			shouldResume: () => Promise.resolve(false)
        });
        state.micronautVersion = selected;
		return (input: MultiStepInput) => pickApplicationType(input, state);
	}

    async function pickApplicationType(input: MultiStepInput, state: Partial<State>) {
        const choices : ValueAndLabel[] = state.micronautVersion ? await getApplicationTypes() : [];
		const selected: any = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: totalSteps(state),
			placeholder: 'Pick application type',
			items: choices,
			activeItems: findSelection(choices, state.applicationType),
			shouldResume: () => Promise.resolve(false)
        });
        state.applicationType = selected;
		return (input: MultiStepInput) => pickJavaVersion(input, state);
	}

	async function pickJavaVersion(input: MultiStepInput, state: Partial<State>) {
        const items: {label: string, value: string, description?: string}[] = graalVMs.map(item => ({label: item.name, value: item.path, description: item.active ? '(active)' : undefined}));
        
        items.push({label: 'Other Java', value: '', description: '(manual configuration)'});
		const selected: any = await input.showQuickPick({
			title,
			step: 3,
			totalSteps: totalSteps(state),
			placeholder: graalVMs.length > 0 ? 'Pick project Java' : 'Pick project Java (no GraalVM registered)',
			items,
			activeItems: findSelection(items, state.javaVersion),
			shouldResume: () => Promise.resolve(false)
        });
        const version: string[] | null = selected ? selected.label.match(/Java (\d+)/) : null;
        const resolvedVersion = version && version.length > 1 ? version[1] : undefined;
        const supportedVersions = state.micronautVersion ? getJavaVersions() : [];
        const javaVersion = normalizeJavaVersion(resolvedVersion, supportedVersions);
        state.javaVersion = {
            label: selected.label,
            value: selected.value,
            target: javaVersion
        }
        if (!resolvedVersion) {
            let defVersion = getDefaultJavaVersion();
            vscode.window.showInformationMessage(`Java version not selected. The project will target Java ${defVersion}. Adjust the setting in the generated project file(s).`);
            state.javaVersion.target = defVersion;
        }
		return (input: MultiStepInput) => projectName(input, state);
	}

	async function projectName(input: MultiStepInput, state: Partial<State>) {
		state.projectName = await input.showInputBox({
			title,
			step: 4,
			totalSteps: totalSteps(state),
			value: state.projectName || 'demo',
			prompt: 'Provide project name',
			validate: () => Promise.resolve(undefined),
			shouldResume: () => Promise.resolve(false)
		});
		return (input: MultiStepInput) => basePackage(input, state);
	}

	async function basePackage(input: MultiStepInput, state: Partial<State>) {
		state.basePackage = await input.showInputBox({
			title,
			step: 5,
			totalSteps: totalSteps(state),
			value: state.basePackage || 'com.example',
			prompt: 'Provide base package',
			validate: () => Promise.resolve(undefined),
			shouldResume: () => Promise.resolve(false)
		});
		return (input: MultiStepInput) => pickLanguage(input, state);
	}

	async function pickLanguage(input: MultiStepInput, state: Partial<State>) {
        const choices = getLanguages();
		const selected: any = await input.showQuickPick({
			title,
			step: 6,
			totalSteps: totalSteps(state),
            placeholder: 'Pick project language',
            items: choices,
            activeItems: findSelection(choices, state.language),
			shouldResume: () => Promise.resolve(false)
        });
        state.language = selected;
		return (input: MultiStepInput) => pickServices(input, state);
	}

	async function pickServices(input: MultiStepInput, state: Partial<State>) {
        const choices = state.micronautVersion && state.applicationType && state.javaVersion ? getServices() : [];
		const selected: any = await input.showQuickPick({
			title,
			step: 7,
			totalSteps: totalSteps(state),
            placeholder: 'Pick project services',
            items: choices,
            activeItems: findSelectedItems(choices, state.services),
            canSelectMany: true,
			shouldResume: () => Promise.resolve(false)
        });
        state.services = selected;
		return (input: MultiStepInput) => pickBuildTool(input, state);
	}

	async function pickBuildTool(input: MultiStepInput, state: Partial<State>) {
        const choices = getBuildTools();
		const selected: any = await input.showQuickPick({
			title,
			step: 8,
			totalSteps: totalSteps(state),
            placeholder: 'Pick build tool',
            items: choices,
            activeItems: findSelection(choices, state.buildTool),
			shouldResume: () => Promise.resolve(false)
        });
        state.buildTool = selected;
		return (input: MultiStepInput) => pickTestFramework(input, state);
	}

	async function pickTestFramework(input: MultiStepInput, state: Partial<State>) {
        const choices = getTestFrameworks();
		const selected: any = await input.showQuickPick({
			title,
			step: 9,
			totalSteps: totalSteps(state),
            placeholder: 'Pick test framework',
            items: choices,
            activeItems: findSelection(choices, state.testFramework),
			shouldResume: () => Promise.resolve(false)
        });
        state.testFramework = selected;
        return (input: MultiStepInput) => pickCloud(input, state);
	}

    async function pickCloud(input : MultiStepInput, state : Partial<State>) {
        const choices = getClouds() || [];
		const selected: any = await input.showQuickPick({
			title,
			step: 10,
			totalSteps: totalSteps(state),
            placeholder: 'Pick cloud environment',
            items: choices,
            activeItems: findSelectedItems(choices, state.clouds),
            canSelectMany: true,
			shouldResume: () => Promise.resolve(false)
        });
        state.clouds = selected;
        return (input: MultiStepInput) => pickFeatureCategories(input, state);
    }

    async function pickFeatureCategories(input : MultiStepInput, state : Partial<State>) {
        const cats : string[] = getFeatureCategories();
        const choices = cats.map((v : string) => ({ label : v, value: v }));
		const selected: any = await input.showQuickPick({
			title,
			step: 11,
			totalSteps: totalSteps(state),
            placeholder: 'Choose categories to include features from',
            items: choices,
            activeItems: findSelectedItems(choices, state.featureCategories),
            canSelectMany: true,
			shouldResume: () => Promise.resolve(false)
        });
        state.featureCategories = selected;
        if (selected.length > 0) {
            const chooseFrom = selected.map((c : ValueAndLabel) => c.value);
            return (input: MultiStepInput) => pickFeaturesFromCategory(input, state, chooseFrom, selected[0].value);
        } else {
            return undefined;
        }
    }

    async function pickFeaturesFromCategory(input : MultiStepInput, state : Partial<State>, cats : string[], category : string) {
        const choices = getFeaturesFromCategory(category);
        const idx = cats.indexOf(category);
		const selected: any = await input.showQuickPick({
			title,
			step: fixedSteps + idx + 1,
			totalSteps: totalSteps(state),
            placeholder: `Pick feature(s) for ${category} category`,
            items: choices,
            activeItems: findSelectedItems(choices, state.features?.get(category) || []),
            canSelectMany: true,
			shouldResume: () => Promise.resolve(false)
        });
        if (!state.features) {
            state.features = new Map();
        }
        state.features?.set(category, selected as ValueAndLabel[]);
        if (idx >= 0 && idx < cats.length - 1) {
            return (input: MultiStepInput) => pickFeaturesFromCategory(input, state, cats, cats[idx + 1]);
        } else {
            return undefined;
        }
    }
    const s : State = await collectInputs();
    if (!s) {
        return undefined;
    }
    
    function values(vals : ValueAndLabel[] | undefined) {
        if (!vals || vals.length == 0) {
            return undefined;
        }
        return vals.map((v) => v.value);
    }
    
    const featureList: string[] = [];
    for (const cat of s.featureCategories) {
        const list = values(s.features?.get(cat.value));
        if (list) {
            featureList.push(...list);
        }
    }

    return {
        micronautVersion : { 
            label : s.micronautVersion.label,
            serviceUrl : s.micronautVersion.serviceUrl
        },
        applicationType: s.applicationType.value,
        buildTool: s.buildTool.value,
        language : s.language.value,
        testFramework: s.testFramework.value,

        basePackage : s.basePackage,
        projectName: s.projectName,
        javaVersion: "JDK_" + s.javaVersion.target,

        clouds: values(s.clouds),
        services: values(s.services),
        features: featureList.length > 0 ? featureList : undefined
    };
}

export function getGCNHome() : string {
    let gcnHome: string = vscode.workspace.getConfiguration('gcn').get('oci.home') as string;
    if (gcnHome) {
        return gcnHome;
    }
    return process.env['OCI_HOME'] as string;
}

