/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as decompress from 'decompress';
import { getMicronautHome, getMicronautLaunchURL } from './utils';
import { getJavaHome, getJavaVMs } from "../../common/lib/utils";
import { simpleProgress, MultiStepInput, handleNewGCNProject } from "../../common/lib/dialogs";
import { downloadJSON } from "../../common/lib/connections";

const HTTP_PROTOCOL: string = 'http://';
const HTTPS_PROTOCOL: string = 'https://';
const MICRONAUT_LAUNCH_URL: string = 'https://launch.micronaut.io';
const MICRONAUT_SNAPSHOT_URL: string = 'https://snapshot.micronaut.io';
const APPLICATION_TYPES: string = '/application-types';
const SELECT_OPTIONS: string = '/select-options';
const FEATURES: string = '/features';
const VERSIONS: string = '/versions';
const CREATE: string = '/create';
const LAST_PROJECT_PARENTDIR: string = 'lastCreateProjectParentDirs';

let cliMNVersion: {label: string; serviceUrl: string; description: string} | undefined;

export async function creatorInit() {
    cliMNVersion = undefined;
    const micronautHome: string = getMicronautHome();
    if (micronautHome) {
        let mnPath = path.join(micronautHome, 'bin', 'mn');
        if (process.platform === 'win32') {
            mnPath += '.bat';
        }
        if (fs.existsSync(mnPath)) {
            try {
                const info: string[] | null = cp.execFileSync(mnPath, ['--version'], { env: { JAVA_HOME: getJavaHome() } }).toString().match(/.*:\s*(\S*)/);
                if (info && info.length >= 2) {
                    cliMNVersion = { label: info[1], serviceUrl: mnPath, description: '(using local CLI)' };
                }
            } catch (e) {
                vscode.window.showErrorMessage(`Cannot get Micronaut version: ${e}`);
            }
        }
    }
}

export async function createProject(context: vscode.ExtensionContext) {
    const options = await selectCreateOptions(context);
    if (options) {
        let created = false;
        if (options.url.startsWith(HTTP_PROTOCOL) || options.url.startsWith(HTTPS_PROTOCOL)) {
            try {
                const downloadedFile = await downloadProject(options);
                const files = await decompress(downloadedFile, options.target, { strip: 1 });
                fs.unlinkSync(downloadedFile);
                created = files.length > 0;
            } catch (e) {
                fs.rmdirSync(options.target, { recursive: true });
                vscode.window.showErrorMessage(`Cannot create Micronaut project: ${e}`);
            }
        } else {
            try {
                const out = cp.execFileSync(options.url, options.args, { cwd: path.dirname(options.target), env: {JAVA_HOME: getJavaHome() } });
                created = out.toString().indexOf('Application created') >= 0;
            } catch (e: any) {
                vscode.window.showErrorMessage(`Cannot create Micronaut project: ${e.message}`);
            }
        }
        if (created) {
            if (options.java) {
                const commands: string[] = await vscode.commands.getCommands();
                if (commands.includes('extension.graalvm.selectGraalVMHome')) {
                    await vscode.commands.executeCommand('extension.graalvm.selectGraalVMHome', options.java, true);
                }
            }
            const uri = vscode.Uri.file(options.target);
            handleNewGCNProject(context, uri, "Micronaut");
        }
    }
}

async function selectCreateOptions(context: vscode.ExtensionContext): Promise<{url: string; args?: string[]; name: string; target: string; buildTool: string; java?: string} | undefined> {
    const javaVMs = await getJavaVMs();
    interface State {
		micronautVersion: {label: string; serviceUrl: string};
		applicationType: {label: string; name: string};
        javaVersion: {label: string; value: string; target: number};
        projectName: string;
        basePackage: string;
        language: {label: string; value: string};
        features: {label: string; detail: string; name: string}[];
        buildTool: {label: string; value: string};
        testFramework: {label: string; value: string};
	}

	async function collectInputs(): Promise<State> {
		const state = {} as Partial<State>;
        await MultiStepInput.run(input => pickMicronautVersion(input, state));
		return state as State;
	}

    const title = 'Create Micronaut Project';

    /**
     * Compute total steps based on state/selections made.
     * @param state current state
     * @returns total steps
     */
    function totalSteps(_ : Partial<State>) : number {
        return 9;
    }

	async function pickMicronautVersion(input: MultiStepInput, state: Partial<State>) {
        const microVersions = await getMicronautVersions();
        if(microVersions.length === 0)
            return undefined;
        const selected: any = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: totalSteps(state),
			placeholder: 'Pick Micronaut version',
			items: microVersions,
			activeItems: state.micronautVersion,
			shouldResume: () => Promise.resolve(false)
        });
        state.micronautVersion = selected;
		return (input: MultiStepInput) => pickApplicationType(input, state);
	}

	async function pickApplicationType(input: MultiStepInput, state: Partial<State>) {
		const selected: any = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: totalSteps(state),
			placeholder: 'Pick application type',
			items: state.micronautVersion ? await getApplicationTypes(state.micronautVersion) : [],
			activeItems: state.applicationType,
			shouldResume: () => Promise.resolve(false)
        });
        state.applicationType = selected;
		return (input: MultiStepInput) => pickJavaVersion(input, state);
	}

	async function pickJavaVersion(input: MultiStepInput, state: Partial<State>) {
        const javaVersions = state.micronautVersion ? await getJavaVersions(state.micronautVersion) : { default: 11, versions: [] };
        const supportedVersions = javaVersions.versions.sort((a, b) => b - a);
        
        function isJavaAccepted(java : string) : boolean {
            const resolvedVersion = parseJavaVersion(java);
            if (!resolvedVersion) {
                // don't know, let the user choose
                return true;
            }
            return normalizeJavaVersion(resolvedVersion, supportedVersions, -1) > -1;
        }

        const items: {label: string; value: string; description?: string}[] = javaVMs.
            filter(item => isJavaAccepted(item.name)).
            map(item => ({label: item.name, value: item.path, description: item.active ? '(active)' : undefined}));
        
        items.push({label: 'Other Java', value: '', description: '(manual configuration)'});
		const selected: any = await input.showQuickPick({
			title,
			step: 3,
			totalSteps: totalSteps(state),
			placeholder: 'Select installed Java runtime to use for local builds',
			items,
			activeItems: state.javaVersion,
			shouldResume: () => Promise.resolve(false)
        });
        const resolvedVersion = selected ? parseJavaVersion(selected.label) : undefined;
        const javaVersion = normalizeJavaVersion(resolvedVersion, supportedVersions, javaVersions.default);
        state.javaVersion = {
            label: selected.label,
            value: selected.value,
            target: javaVersion
        };
        if (!resolvedVersion) {
            vscode.window.showInformationMessage('Java version not selected. The project will target Java 8. Adjust the setting in the generated project file(s).');
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
            // From OCI: Name cannot start and end with '-' (hyphen), have '--' (sequential hyphen), and can only consist of ASCII letter, digit, '_' (underscore) or '-' (hyphen) characters.
			validate: (value: string) => Promise.resolve((/^[A-Za-z0-9_]([A-Za-z0-9_]|-(?!-))*[A-Za-z0-9_]?$/.test(value)) ? undefined : 'Name cannot start and end with "-" (hyphen), have "--" (sequential hyphen), and can only consist of ASCII letter, digit, "_" (underscore) or "-" (hyphen) characters'),
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
			validate: (value: string) => Promise.resolve((/^[a-z_][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(value)) ? undefined : 'Invalid base package'),
			shouldResume: () => Promise.resolve(false)
		});
		return (input: MultiStepInput) => pickLanguage(input, state);
	}

	async function pickLanguage(input: MultiStepInput, state: Partial<State>) {
		const selected: any = await input.showQuickPick({
			title,
			step: 6,
			totalSteps: totalSteps(state),
            placeholder: 'Pick project language',
            items: getLanguages(),
            activeItems: state.language,
			shouldResume: () => Promise.resolve(false)
        });
        state.language = selected;
		return (input: MultiStepInput) => pickFeatures(input, state);
	}

    async function pickedFeaturesValid(state : Partial<State>) : Promise<any> {
        if (state.micronautVersion && (state.micronautVersion.serviceUrl.startsWith(HTTP_PROTOCOL) || state.micronautVersion.serviceUrl.startsWith(HTTPS_PROTOCOL))) {
            let query = `?javaVersion=JDK_${state.javaVersion?.target}`;
            query += `&lang=${state.language?.value}`;
            state.features?.forEach((feature: {label: string; detail: string; name: string}) => {
                query += `&features=${feature.name}`;
            });
            
            const url = state.micronautVersion.serviceUrl + CREATE + "/" + state.applicationType?.name + "/com.example.project" + query;
            const status = await getProjectStatus(url);
            if (status?.success === true) {
                let messageErr : string = status.data?.message ? status.data?.message + ": ": "";
                messageErr += status?.data?._embedded?.errors[0].message; // show first error
                return {success: false, message: messageErr};
            }

        }
        return {status: true};
    }

	async function pickFeatures(input: MultiStepInput, state: Partial<State>) {
        const features = state.micronautVersion && state.applicationType && state.javaVersion ? await getFeatures(state.micronautVersion, state.applicationType, state.javaVersion) : [];
        const items: vscode.QuickPickItem[] = [];
        let category: string | undefined;
        for (const feature of features) {
            if (feature.category !== category) {
                category = feature.category;
                items.push({label: category, kind: vscode.QuickPickItemKind.Separator});
            }
            items.push(feature);
        }

        let validFeatures;
        do {
            const selected: any = await input.showQuickPick({
                title,
                step: 7,
                totalSteps: totalSteps(state),
                placeholder: 'Pick project features',
                items,
                activeItems: state.features,
                canSelectMany: true,
                shouldResume: () => Promise.resolve(false)
            });
            state.features = selected;
            validFeatures = await pickedFeaturesValid(state);
            if (validFeatures?.success === false) {
                vscode.window.showErrorMessage(validFeatures.message ? validFeatures.message : "Invalid features selected");
            }
        } while (validFeatures?.success === false);

		return (input: MultiStepInput) => pickBuildTool(input, state);
	}

	async function pickBuildTool(input: MultiStepInput, state: Partial<State>) {
		const selected: any = await input.showQuickPick({
			title,
			step: 8,
			totalSteps: totalSteps(state),
            placeholder: 'Pick build tool',
            items: getBuildTools(),
            activeItems: state.buildTool,
			shouldResume: () => Promise.resolve(false)
        });
        state.buildTool = selected;
		return (input: MultiStepInput) => pickTestFramework(input, state);
	}

	async function pickTestFramework(input: MultiStepInput, state: Partial<State>) {
		const selected: any = await input.showQuickPick({
			title,
			step: 9,
			totalSteps: totalSteps(state),
            placeholder: 'Pick test framework',
            items: getTestFrameworks(),
            activeItems: state.testFramework,
			shouldResume: () => Promise.resolve(false)
        });
        state.testFramework = selected;
	}

    const state = await collectInputs();

    if (state.micronautVersion && state.applicationType && state.projectName && state.basePackage &&
        state.language && state.features && state.buildTool && state.testFramework) {

        const lastDirs: any = context.globalState.get(LAST_PROJECT_PARENTDIR) || new Map<string, string>();
        const dirId = `${vscode.env.remoteName || ''}:${vscode.env.machineId}`;
        const dirName : string | undefined = lastDirs[dirId];
        let defaultDir: vscode.Uri | undefined;
        if (dirName) {
            try {
                defaultDir = vscode.Uri.parse(dirName, true);
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
            lastDirs[dirId] = location[0].toString();
            await context.globalState.update(LAST_PROJECT_PARENTDIR, lastDirs);
            let appName = state.basePackage;
            if (appName) {
                appName += '.' + state.projectName;
            } else {
                appName = state.projectName;
            }
            if (state.micronautVersion.serviceUrl.startsWith(HTTP_PROTOCOL) || state.micronautVersion.serviceUrl.startsWith(HTTPS_PROTOCOL)) {
                let query = `?javaVersion=JDK_${state.javaVersion.target}`;
                query += `&lang=${state.language.value}`;
                query += `&build=${state.buildTool.value}`;
                query += `&test=${state.testFramework.value}`;
                state.features.forEach((feature: {label: string; detail: string; name: string}) => {
                    query += `&features=${feature.name}`;
                });
                return {
                    url: state.micronautVersion.serviceUrl + CREATE + '/' + state.applicationType.name + '/' + appName + query,
                    name: state.projectName,
                    target: path.join(location[0].fsPath, state.projectName),
                    buildTool: state.buildTool.value,
                    java: state.javaVersion && state.javaVersion.value.length > 0 ? state.javaVersion.value : undefined
                };
            }
            let args = [state.applicationType.name];
            args.push(`--java-version=${state.javaVersion.target}`);
            args.push(`--lang=${state.language.value}`);
            args.push(`--build=${state.buildTool.value}`);
            args.push(`--test=${state.testFramework.value}`);
            if (state.features.length > 0) {
                let value: string = '';
                state.features.forEach((feature: {label: string; detail: string; name: string}) => {
                    value += value ? `,${feature.name}` : feature.name;
                });
                args.push(`--features=${value}`);
            }
            args.push(appName);
            return {
                url: state.micronautVersion.serviceUrl,
                args,
                name: state.projectName,
                target: path.join(location[0].fsPath, state.projectName),
                buildTool: state.buildTool.value,
                java: state.javaVersion && state.javaVersion.value.length > 0 ? state.javaVersion.value : undefined
            };
        }
    }
    return undefined;
}

function parseJavaVersion(j : string) : number | undefined {
    const re = j.match(/(?:Java |JDK_)(\d+)/);
    return re && re.length > 1 ? parseInt(re[1]) : undefined;
}

async function getMicronautVersions(): Promise<{label: string; serviceUrl: string}[]> {
    const micronautLauchURL: string = getMicronautLaunchURL();
    return simpleProgress("Obtaining Micronaut versions...", () => Promise.all([
        downloadJSON(MICRONAUT_LAUNCH_URL + VERSIONS, 5000).catch(() => undefined).then(data => {
            return data ? { label: JSON.parse(data).versions["micronaut.version"], serviceUrl: MICRONAUT_LAUNCH_URL } : undefined;
        }),
        downloadJSON(MICRONAUT_SNAPSHOT_URL + VERSIONS, 5000).catch(() => undefined).then(data => {
            return data ? { label: JSON.parse(data).versions["micronaut.version"], serviceUrl: MICRONAUT_SNAPSHOT_URL } : undefined;
        }),
        micronautLauchURL ? downloadJSON(micronautLauchURL + VERSIONS, 5000).catch(() => undefined).then(data => {
            return data ? { label: JSON.parse(data).versions["micronaut.version"], serviceUrl: micronautLauchURL, description: '(using configured Micronaut Launch URL)'  } : undefined;
        }) : undefined,
        getMNVersion()
    ]).then((data: ({ label: string; serviceUrl: string } | undefined)[]) => {
        const out = data.filter((item: any) => item !== undefined) as { label: string; serviceUrl: string }[];
        if (out.length === 0) {
            vscode.window.showErrorMessage("Failed to obtain Micronaut versions.", { modal: true, detail: "Check your connection and proxy settings." });
        }
        return out;
    }));
}

async function getApplicationTypes(micronautVersion: {label: string; serviceUrl: string}): Promise<{label: string; name: string}[]> {
    if (micronautVersion.serviceUrl.startsWith(HTTP_PROTOCOL) || micronautVersion.serviceUrl.startsWith(HTTPS_PROTOCOL)) {
        return downloadJSON(micronautVersion.serviceUrl + APPLICATION_TYPES).then(data => {
            return JSON.parse(data).types.map((type: any) => ({ label: type.title, name: type.name }));
        });
    }
    return getMNApplicationTypes(micronautVersion.serviceUrl);
}

async function getJavaVersions(micronautVersion: {label: string; serviceUrl: string}): Promise<{ default: number; versions: number[]}> {
    if (micronautVersion.serviceUrl.startsWith(HTTP_PROTOCOL) || micronautVersion.serviceUrl.startsWith(HTTPS_PROTOCOL)) {
        return downloadJSON(micronautVersion.serviceUrl + SELECT_OPTIONS).then(data => {
            let parsed = JSON.parse(data).jdkVersion;
            let parsedVersions: number[] = parsed.options.map((version: any) => parseInt(version.label));

            return { default: parseJavaVersion(parsed.defaultOption.label) || 11, versions: parsedVersions };
        });
    }
    return { default: 11, versions: [] }; // Listing supported Java versions not available using CLI
}

function normalizeJavaVersion(version: number | undefined, supportedVersions: number[], defaultVersion : number = 8): number {
    if (!version) {
        return defaultVersion;
    }
    if (supportedVersions.length === 0) {
        return version;
    }
    for (let supportedVersion of supportedVersions) {
        if (version >= supportedVersion) {
            return supportedVersion;
        }
    }
    return defaultVersion;
}

function getLanguages(): {label: string; value: string}[] {
    return [
        { label: 'Java', value: 'JAVA'},
        { label: 'Kotlin', value: 'KOTLIN'},
        { label: 'Groovy', value: 'GROOVY'}
    ];
}

function getBuildTools() {
    return [
        { label: 'Gradle', value: 'GRADLE'},
        { label: 'Maven', value: 'MAVEN'}
    ];
}

function getTestFrameworks() {
    return [
        { label: 'JUnit', value: 'JUNIT'},
        { label: 'Spock', value: 'SPOCK'},
        { label: 'Kotlintest', value: 'KOTLINTEST'}
    ];
}

async function getFeatures(micronautVersion: {label: string; serviceUrl: string}, applicationType: {label: string; name: string}, javaVersion: {target: number}): Promise<{label: string; detail?: string; category: string; name: string}[]> {
    const comparator = (f1: any, f2: any) => f1.category < f2.category ? -1 : f1.category > f2.category ? 1 : f1.label < f2.label ? -1 : 1;
    if (micronautVersion.serviceUrl.startsWith(HTTP_PROTOCOL) || micronautVersion.serviceUrl.startsWith(HTTPS_PROTOCOL)) {
        return downloadJSON(micronautVersion.serviceUrl + APPLICATION_TYPES + '/' + applicationType.name + FEATURES).then(data => {
            return JSON.parse(data).features.map((feature: any) => ({label: feature.title, detail: feature.description, category: feature.category, name: feature.name})).sort(comparator);
        });
    }
    try {
        // will throw an error if javaVersion.target is not supported by the CLI
        return getMNFeatures(micronautVersion.serviceUrl, applicationType.name, javaVersion.target).sort(comparator);
    } catch (e: any) {
        let msg = e.message.toString();
        const err = `Unsupported JDK version: ${javaVersion.target}. Supported values are `;
        const idx = msg.indexOf(err);
        if (idx !== 0) {
            // javaVersion.target not supported by the CLI
            // list of the supported versions is part of the error message
            const supportedVersions = msg.substring(idx + err.length + 1, msg.length - 3).split(', ');
            const supportedVersion = normalizeJavaVersion(javaVersion.target, supportedVersions);
            try {
                const features: {label: string; detail?: string; category: string; name: string}[] = getMNFeatures(micronautVersion.serviceUrl, applicationType.name, supportedVersion);
                javaVersion.target = supportedVersion; // update the target platform
                return features.sort(comparator);
            } catch (e: any) {
                msg = e.message.toString();
            }
        }
        vscode.window.showErrorMessage(`Cannot get Micronaut features: ${msg}`);
        return [];
    }
}

function getMNVersion(): {label: string; serviceUrl: string; description: string} | undefined {
    return cliMNVersion;
}

function getMNApplicationTypes(mnPath: string): {label: string; name: string}[] {
    const types: {label: string; name: string}[] = [];
    try {
        let header: boolean = true;
        cp.execFileSync(mnPath, ['--help'], { env: { JAVA_HOME: getJavaHome() } }).toString().split('\n').map(line => line.trim()).forEach(line => {
            if (header) {
                if (line.startsWith('Commands:')) {
                    header = false;
                }
            } else {
                const info: string[] | null = line.match(/\s*(\S*)\s*Creates an? (.*)/);
                if (info && info.length >= 3) {
                    types.push({ label: `Micronaut ${info[2]}`, name: info[1] });
                }
            }
        });
    } catch (e) {
        vscode.window.showErrorMessage(`Cannot get Micronaut application types: ${e}`);
    }
    return types;
}

function getMNFeatures(mnPath: string, applicationType: string, javaVersion: number): {label: string; detail?: string; category: string; name: string}[] {
    const features: {label: string; detail?: string; category: string; name: string}[] = [];
    let header: boolean = true;
    let category: string | undefined;
    cp.execFileSync(mnPath, [applicationType, '--list-features', `--java-version=${javaVersion}`]).toString().split('\n').map(line => line.trim()).forEach(line => {
        if (header) {
            if (line.startsWith('------')) {
                header = false;
            }
        } else {
            if (line.length === 0) {
                category = undefined;
            } else if (category) {
                const info: string[] | null = line.match(/(\S*)\s*(\[PREVIEW\]|\(\*\))?\s*(.*)/);
                if (info && info.length >= 4) {
                    features.push({ label: info[1], detail: info[3], category, name: info[1] });
                }
            } else {
                category = line;
            }
        }
    });
    return features;
}

async function downloadProject(options: {url: string; name: string; target: string}): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        fs.mkdirSync(options.target, {recursive: true});
        const filePath: string = path.join(options.target, options.name + '.zip');
        const file: fs.WriteStream = fs.createWriteStream(filePath);
        https.get(options.url, res => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'] || '';
            if (statusCode !== 201) {
                let rawData: string = '';
                res.on('data', chunk => { rawData += chunk; });
                res.on('end', () => {
                    if (/^application\/json/.test(contentType)) {
                        reject(JSON.parse(rawData).message);
                    } else {
                        reject(`Request failed.\nStatus Code: ${statusCode}`);
                    }
                });
                res.on('error', e => {
                    reject(e.message);
                });
            } else if (!/^application\/zip/.test(contentType)) {
                res.resume();
                reject(`Invalid content-type.\nExpected application/zip but received ${contentType}`);
            } else {
                res.pipe(file);
                file.on('close', () => {
                    resolve(filePath);
                });
                res.on('error', e => {
                    reject(e.message);
                });
            }
        }).on('error', e => {
            reject(e.message);
        }).end();
    });
}

async function getProjectStatus(url : string) : Promise<any> {
    return new Promise<any>((resolve, reject) => {
        const request = https.get(url, res => {
            const contentType = res.headers['content-type'] || '';
            let rawData: string = '';
            res.on('data', chunk => { rawData += chunk; });
            res.on('end', () => {
                if (/^application\/json/.test(contentType)) {
                    resolve({success: true, data: JSON.parse(rawData)});
                } else {
                    resolve({success: false});
                }
            });
            res.on('error', e => {
                reject({success:false, data: e.message} );
            });
        }).on('error', (error) => { reject( {success:false, data:error} ); });

        setTimeout(() => {
            request.abort();
            reject({success:false, data:'Timed out'});
          }, 5000);
    });
}
