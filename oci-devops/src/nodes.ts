/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as dialogs from '../../common/lib/dialogs';


export type TreeChanged = (treeItem?: vscode.TreeItem) => void;

export type NodeDecoration = { description?: string; tooltip?: string };

export interface DecorableNode {
    decorate(decoration: NodeDecoration, refreshNode?: boolean): void;
}

export interface DeployNode {
    deploy(workspaceState: vscode.Memento): void;
    undeploy(workspaceState: vscode.Memento): void;
}

const DEPLOY_NODES: string[] = [];

export async function registerDeployNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        DEPLOY_NODES.push(context as string);
    } else {
        DEPLOY_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.deployToCloudNodes', DEPLOY_NODES);
}

export interface AddContentNode {
    addContent(): void;
}

const ADD_CONTENT_NODES: string[] = [];

export async function registerAddContentNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        ADD_CONTENT_NODES.push(context as string);
    } else {
        ADD_CONTENT_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.addResourceNodes', ADD_CONTENT_NODES);
}

export interface RenameableNode {
    rename(): void;
}

const RENAMEABLE_NODES: string[] = [];

export async function registerRenameableNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        RENAMEABLE_NODES.push(context as string);
    } else {
        RENAMEABLE_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.renameableNodes', RENAMEABLE_NODES);
}

export interface RemovableNode {
    remove(): void;
}

const REMOVABLE_NODES: string[] = [];

export async function registerRemovableNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        REMOVABLE_NODES.push(context as string);
    } else {
        REMOVABLE_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.removableNodes', REMOVABLE_NODES);
}

export interface ReloadableNode {
    reload(): void;
}

const RELOADABLE_NODES: string[] = [];

export async function registerReloadableNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        RELOADABLE_NODES.push(context as string);
    } else {
        RELOADABLE_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.reloadableNodes', RELOADABLE_NODES);
}

export interface ShowReportNode {
    showReport(): void;
}

const SHOW_REPORT_NODES: string[] = [];

export async function registerShowReportNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        SHOW_REPORT_NODES.push(context as string);
    } else {
        SHOW_REPORT_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.showReportNodes', SHOW_REPORT_NODES);
}

export interface ViewBuildLogNode {
    viewLog(): void;
}

const VIEW_BUILD_LOG_NODES: string[] = [];

export async function registerViewBuildLogNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        VIEW_BUILD_LOG_NODES.push(context as string);
    } else {
        VIEW_BUILD_LOG_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.viewBuildLogNodes', VIEW_BUILD_LOG_NODES);
}

export interface ViewDeploymentLogNode {
    viewLog(): void;
}

const VIEW_DEPLOYMENT_LOG_NODES: string[] = [];

export async function registerViewDeploymentLogNode(context: string | string[]) {
    if (typeof context === 'string' || context instanceof String) {
        VIEW_DEPLOYMENT_LOG_NODES.push(context as string);
    } else {
        VIEW_DEPLOYMENT_LOG_NODES.push(...context);
    }
    await vscode.commands.executeCommand('setContext', 'oci.devops.viewDeploymentLogNodes', VIEW_DEPLOYMENT_LOG_NODES);
}

export function getLabel(node: BaseNode): string | undefined {
    return typeof node.label === 'string' ? node.label as string : (node.label as vscode.TreeItemLabel).label;
}

export class BaseNode extends vscode.TreeItem {

    parent: BaseNode | undefined;
    children: BaseNode[] | undefined | null;

    constructor(label: string, description: string | undefined, contextValue: string | undefined, children: BaseNode[] | undefined | null, expanded: boolean | undefined) {
        super(label);
        this.description = description;
        this.contextValue = contextValue;
        this.setChildren(children);
        if (!children || expanded === undefined) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        } if (expanded === true) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else if (expanded === false) {
            this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
    }

    public setChildren(children: BaseNode[] | undefined | null) {
        if (this.children) {
            for (const child of this.children) {
                child.parent = undefined;
            }
        }
        this.children = children;
        if (this.children) {
            for (const child of this.children) {
                child.parent = this;
            }
        }
    }

    public getChildren(): BaseNode[] | undefined {
        return this.children ? this.children : undefined;
    }

    public removeFromParent(treeChanged?: TreeChanged): boolean {
        const parent = this.parent;
        if (parent) {
            if (parent.removeChild(this)) {
                if (treeChanged) {
                    treeChanged(parent);
                }
                return true;
            }
            this.parent = undefined;
        }
        return false;
    }

    removeChild(child: BaseNode): boolean {
        if (this.children) {
            const idx = this.children.indexOf(child);
            if (idx >= 0) {
                this.children.splice(idx, 1);
                return true;
            }
        }
        return false;
    }

    public updateAppearance() {
        this.tooltip = this.description ? `${this.label}: ${this.description}` : getLabel(this);
    }

}

export class ChangeableNode extends BaseNode {

    constructor(label: string, description: string | undefined, contextValue: string | undefined, children: BaseNode[] | undefined | null, expanded: boolean | undefined, protected readonly treeChanged: TreeChanged) {
        super(label, description, contextValue, children, expanded);
    }

}

export class AsyncNode extends ChangeableNode {

    private static LOADING_ICON = new vscode.ThemeIcon('loading~spin');

    private backupIconPath: string | vscode.Uri | {
        light: string | vscode.Uri;
        dark: string | vscode.Uri;
    } | vscode.ThemeIcon | undefined | null = null;

    constructor(label: string, description: string | undefined, contextValue: string | undefined, treeChanged: TreeChanged) {
        super(label, description, contextValue, null, false, treeChanged);
        this.description = description;
        this.contextValue = contextValue;
    }

    public getChildren(): BaseNode[] | undefined {
        if (this.children === null) {
            this.children = [ new LoadingNode() ];
            if (this.backupIconPath === null) {
                this.backupIconPath = this.iconPath;
                this.iconPath = AsyncNode.LOADING_ICON;
                this.treeChanged(this);
            }
            this.computeChildren().then(children => {
                if (this.backupIconPath !== null) {
                    this.iconPath = this.backupIconPath;
                    this.backupIconPath = null;
                }
                this.setChildren(children);
                this.treeChanged(this);
            }).catch(err => {
                if (this.backupIconPath !== null) {
                    this.iconPath = this.backupIconPath;
                    this.backupIconPath = null;
                }
                const nodeText = this.label ? this.label : this.description;
                dialogs.showErrorMessage(`Failed to expand node ${nodeText}`, err);
                this.setChildren([ new NoItemsNode() ]);
                this.treeChanged(this);
            });
        }
        return this.children;
    }

    async computeChildren(): Promise<BaseNode[] | undefined> {
        return [ new NoItemsNode() ];
    }

    public reload() {
        if (this.children !== null) {
            this.setChildren(null);
            this.treeChanged(this);
        }
    }

}

export class TextNode extends BaseNode {

    constructor(text: string, contextValue?: string) {
        super('', text, contextValue ? contextValue : 'oci.devops.textNode', undefined, undefined);
        this.tooltip = `${this.description}`;
    }

}

export class NoItemsNode extends TextNode {

    constructor() {
        super('<no items>');
    }

}

export class LoadingNode extends TextNode {

    constructor() {
        super('<loading...>');
    }

}

export class ServicesDeployNode extends BaseNode {

    constructor(children: BaseNode[]) {
        super('Deploy', undefined, 'oci.devops.servicesDeployNode', children.length === 0 ? [ new TextNode('<not implemented yet>') ] : children, false);
        this.iconPath = new vscode.ThemeIcon('rocket');
        this.updateAppearance();
    }

}
