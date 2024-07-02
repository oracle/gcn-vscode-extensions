/*
 * Copyright (c) 2023, 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as applications from '../applications';
import * as beanHandler from './beanHandler';


const SETTING_ENABLED_KEY = 'environmentEndpointEnabled';
const RELATIVE_ADDRESS = '/env';

export function forApplication(application: applications.Application) {
    return new EnvironmentEndpoint(application);
}

export class EnvironmentEndpoint extends beanHandler.UpdatableBeanHandler {

    private lastActiveEnvironments: string[] | undefined;

    constructor(application: applications.Application) {
        super(application, SETTING_ENABLED_KEY, RELATIVE_ADDRESS);
    }

    protected async processResponse(response: { code: number | undefined; headers: any; data: any }) {
        const data = JSON.parse(response.data);
        this.lastActiveEnvironments = activeEnvironments(data);
        this.notifyUpdated(data);
    }

    getLastActiveEnvironments(): string[] | undefined {
        return this.lastActiveEnvironments;
    }

    buildVmArgs(): string[] | undefined {
        // if (!this.isEnabled()) {
        //     return undefined;
        // }
        return ['-Dendpoints.env.enabled=true', '-Dendpoints.env.sensitive=false'];
    }

}

export function activeEnvironments(data: any): string[] | undefined {
    const activeEnvironments = data.activeEnvironments;
    return activeEnvironments;
}
