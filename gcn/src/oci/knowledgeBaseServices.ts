/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as adm from 'oci-adm';
import * as nodes from '../nodes';
import * as dialogs from '../dialogs';
import * as ociUtils from './ociUtils';
import * as ociContext from './ociContext';
import * as ociService from './ociService';
import * as ociServices  from './ociServices';
import * as dataSupport from './dataSupport';
import * as ociNodes from './ociNodes';


export const DATA_NAME = 'knowledgeBases';

const ICON = 'book';

type KnowledgeBase = {
    ocid: string,
    displayName: string
}

type VulnerabilityAudit = {
    ocid: string,
    displayName: string
}

export function initialize(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('gcn.oci.projectAudit.execute', (...params: any[]) => {
        const path = params[0]?.uri;
        if (path) {
            const uri = vscode.Uri.parse(path);
            getFolderAuditsService(uri).then(service => {
                if (service) {
                    service.executeProjectAudit(uri);
                }
            });
        }
    }));

    nodes.registerRenameableNode(KnowledgeBaseNode.CONTEXT);
    nodes.registerRemovableNode(KnowledgeBaseNode.CONTEXT);
    nodes.registerReloadableNode(KnowledgeBaseNode.CONTEXT);
    ociNodes.registerOpenInConsoleNode(KnowledgeBaseNode.CONTEXT);
}

export async function importServices(_oci: ociContext.Context): Promise<dataSupport.DataProducer | undefined> {
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

export function findByFolder(folder: vscode.Uri): Service[] | undefined {
    const services = ociServices.findByFolder(folder);
    if (!services) {
        return undefined;
    }
    const kbServices: Service[] = [];
    for (const service of services) {
        const kbService = service.getService(DATA_NAME);
        if (kbService instanceof Service) {
            kbServices.push(kbService as Service);
        }
    }
    return kbServices;
}

async function getFolderAuditsService(folder: vscode.Uri): Promise<Service | undefined> {
    const services = findByFolder(folder);
    if (!services || services.length === 0) {
        return undefined;
    }
    for (const service of services) {
        if (service.getAuditsKnowledgeBase()) {
            return service;
        }
    }
    // TODO: might silently select audits knowledge tagged for the project during Deploy
    // TODO: might silently select audits knowledge base from another folder if configured
    if (await services[0].setupAuditsKnowledgeBase()) {
        return services[0];
    }
    return undefined;
}

async function selectKnowledgeBases(oci: ociContext.Context, ignore?: KnowledgeBase[]): Promise<KnowledgeBase[] | undefined> {
    function shouldIgnore(ocid: string) {
        if (!ignore) {
            return false;
        }
        for (const item of ignore) {
            if (item.ocid === ocid) {
                return true;
            }
        }
        return false;
    }
    async function listKnowledgeBases(oci: ociContext.Context): Promise<adm.models.KnowledgeBaseSummary[] | undefined> {
        // TODO: display the progress in QuickPick
        return await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Reading compartment knowledge bases...',
            cancellable: false
        }, (_progress, _token) => {
            return new Promise(async (resolve) => {
                resolve((await ociUtils.listKnowledgeBases(oci.getProvider(), oci.getCompartment()))?.knowledgeBaseCollection.items);
            });
        })
    }
    const knowledgeBases: KnowledgeBase[] = [];
    const existing = await listKnowledgeBases(oci);
    if (existing) {
        let idx = 1;
        for (const item of existing) {
            if (!shouldIgnore(item.id)) {
                const displayName = item.displayName ? item.displayName : `Knowledge Base ${idx++}`;
                knowledgeBases.push({
                    ocid: item.id,
                    displayName: displayName
                });
            }
        }
    }
    const choices: dialogs.QuickPickObject[] = [];
    for (const knowledgeBase of knowledgeBases) {
        choices.push(new dialogs.QuickPickObject(`$(${ICON}) ${knowledgeBase.displayName}`, undefined, undefined, knowledgeBase));
    }
    // TODO: provide a possibility to create a new knowledge base
    // TODO: provide a possibility to select knowledge bases from different compartments
    if (choices.length === 0) {
        vscode.window.showWarningMessage('All knowledge bases already added or no knowledge bases available.')
    } else {
        const selection = await vscode.window.showQuickPick(choices, {
            placeHolder: 'Select Knowledge Base(s) to Add',
            canPickMany: true
        })
        if (selection && selection.length > 0) {
            const selected: KnowledgeBase[] = [];
            for (const sel of selection) {
                selected.push(sel.object as KnowledgeBase);
            }
            return selected;
        }
    }
    return undefined;
}

class Service extends ociService.Service {
    
    constructor(folder: vscode.WorkspaceFolder, oci: ociContext.Context, serviceData: any | undefined, dataChanged: dataSupport.DataChanged) {
        super(folder, oci, DATA_NAME, serviceData, dataChanged);
        if (this.settingsData?.folderAuditsKnowledgeBase) {
            this.tryDisplayProjectAudit(0);
        }
    }

    async addContent() {
        if (this.treeChanged) {
            const displayed = this.itemsData ? this.itemsData as KnowledgeBase[] : [];
            const selected = await selectKnowledgeBases(this.oci, displayed);
            if (selected) {
                const added: nodes.BaseNode[] = [];
                for (const pipeline of selected) {
                    added.push(new KnowledgeBaseNode(pipeline, this.oci, this.treeChanged));
                }
                this.addServiceNodes(added);
            }
        }
    }

    getAddContentChoices(): dialogs.QuickPickObject[] | undefined {
        return [
            new dialogs.QuickPickObject(`$(${ICON}) Add Knowledge Base`, undefined, 'Add existing knowledge base', () => this.addContent())
        ];
    }

    public getAuditsKnowledgeBase(): string | undefined {
        return this.settingsData?.folderAuditsKnowledgeBase;
    }

    async setupAuditsKnowledgeBase(): Promise<string | undefined> {
        // TODO: interactively select & store knowledge base for this folder
        return this.settingsData?.folderAuditsKnowledgeBase;
    }

    async executeProjectAudit(uri: vscode.Uri) {
        const auditsKnowledgeBase = this.getAuditsKnowledgeBase();

        if (!auditsKnowledgeBase) {
            // vscode.window.showErrorMessage(`No KnowledgeBase bound for ${uri}.`);
            return;
        }

        if (!(await vscode.commands.getCommands(true)).includes('nbls.gcn.projectAudit.execute')) {
            vscode.window.showErrorMessage('Required Language Server is not ready.');
            return;
        }

        return vscode.commands.executeCommand('nbls.gcn.projectAudit.execute', uri.fsPath, 
            auditsKnowledgeBase, 
            this.oci.getCompartment(), 
            this.oci.getDevOpsProject()
        )
    }

    displayProjectAudit() {
        const auditsKnowledgeBase = this.getAuditsKnowledgeBase();
        if (!auditsKnowledgeBase) {
            return;
        }
        vscode.commands.executeCommand('nbls.gcn.projectAudit.display', this.folder.uri.fsPath, auditsKnowledgeBase, 
                                        this.oci.getCompartment(), this.oci.getDevOpsProject());
    }

    tryDisplayProjectAudit(attempt : number) {
        vscode.commands.getCommands().then(cmds => {
            if (cmds.includes('nbls.gcn.projectAudit.display')) {
                this.displayProjectAudit();
                return;
            }
            if (attempt < 5) {
                setTimeout(() => this.tryDisplayProjectAudit(attempt + 1) , 2000);
            }
        });
    }

    protected buildNodesImpl(oci: ociContext.Context, itemsData: any[], treeChanged: nodes.TreeChanged): nodes.BaseNode[] {
        const nodes: nodes.BaseNode[] = [];
        for (const itemData of itemsData) {
            const ocid = itemData.ocid;
            const displayName = itemData.displayName;
            if (ocid && displayName) {
                const object: KnowledgeBase = {
                    ocid: ocid,
                    displayName: displayName
                }
                nodes.push(new KnowledgeBaseNode(object, oci, treeChanged));
            }
        }
        return nodes;
    }

}

class KnowledgeBaseNode extends nodes.AsyncNode implements nodes.RemovableNode, nodes.RenameableNode, nodes.ReloadableNode, ociNodes.CloudConsoleItem, ociNodes.OciResource, dataSupport.DataProducer {

    static readonly DATA_NAME = 'knowledgeBaseNode';
    static readonly CONTEXT = `gcn.oci.${KnowledgeBaseNode.DATA_NAME}`;
    
    private object: KnowledgeBase;
    private oci: ociContext.Context;

    constructor(object: KnowledgeBase, oci: ociContext.Context, treeChanged: nodes.TreeChanged) {
        super(object.displayName, undefined, KnowledgeBaseNode.CONTEXT, treeChanged);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon(ICON);
        this.updateAppearance();
    }

    async computeChildren(): Promise<nodes.BaseNode[] | undefined> {
        const provider = this.oci.getProvider();
        const compartment = this.oci.getCompartment();
        const knowledgeBase = this.object.ocid;
        const audits = (await ociUtils.listVulnerabilityAudits(provider, compartment, knowledgeBase))?.vulnerabilityAuditCollection.items;
        if (audits !== undefined && audits.length > 0) {
            const children: nodes.BaseNode[] = []
            let idx = 0;
            for (const audit of audits) {
                const auditObject = {
                    ocid: audit.id,
                    displayName: audit.displayName ? audit.displayName : `Audit ${idx++}`
                }
                const vulnerableArtifactsCount = audit.vulnerableArtifactsCount;
                children.push(new VulnerabilityAuditNode(auditObject, this.oci, vulnerableArtifactsCount));
            }
            return children;
        }
        return [ new nodes.NoItemsNode() ];
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<adm.models.KnowledgeBase> {
        return (await ociUtils.getKnowledgeBase(this.oci.getProvider(), this.object.ocid)).knowledgeBase;
    }

    rename() {
        const service = findByNode(this);
        service?.renameServiceNode(this, 'Rename Knowledge Base', name => this.object.displayName = name);
    }

    remove() {
        const service = findByNode(this);
        service?.removeServiceNodes(this);
    }

    getAddress(): string {
        return `https://cloud.oracle.com/adm/knowledgeBases/${this.object.ocid}`;
    }

    getDataName() {
        return KnowledgeBaseNode.DATA_NAME;
    }

    getData(): any {
        return this.object;
    }

}

class VulnerabilityAuditNode extends nodes.BaseNode implements ociNodes.OciResource {

    static readonly CONTEXT = 'gcn.oci.vulnerabilityAuditNode';

    private object: VulnerabilityAudit;
    private oci: ociContext.Context;

    constructor(object: VulnerabilityAudit, oci: ociContext.Context, vulnerableArtifactsCount: number) {
        super(object.displayName, vulnerableArtifactsCount === 0 ? undefined : `(${vulnerableArtifactsCount} ${vulnerableArtifactsCount === 1 ? 'problem' : 'problems'})`, VulnerabilityAuditNode.CONTEXT, undefined, undefined);
        this.object = object;
        this.oci = oci;
        this.iconPath = new vscode.ThemeIcon('primitive-dot', new vscode.ThemeColor(vulnerableArtifactsCount === 0 ? 'charts.green' : 'charts.red'));
        this.updateAppearance();
    }

    getId() {
        return this.object.ocid;
    }

    async getResource(): Promise<adm.models.VulnerabilityAudit> {
        return (await ociUtils.getVulnerabilityAudit(this.oci.getProvider(), this.object.ocid)).vulnerabilityAudit;
    }

}
