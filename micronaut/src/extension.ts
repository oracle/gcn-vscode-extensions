/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import { micronautProjectExists } from "../../common/lib/utils";
import { checkGCNExtensions } from "../../common/lib/dialogs";
import { creatorInit, createProject } from './projectCreate';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('extension.micronaut.createProject', () => {
		createProject(context);
	}));
	creatorInit();
	micronautProjectExists().then(exists => {
		if (exists) {
			checkGCNExtensions(context);
		}
	});
}

export function deactivate() {}
