/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as model from './model';
import * as gcnServices from './gcnServices';
import * as servicesView from './servicesView';
import * as welcome from './welcome';
import * as gcnProjectCreate from './gcnProjectCreate';

export const CLOUD_SUPPORTS: model.CloudSupport[] = [];

export function activate(context: vscode.ExtensionContext) {
	CLOUD_SUPPORTS.push(
		// require('./oci/ociSupport').create(context),
		require('./oci/ociSupport').create(context)
		// TODO: add another cloud implementations here
	);
	
	if (vscode.workspace.getConfiguration().get<boolean>('gcn.showWelcomePage')) {
		welcome.WelcomePanel.createOrShow(context);
	}
	context.subscriptions.push(vscode.commands.registerCommand('gcn.showWelcomePage', () => {
		welcome.WelcomePanel.createOrShow(context);
	}));

	servicesView.initialize(context);
	context.subscriptions.push(vscode.window.registerTreeDataProvider('gcn-services', servicesView.nodeProvider));

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
		await gcnServices.build();
	}));

	context.subscriptions.push(vscode.commands.registerCommand("gcn.createGcnProject", () => gcnProjectCreate.createProject(context)));

	gcnServices.build();

}
