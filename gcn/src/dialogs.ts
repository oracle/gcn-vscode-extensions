/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as gcnServices from './gcnServices';
import * as model from './model';
import { CLOUD_SUPPORTS } from './extension';


const GCN_TERMINAL = 'Graal Cloud Native';

export function getGCNTerminal(): vscode.Terminal {
    let terminal = vscode.window.terminals.find(t => t.name === GCN_TERMINAL);
    if (!terminal) {
        terminal = vscode.window.createTerminal({ name: GCN_TERMINAL });
    }
    return terminal;
}

export async function selectName(title: string, currentName: string | undefined, forbiddenNames?: string[]): Promise<string | undefined> {
    if (!forbiddenNames) {
        forbiddenNames = [];
    }
    function validateName(name: string): string | undefined {
        if (!name || name.length === 0) {
            return 'Name cannot be empty.'
        }
        if (forbiddenNames?.indexOf(name) !== -1) {
            return 'Name already used.'
        }
        return undefined;
    }
    const selected = await vscode.window.showInputBox({
        title: title,
        value: currentName,
        validateInput: input => validateName(input)
    });
    return selected;
}

export async function selectFolder(caption: string | undefined = undefined, serviceFolder: boolean = true): Promise<gcnServices.FolderData | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = gcnServices.getFolderData();
    for (const folder of folderData) {
        if (serviceFolder && folder.services.length > 0 || !serviceFolder && folder.services.length === 0) {
            const choice = new QuickPickObject(folder.folder.name, undefined, undefined, folder);
            choices.push(choice);
        }
    }
    if (choices.length === 0) {
        return null;
    }
    if (choices.length === 1) {
        return choices[0].object;
    }
    const selection = await vscode.window.showQuickPick(choices, {
        placeHolder: caption ? caption : 'Select Folder'
    })
    return selection?.object;
}

export async function selectFolders(caption: string | undefined = undefined, serviceFolders: boolean = true, autoSelectSingle: boolean = true): Promise<gcnServices.FolderData[] | null | undefined> {
    const choices: QuickPickObject[] = [];
    const folderData = gcnServices.getFolderData();
    for (const folder of folderData) {
        if (serviceFolders && folder.services.length > 0 || !serviceFolders && folder.services.length === 0) {
            const choice = new QuickPickObject(folder.folder.name, undefined, undefined, folder);
            choices.push(choice);
        }
    }
    if (choices.length === 0) {
        return null;
    }
    if (autoSelectSingle && choices.length === 1) {
        return [ choices[0].object ];
    }
    const selection = await vscode.window.showQuickPick(choices, {
        placeHolder: caption ? caption : 'Select Folders',
        canPickMany: true
    });
    if (selection && selection.length > 0) {
        const folders: gcnServices.FolderData[] = [];
        for (const folder of selection) {
            folders.push(folder.object);
        }
        return folders;
    }
    return undefined;
}

export async function selectServices(folder: gcnServices.FolderData): Promise<model.CloudServices | undefined> {
    const services = folder.services;
    if (services.length === 0) {
        return undefined;
    }
    if (services.length === 1) {
        return services[0];
    }
    const choices: QuickPickObject[] = [];
    for (let i = 0; i < services.length; i++) {
        const service = services[i];
        const configuration = folder.configurations[i];
        const choice = new QuickPickObject(configuration.getName(), undefined, undefined, service);
        choices.push(choice);
    }
    const selection = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Cloud Context'
    })
    return selection?.object;
}

export async function selectCloudSupport(): Promise<model.CloudSupport | undefined> {
    if (CLOUD_SUPPORTS.length === 1) {
        return CLOUD_SUPPORTS[0];
    }
    const choices: QuickPickObject[] = [];
    for (const cloudSupport of CLOUD_SUPPORTS) {
        const choice = new QuickPickObject(cloudSupport.getName(), undefined, cloudSupport.getDescription(), cloudSupport);
        choices.push(choice);
    }
    const selection = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Select Cloud Service'
    })
    return selection?.object;
}

export class QuickPickObject implements vscode.QuickPickItem {
    constructor(
        public readonly label: string,
        public readonly description : string | undefined,
        public readonly detail: string | undefined,
        public readonly object?: any,
    ) {}
}
