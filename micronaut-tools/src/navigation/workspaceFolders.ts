/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as logUtils from '../../../common/lib/logUtils';
import * as projectUtils from './projectUtils';
import * as applications from './applications';
import * as symbols from './symbols';


export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders((e: vscode.WorkspaceFoldersChangeEvent) => {
		foldersChanged(e.added, e.removed);
	}));
    setTimeout(() => { // offload from extension activation
        foldersChanged(vscode.workspace.workspaceFolders || [], [], true);
        symbols.onUpdated((kind: string[], beans: symbols.Bean[], endpoints: symbols.Endpoint[]) => {
            symbolsUpdated(kind, beans, endpoints);
        });
    }, 0);
    logUtils.logInfo('[workspaceFolders] Initialized');
}

export class Data {

    private beans: symbols.Bean[] | undefined;
    private endpoints: symbols.Endpoint[] | undefined;

    private readonly events: symbols.Events = new symbols.Events();
    onUpdating(listener: symbols.OnUpdating) { this.events.onUpdating(listener); }
    onUpdated(listener: symbols.OnUpdated) { this.events.onUpdated(listener); }

    getBeans(): symbols.Bean[] | undefined {
        return this.beans;
    }

    getEndpoints(): symbols.Endpoint[] | undefined {
        return this.endpoints;
    }

    updateSymbols(kind: string[], beans: symbols.Bean[], endpoints: symbols.Endpoint[]) {
        try {
            this.events.notifyUpdating(kind);
        } catch (err) {
            logUtils.logError(`[FolderData] notifyUpdating ${kind}: ${err}`);
        }

        if (symbols.isBeanKind(kind)) {
            this.beans = beans;
        }

        if (symbols.isEndpointKind(kind)) {
            this.endpoints = endpoints;
        }

        try {
            this.events.notifyUpdated(kind, beans, endpoints);
        } catch (err) {
            logUtils.logError(`[FolderData] notifyUpdated ${kind}: ${err}`);
        }
    }

}

export class FolderData extends Data {

    private readonly workspaceFolder: vscode.WorkspaceFolder;

    private application: applications.Application;

    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        super();
        this.workspaceFolder = workspaceFolder;
        this.application = new applications.Application(workspaceFolder);
    };

    getWorkspaceFolder(): vscode.WorkspaceFolder {
        return this.workspaceFolder;
    }

    getApplication(): applications.Application {
        return this.application;
    }

}

const workspaceFolders: vscode.WorkspaceFolder[] = [];
const folderData: FolderData[] = [];
const libraryData = new Data();

export function getLibraryData(): Data {
    return libraryData;
}

let firstFolderDataPromise: boolean = true;
let folderDataPromiseResolve: (value: FolderData[] | PromiseLike<FolderData[]>) => void;
let folderDataPromise: Promise<FolderData[]> = new Promise(resolve => {
    folderDataPromiseResolve = resolve;
});

export type OnUpdating = () => void;
export type OnUpdated = (added: FolderData[], removed: FolderData[], current: FolderData[]) => void;

const onUpdatingListeners: OnUpdating[] = [];
const onUpdatedListeners: OnUpdated[] = [];

function foldersChanged(added: readonly vscode.WorkspaceFolder[], removed: readonly vscode.WorkspaceFolder[], initialChange: boolean = false) {
    if (initialChange || added.length || removed.length) {
        vscode.commands.executeCommand('setContext', 'micronautFoldersComputed', false);
        try {
            if (firstFolderDataPromise) {
                firstFolderDataPromise = false;
            } else {
                folderDataPromise = new Promise(resolve => {
                    folderDataPromiseResolve = resolve;
                });
            }

            try {
                notifyUpdating();
            } catch (err) {
                logUtils.logError(`[workspaceFolders] notifyUpdating: ${err}`);
            }

            const removedFD = removeFolders(removed);
            const addedFD = addFolders(added);
            folderDataPromiseResolve(folderData);

            try {
                notifyUpdated(addedFD, removedFD, folderData);
            } catch (err) {
                logUtils.logError(`[workspaceFolders] notifyUpdated: ${err}`);
            }

            if (addedFD.length) {
                symbols.reloadAll();
            }
        } finally {
            // invoke a bit later to prevent temporary UI synchronization issues
            setTimeout(() => {
                vscode.commands.executeCommand('setContext', 'micronautFoldersComputed', true);
            }, 500);
        }
    }
}

function addFolders(folders: readonly vscode.WorkspaceFolder[]): FolderData[] {
    const added: FolderData[] = [];
    for (const folder of folders) {
        const index = workspaceFolders.indexOf(folder);
        if (index < 0 && projectUtils.isSupportedFolder(folder)) {
            const data = new FolderData(folder);
            added.push(data);
            workspaceFolders.push(folder);
            folderData.push(data);
        }
    }
    return added.sort((f1, f2) => {
        const f1i = f1.getWorkspaceFolder().index;
        const f2i = f2.getWorkspaceFolder().index;
        return f1i > f2i ? 1 : f1i < f2i ? -1 : 0;
    });
}

function removeFolders(folders: readonly vscode.WorkspaceFolder[]): FolderData[] {
    const removed: FolderData[] = [];
    for (const folder of folders) {
        const index = workspaceFolders.indexOf(folder);
        if (index >= 0) {
            removed.push(folderData[index]);
            workspaceFolders.splice(index, 1);
            folderData.splice(index, 1);
        }
    }
    return removed;
}

function symbolsUpdated(kind: string[], beans: symbols.Bean[], endpoints: symbols.Endpoint[]) {
    const beansByWorkspaceFolder: any | undefined = symbols.isBeanKind(kind) ? symbols.byWorkspaceFolder(beans) : undefined;
    const endpointsByWorkspaceFolder: any | undefined = symbols.isEndpointKind(kind) ? symbols.byWorkspaceFolder(endpoints) : undefined;

    for (const folderD of folderData) {
        const folderPath = folderD.getWorkspaceFolder().uri.fsPath;
        const folderBeans: symbols.Bean[] = [];
        if (beansByWorkspaceFolder?.[folderPath]) {
            folderBeans.push(...(beansByWorkspaceFolder[folderPath] as symbols.Bean[]));
        }
        const folderEndpoints: symbols.Endpoint[] = [];
        if (endpointsByWorkspaceFolder?.[folderPath]) {
            folderEndpoints.push(...(endpointsByWorkspaceFolder[folderPath] as symbols.Endpoint[]));
        }
        folderD.updateSymbols(kind, folderBeans, folderEndpoints);
    }
    const libraryBeans: symbols.Bean[] = [];
    if (beansByWorkspaceFolder?.['']) {
        libraryBeans.push(...(beansByWorkspaceFolder[''] as symbols.Bean[]));
    }
    const libraryEndpoints: symbols.Endpoint[] = [];
    if (endpointsByWorkspaceFolder?.['']) {
        libraryEndpoints.push(...(endpointsByWorkspaceFolder[''] as symbols.Endpoint[]));
    }
    libraryData.updateSymbols(kind, libraryBeans, libraryEndpoints);

}

export async function getFolderData(): Promise<FolderData[]> {
    return folderDataPromise;
}

export async function getApplication(folder: vscode.WorkspaceFolder): Promise<applications.Application | undefined> {
    const folderData = await getFolderData(); // make sure this waits for initialization (workspaceFolders and folderData are empty yet)
    for (const data of folderData) {
        if (data.getWorkspaceFolder() === folder) {
            return data.getApplication();
        }
    }
    return undefined;
}

export function onUpdating(listener: OnUpdating) {
    onUpdatingListeners.push(listener);
}

export function onUpdated(listener: OnUpdated) {
    onUpdatedListeners.push(listener);
}

function notifyUpdating() {
    if (onUpdatingListeners.length) {
        for (const listener of onUpdatingListeners) {
            listener();
        }
    }
}

function notifyUpdated(added: FolderData[], removed: FolderData[], current: FolderData[]) {
    if (onUpdatedListeners.length) {
        for (const listener of onUpdatedListeners) {
            listener(added, removed, current);
        }
    }
}
