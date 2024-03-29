/*
 * Copyright (c) 2021, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from "vscode";


class KubernetesChannel {
    private readonly channel: vscode.OutputChannel = vscode.window.createOutputChannel("Kubernetes");

    public appendLine(value: string) {
        this.channel.appendLine(value);
    }

    public clearAndShow() {
        this.channel.clear();
        this.channel.show();
    }
}

export const kubernetesChannel = new KubernetesChannel();
