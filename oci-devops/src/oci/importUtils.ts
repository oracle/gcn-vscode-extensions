/*
 * Copyright (c) 2022, 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as devops from 'oci-devops';
import * as model from '../model';
import * as gitUtils from '../gitUtils';
import * as folderStorage from '../folderStorage';
import { selectDirectory } from '../dialogs';
import * as dialogs from '../../../common/lib/dialogs';
import * as logUtils from '../../../common/lib/logUtils';
import * as devopsServices from '../devopsServices';
import * as ociServices from './ociServices';
import * as ociAuthentication from './ociAuthentication';
import * as ociContext from './ociContext';
import * as ociDialogs from './ociDialogs';
import * as sshUtils from './sshUtils';
import * as ociUtils from './ociUtils';


const IMPORT_ACTION_NAME = 'Import OCI DevOps Project';
const ADD_ACTION_NAME = 'Import Folder(s) from OCI DevOps Project';

// TODO: extract functions shared by deployUtils.ts

export async function importFolders(getFromExisting: boolean): Promise<model.ImportResult | undefined> {
    logUtils.logInfo('[import] Invoked import folders from OCI');

    const actionName = getFromExisting ? ADD_ACTION_NAME : IMPORT_ACTION_NAME;

    const openContexts: ociContext.Context[] = [];

    const folderData = await devopsServices.getFolderData();
    for (const data of folderData) {
        const services = ociServices.findByFolderData(data);
        for (const service of services) {
            const context = service.getContext();
            if (!context.getConfigurationProblem()) {
                openContexts.push(context);
            }
        }
    }

    let auth: ociAuthentication.Authentication | undefined;
    if (openContexts.length) {
        const profiles: string[] = [];
        for (const context of openContexts) {
            const contextProfile = context.getProfile();
            if (!profiles.includes(contextProfile)) {
                profiles.push(contextProfile);
            }
        }
        const selectedProfile = await ociDialogs.selectOciProfileFromList(profiles, true, actionName);
        if (!selectedProfile) {
            return undefined;
        }
        auth = ociAuthentication.createCustom(undefined, selectedProfile);
    } else {
        auth = await ociAuthentication.resolve(actionName);
    }
    const authentication = auth;
    if (!authentication) {
        return undefined;
    }
    const configurationProblem = authentication.getConfigurationProblem();
    if (configurationProblem) {
        dialogs.showErrorMessage(configurationProblem);
        return undefined;
    }
    const provider = authentication.getProvider();

    let compartment: { ocid: string; name: string } | undefined;
    let devopsProject: { ocid: string; name: string } | undefined;

    if (openContexts.length) {
        const projects: string[] = [];
        for (const context of openContexts) {
            const contextProject = context.getDevOpsProject();
            if (!projects.includes(contextProject)) {
                projects.push(contextProject);
            }
        }
        const selectedProject = await ociDialogs.selectDevOpsProjectFromList(provider, projects, true, actionName);
        if (!selectedProject) {
            // TODO: if (selectedProject === null) display error/warning
            return undefined;
        }
        devopsProject = selectedProject;
        compartment = { ocid: selectedProject.compartment, name: selectedProject.compartment };
    } else {
        compartment = await ociDialogs.selectCompartment(provider, actionName);
        if (!compartment) {
            return undefined;
        }
        devopsProject = await ociDialogs.selectDevOpsProject(provider, compartment, actionName);
        if (!devopsProject) {
            return undefined;
        }
    }

    const ignoreRepositories: string[] = [];
    if (openContexts.length) {
        for (const context of openContexts) {
            const contextRepository = context.getCodeRepository();
            if (!ignoreRepositories.includes(contextRepository)) {
                ignoreRepositories.push(contextRepository);
            }
        }
    }
    const repositories = await ociDialogs.selectCodeRepositories(provider, devopsProject, openContexts.length === 0, actionName, ignoreRepositories);
    if (!repositories || repositories.length === 0) {
        return undefined;
    }

    const targetDirectories: string[] = [];
    if (openContexts.length) {
        for (const data of folderData) {
            const targetDirectory = path.dirname(data.folder.uri.fsPath);
            if (!targetDirectories.includes(targetDirectory)) {
                targetDirectories.push(targetDirectory);
            }
        }
    }
    const targetDirectory = await selectDirectory(targetDirectories, actionName, 'Select Target Directory', 'Import Here');
    if (!targetDirectory) {
        return undefined;
    }

    logUtils.logInfo(`[import] Configured to import devops project '${devopsProject.name}' in compartment '${compartment.name}', ${repositories.length} code repository(s) will be cloned to ${targetDirectory}`);

    const folders: string[] = [];
    const servicesData: any[] = [];

    const error: string | undefined = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: getFromExisting ? 'Importing folder(s) from OCI DevOps project' : 'Importing OCI DevOps project',
        cancellable: false
    }, (progress, _token) => {
        return new Promise(async resolve => {
            for (const repository of repositories) {
                progress.report({
                    message: `Cloning code repository ${repository.name}...`
                });
                logUtils.logInfo(`[import] Cloning code repository '${repository.name}'`);
                if (repository.sshUrl) { // TODO: https
                    try {
                        if (!await sshUtils.checkSshConfigured(provider, repository.sshUrl)) {
                            resolve(`Failed to configure SSH for repository ${repository.name} URL ${repository.sshUrl}.`);
                            return;
                        }
                    } catch (err) {
                        logUtils.logError(dialogs.getErrorMessage(`Failed to configure SSH for repository ${repository.name} URL ${repository.sshUrl}.`, err));
                        resolve(`Failed to configure SSH for repository ${repository.name} URL ${repository.sshUrl}.`);
                        return;
                    }
                        const cloned = await gitUtils.cloneRepository(repository.sshUrl, targetDirectory);
                    if (!cloned) {
                        resolve(`Failed to clone repository ${repository.name}.`);
                        return;
                    }
                } else {
                    resolve(`Failed to clone repository ${repository.name}: ssh url not available.`);
                    return;
                }
            }

            let projectResources: any | undefined;

            for (const repository of repositories) {
                const folder = path.join(targetDirectory, repository.name); // TODO: name and toplevel dir might differ!
                folders.push(folder);
                const devopsConfig = folderStorage.getDefaultLocation();
                if (folderStorage.storageExists(folder)) {
                    // OCI DevOps configuration already exists in the cloud repository
                    // NOTE: overwriting the OCI authentication for the local profile
                    logUtils.logInfo(`[import] Updating OCI profile in ${devopsConfig} in the locally cloned code repository '${repository.name}'`);
                    const configuration = folderStorage.read(folder);
                    const cloudServices: any[] = configuration.cloudServices;
                    for (const cloudService of cloudServices) {
                        if (cloudService.type === 'oci') {
                            cloudService.data[authentication.getDataName()] = authentication.getData();
                        }
                    }
                    folderStorage.store(folder, configuration, true);
                    servicesData.push(undefined);
                    // Do not track local changes to .vscode/devops.json
                    gitUtils.skipWorkTree(folder, devopsConfig); // Only works if file present in the remote repo
                } else {
                    // OCI DevOps configuration does not exist in the cloud repository
                    // Using GeneratedResources* artifacts if available
                    progress.report({
                        message: `Resolving services for code repository ${repository.name}...`
                    });
                    const oci = new ociContext.Context(authentication, (compartment as { ocid: string; name: string }).ocid, (devopsProject as { ocid: string; name: string }).ocid, repository.ocid);
                    let codeRepositoryResources: any | undefined;
                    try {
                        let artifacts = await ociUtils.listDeployArtifacts(oci.getProvider(), oci.getDevOpsProject());
                        for (const artifact of artifacts) {
                            if (artifact.freeformTags?.devops_tooling_codeRepoResourcesList && artifact.freeformTags?.devops_tooling_codeRepoID === repository.ocid) {
                                const content = (artifact.deployArtifactSource as devops.models.InlineDeployArtifactSource).base64EncodedContent;
                                const stringContent = Buffer.from(content, 'base64').toString('binary');
                                codeRepositoryResources = JSON.parse(stringContent);
                                if (projectResources) {
                                    break;
                                }
                            } else if (!projectResources && artifact.freeformTags?.devops_tooling_projectResourcesList) {
                                const content = (artifact.deployArtifactSource as devops.models.InlineDeployArtifactSource).base64EncodedContent;
                                const stringContent = Buffer.from(content, 'base64').toString('binary');
                                projectResources = JSON.parse(stringContent);
                                if (codeRepositoryResources) {
                                    break;
                                }
                            }
                        }
                        if (!projectResources) {
                            logUtils.logWarning(`[import] No list of generated devops project resources for '${devopsProject?.name}'`);
                        }
                        if (!codeRepositoryResources) {
                            logUtils.logWarning(`[import] No list of generated code repository resources for '${repository.name}'`);
                        }
                    } catch (err) {
                        logUtils.logError(dialogs.getErrorMessage(`[import] Failed to read list of generated resources for code repository '${repository.name}'`));
                    }
                    progress.report({
                        message: `Importing OCI DevOps resources for code repository ${repository.name}...`
                    });
                    logUtils.logInfo(`[import] Importing OCI devops resources and creating ${devopsConfig} in the locally cloned code repository '${repository.name}'`);
                    const services = await importServices(authentication, oci, projectResources, codeRepositoryResources);
                    servicesData.push(services);
                    // Do not track local changes to .vscode/devops.json
                    gitUtils.addGitIgnoreEntry(folder, devopsConfig);
                }
            }

            logUtils.logInfo('[import] Existing devops project successfully imported');

            resolve(undefined);
            return;
        });
    });

    if (error) {
        dialogs.showErrorMessage(error);
        return undefined;
    }

    return {
        folders: folders,
        servicesData: servicesData
    };
}

async function importServices(authentication: ociAuthentication.Authentication, oci: ociContext.Context, projectResources: any | undefined, codeRepositoryResources: any | undefined): Promise<any> {
    const data: any = {
        version: '1.0'
    };
    data[authentication.getDataName()] = authentication.getData();
    data[oci.getDataName()] = oci.getData();
    const services = await ociServices.importServices(oci, projectResources, codeRepositoryResources);
    data[services.getDataName()] = services.getData();
    return data;
}
