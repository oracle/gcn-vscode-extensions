/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */
 
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as dialogs from '../../common/lib/dialogs';
import { getJavaVMs } from '../../common/lib/utils';
import {
    initialize,
    selectCreateOptions,
    writeProjectContents,
    CreateOptions,
    FileHandler
} from './common';

 /**
  * Global option
  */
const LAST_PROJECT_PARENTDIR: string = 'lastCreateProjectParentDirs';

const CREATE_ACTION_NAME = 'Create New GDK Project';

export async function createProject(context: vscode.ExtensionContext): Promise<void> {
    var options: CreateOptions | undefined;

    options = await initialize().then(async () => {
        let javaVMs = await getJavaVMs();
        return selectCreateOptions(javaVMs);
    });

    if (!options) {
        return;
    }

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

    const targetLocation = await selectLocation(context, options);
    if (!targetLocation) {
        return;
    }
    return createProjectBase(context, options, targetLocation);
}

export async function createProjectBase(context: vscode.ExtensionContext, options : CreateOptions, targetLocation : string): Promise<void> {

    if (fs.existsSync(targetLocation)) {
        if (!fs.statSync(targetLocation).isDirectory()) {
            dialogs.showErrorMessage(`The selected location ${targetLocation} is not a directory.`);
            return;
        }
        if (fs.readdirSync(targetLocation).filter(n => n === '.' || n === '..' ? undefined : n).length > 0) {
            dialogs.showErrorMessage(`The selected location ${targetLocation} is not empty.`);
            return;
        }
    }

    if (!fs.existsSync(targetLocation)) {
        fs.mkdirSync(targetLocation, { recursive: true });
    }

    await writeProjectContents(options,new NodeFileHandler(vscode.Uri.file(targetLocation)));

    const uri = vscode.Uri.file(targetLocation);
    dialogs.handleNewGCNProject(context, uri, "GCN");
}

async function selectLocation(context: vscode.ExtensionContext, options: CreateOptions) {
    const lastDirs: any = context.globalState.get(LAST_PROJECT_PARENTDIR) || new Map<string, string>();
    const dirId = `${vscode.env.remoteName || ''}:${vscode.env.machineId}`;
    const dirName : string | undefined = lastDirs[dirId];
    let defaultDir: vscode.Uri | undefined;
    let suggestedName: string = options.projectName;
    let counter = 1;
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
        while (await checkProjectFolderExists(location[0].fsPath, options.projectName)) {
            if (suggestedName !== options.projectName) {
                counter = 1;
                suggestedName = options.projectName.replace(/_\d+$/, '') + '_' + counter++;
            }
            while (await checkProjectFolderExists(location[0].fsPath, suggestedName)) {
                suggestedName = options.projectName.replace(/_\d+$/, '') + '_' + counter++;
            }
            let newName: string | undefined = await addNewProjectName(CREATE_ACTION_NAME, suggestedName);
            if (newName) {
                options.projectName = newName;
            } else {
                return undefined;
            }
        }
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

async function checkProjectFolderExists(defaultDir: string, projectName: string) {
    if (!projectName || projectName.trim().length === 0) {
        return true;
    }
    const projectPath = path.join(defaultDir, projectName);
    if (fs.existsSync(projectPath)) {
        return true;
    } else {
        return false;
    }
}

async function addNewProjectName(actionName: string, suggestedName?: string): Promise<string | undefined>  {
    const warningMessage: string = `The project name you're targeting already exists in the selected directory. Click OK to proceed with "${suggestedName}", or use Change Name to define different name.`;
    const changeNameButton: string = 'Change Name';
    const okButton: string = 'OK';
    let projectName: string | undefined; 

    return vscode.window.showWarningMessage(warningMessage, okButton, changeNameButton)
    .then(async (result) => {
        if (result === changeNameButton) {
            projectName = await vscode.window.showInputBox({
                title: `${actionName}: Provide project name`,
                placeHolder: 'Provide unique project name',
                value: suggestedName,
            });
        } else if (result === okButton) {
            projectName = suggestedName;
        }
        return projectName;
    });
}

/**
 * A Node.js implementation of FileHandler abstract class.
 */
export class NodeFileHandler extends FileHandler{

    constructor(locationUri:vscode.Uri){
        super(locationUri);
    }
    
    changeMode(fileUri: vscode.Uri, isExecutable: boolean): void {
        fs.chmodSync(fileUri.fsPath,isExecutable ? 0o777 : 0o666);
    }
}