/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';


const GCN_OUTPUT = 'OCI Services for GCN';
const LOG_OUTPUT = vscode.window.createOutputChannel(GCN_OUTPUT);

export function logInfo(record: string) {
    logRecord('info', record);
}

export function logWarning(record: string) {
    logRecord('warning', record);
}

export function logError(record: string) {
    logRecord('error', record);
}

export function logRecord(category: string, record: string) {
    LOG_OUTPUT.appendLine(`[${new Date().toISOString()}] [${category}] ${record}`);
}