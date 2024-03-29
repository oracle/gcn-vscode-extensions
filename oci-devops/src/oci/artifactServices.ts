/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as artifacts from 'oci-artifacts';
import * as nodes from '../nodes';
import { showSaveFileDialog } from '../dialogs';
import * as dialogs from '../../../common/lib/dialogs';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';
import * as ociFeatures from './ociFeatures';


export const DATA_NAME = 'artifactRepositories';

export const ICON = 'file-binary';

const PERSISTENT_TARGET_KEY = 'saveArtifactTargetDir';

type ArtifactRepository = {
    ocid: string;
    displayName: string;
};

type GenericArtifact = {
    ocid: string;
    displayName: string;
};

export function initialize(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.commands.registerCommand('oci.devops.downloadGenericArtifact', (...params: any[]) => {
        if (params[0]?.download) {
            (params[0] as GenericArtifactNode).download();
        }
    }));

    nodes.registerRenameableNode(ArtifactRepositoryNode.CONTEXT);
    nodes.registerRemovableNode(ArtifactRepositoryNode.CONTEXT);
    nodes.registerReloadableNode(ArtifactRepositoryNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(ArtifactRepositoryNode.CONTEXT);
}

export async function importServices(_oci: ociContext.Context, _projectResources: any | undefined, _codeRepositoryResources: any | undefined): Promise<dataSupport.DataProducer | undefined> {
    // TODO: Might return populated instance of Service which internally called importServices()
    return undefined;
}

export function create(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged): ociService.Service {
    return new Service(folder, oci, serviceData, dataChanged);
}

export function findByNode(node: nodes.BaseNode): Service | undefined {
    const services = ociServices.findByNode(node);
    const service = services?.getService(DATA_NAME);
    return service instanceof Service ? service as Service : undefined;
}

async function selectArtifactRepositories(oci: ociContext.Context, ignore: ArtifactRepository[]): Promise<ArtifactRepository[] | undefined> {
    function shouldIgnore(ocid: string) {
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listArtifactRepositories(oci: ociContext.Context): Promise<artifacts.models.RepositorySummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading artifact repositories...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                try {
                    const items = await ociUtils.listArtifactRepositories(oci.getProvider(), oci.getCompartment());
                    const projectID = oci.getDevOpsProject();
                    const projectItems: artifacts.models.RepositorySummary[] = [];
                    for (const item of items) {
                        if (item.freeformTags?.devops_tooling_projectOCID === projectID) {
                            projectItems.push(item);
                        }
                    }
                    resolve(projectItems.length ? projectItems : items);
                    return;
                } catch (err) {
                    resolve(undefined);
                    dialogs.showErrorMessage('Failed to read artifact repositories', err);
                    return;
                }
            });
        });
    }
    const artifactRepositories: ArtifactRepository[] = [];
    const descriptions: string[] = [];
    const existing = await listArtifactRepositories(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Artifact Repository ${idx++}`;
                const description = item.description ? item.description : 'Artifact repository';
                artifactRepositories.push({
                    ocid: item.id,
                    displayName: displayName
                });
                descriptions.push(description);
            }
        }
    }
    const existingContentChoices: dialogs.QuickPickObject[] = [];
    for (let i = 0; i < artifactRepositories.length; i++) {
        existingContentChoices.push(new dialogs.QuickPickObject(`$(${ICON}) ${artifactRepositories[i].displayName}`, undefined, descriptions[i], artifactRepositories[i]));
    }
    dialogs.sortQuickPickObjectsByName(existingContentChoices);
    let existingContentMultiSelect;
    if (existingContentChoices.length > 1) {
        const multiSelectExisting = async (): Promise<ArtifactRepository[] | undefined> => {
            const selection = await vscode.window.showQuickPick(existingContentChoices, {
                title: `${ociServices.ADD_ACTION_NAME}: Select Artifact Repositories`,
                placeHolder: 'Select existing artifact repositories to add',
                canPickMany: true
            });
            if (selection?.length) {
                const selected: ArtifactRepository[] = [];
                for (const sel of selection) {
                    selected.push(sel.object as ArtifactRepository);
                }
                return selected;
            } else {
                return undefined;
            }
        };
        existingContentMultiSelect = new dialogs.QuickPickObject('$(arrow-small-right) Add multiple existing artifact repositories...', undefined, undefined, multiSelectExisting);
    }
    // TODO: provide a possibility to create a new artifact repository
    // TODO: provide a possibility to select artifact repositories from different compartments
    const choices: dialogs.QuickPickObject[] = [];
    if (existingContentChoices.length) {
        choices.push(...existingContentChoices);
        if (existingContentMultiSelect) {
            choices.push(existingContentMultiSelect);
        }
    }
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All artifact repositories already added or no artifact repositories available.');
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            title: `${ociServices.ADD_ACTION_NAME}: Select Artifact Repository`,
            placeHolder: 'Select existing artifact repository to add'
        });
        if (selection) {
            if (typeof selection.object === 'function') {
                return await selection.object();
            } else {
                return [ selection.object ];
            }
        }
    }
    return undefined;
}

export class Service extends ociService.Service {

    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
    }

    async addContent() {
        if (this.treeChanged) {
            const displayed = this.itemsData ? this.itemsData as ArtifactRepository[] : [];
            const selected = await selectArtifactRepositories(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const object of selected) {
                    added.push(new ArtifactRepositoryNode(object, this.oci, this.treeChanged));
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return ociFeatures.NON_PIPELINE_RESOURCES_ENABLED ? [
            new dialogs.QuickPickObject(`$(${ICON}) Add Artifact Repository`, undefined, 'Add an existing artifact repository', () => this.addContent())
        ] : undefined;
    }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            if (ocid && displayName) {
                const object: ArtifactRepository = {
                    ocid: ocid,
                    displayName: displayName
                };
                nodes.push(new ArtifactRepositoryNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class ArtifactRepositoryNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ReloadableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'artifactRepositoryNode';
    static readonly CONTEXT = `oci.devops.${ArtifactRepositoryNode.DATA_NAME}`;

    private object: ArtifactRepository;
    private oci: ociContext.Context;

    constructor(object: ArtifactRepository, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, ArtifactRepositoryNode.CONTEXT, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('file-binary');
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const children: nodes.BaseNode[] = [];
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const repository = this.object.ocid;
        try {
            const artifacts = await ociUtils.listGenericArtifacts(provider, compartment, repository);
            for (const artifact of artifacts) {
                const ocid = artifact.id;
                let displayName = artifact.displayName;
                const unknownVersionIdx = displayName.indexOf(':unknown@');
                if (unknownVersionIdx > -1) {
                    // displayName = displayName.substring(0, unknownVersionIdx);
                    continue;
                }
                const artifactObject = {
                    ocid: ocid,
                    displayName: displayName
                };
                children.push(new GenericArtifactNode(artifactObject, this.oci, artifact));
            }
        } catch (err) {
            // TODO: notify error (add a nodes.TextNode with error message?)
        }
        if (children.length === 0) {
            children.push(new nodes.NoItemsNode());
        }
        return children;
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<artifacts.models.Repository> {
        return ociUtils.getArtifactRepository(this.oci.getProvider(), this.object.ocid);
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Artifact Repository', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    getAddress(): string {
        return `https://cloud.oracle.com/registry/artifacts/${this.object.ocid}`;
    }

    getDataName() {
        return ArtifactRepositoryNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class GenericArtifactNode extends nodes.BaseNode implements ociNodes.OciResource {

    static readonly CONTEXT = 'oci.devops.genericArtifactNode';

    private object: GenericArtifact;
    private oci: ociContext.Context;

    private objectSize: number | undefined;

    constructor(object: GenericArtifact, oci: ociContext.Context, artifact?: artifacts.models.GenericArtifactSummary) {
        super(object.displayName, undefined, GenericArtifactNode.CONTEXT, undefined, undefined);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.objectSize = artifact?.sizeInBytes;
        this.updateAppearance(artifact);
    }

    updateAppearance(artifact?: artifacts.models.GenericArtifactSummary) {
        if (artifact) {
            this.description = `(${new Date(artifact.timeCreated).toLocaleString()})`;
            this.tooltip = `Size: ${artifact.sizeInBytes.toLocaleString()} B`;
        } else {
            super.updateAppearance();
        }
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<artifacts.models.GenericArtifact> {
        return ociUtils.getGenericArtifact(this.oci.getProvider(), this.object.ocid);
    }

    download() {
        let filename = this.object.displayName;
        // TODO: separate artifact name and version
        const versionSeparatorIdx = filename.indexOf(':');
        if (versionSeparatorIdx > 0) {
            filename = filename.substring(0, versionSeparatorIdx);
        }
        downloadGenericArtifactContent(this.oci, this.object.ocid, this.object.displayName, filename, this.objectSize);
    }
}

export function downloadGenericArtifactContent(oci: ociContext.Context, artifactID: string, displayName: string, fileName: string, size?: number) {
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reading artifact content...',
        cancellable: false
    }, async (_progress, _token) => {
        try {
            if (size === undefined) {
                size = (await ociUtils.getGenericArtifact(oci.getProvider(), artifactID)).sizeInBytes;
            }
            return await ociUtils.getGenericArtifactContent(oci.getProvider(), artifactID);
        } catch (err) {
            return new Error(dialogs.getErrorMessage('Failed to read artifact', err));
        }
    }).then(result => {
        if (result instanceof Error) {
            dialogs.showError(result);
        } else {
            showSaveFileDialog('Save Artifact As', fileName, PERSISTENT_TARGET_KEY).then(fileUri => {
                if (fileUri) {
                    vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: `Downloading artifact ${displayName}...`,
                        cancellable: true
                    }, (progress, token) => {
                        return new Promise(async (resolve) => {
                            const data = result;
                            const file = fs.createWriteStream(fileUri.fsPath);
                            token.onCancellationRequested(() => {
                                resolve(false);
                                data.destroy();
                                file.end();
                                fs.unlinkSync(fileUri.fsPath);
                            });
                            data.pipe(file);
                            data.on('error', (err: Error) => {
                                dialogs.showErrorMessage('Failed to download artifact', err);
                                file.destroy();
                                resolve(false);
                            });
                            if (size) {
                                const percent = size / 100;
                                let counter = 0;
                                let progressCounter = 0;
                                data.on('data', (chunk: string | any[]) => {
                                    counter += chunk.length;
                                    let f = Math.floor(counter / percent);
                                    if (f > progressCounter) {
                                        progress.report({ increment: f - progressCounter });
                                        progressCounter = f;
                                    }
                                });
                            }
                            data.on('end', () => {
                                const open = 'Open File Location';
                                vscode.window.showInformationMessage(`Artifact ${displayName} downloaded.`, open).then(choice => {
                                    if (choice === open) {
                                        vscode.commands.executeCommand('revealFileInOS', fileUri);
                                    }
                                });
                                resolve(true);
                            });
                        });
                    });
                }
            });
        }
    });
}
