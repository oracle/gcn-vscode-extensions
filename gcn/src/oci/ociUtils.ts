/*
 * Copyright (c) 2022, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as common from 'oci-common';
import * as identity from 'oci-identity';
import * as devops from 'oci-devops';
import * as artifacts from 'oci-artifacts';
import * as adm from 'oci-adm';
import * as ons from 'oci-ons';
import * as logging from 'oci-logging';
import * as loggingsearch  from 'oci-loggingsearch';
import * as genericartifactscontent from 'oci-genericartifactscontent';
import { containerengine } from 'oci-sdk';


const DEFAULT_NOTIFICATION_TOPIC = 'NotificationTopic';
const DEFAULT_LOG_GROUP = 'Default_Group';
const DEFAULT_BUILD_PIPELINES_GROUP = 'GCN-BuildPipelinesGroup';
const DEFAULT_DEPLOY_PIPELINES_GROUP = 'GCN-DeployPipelinesGroup';
const DEFAULT_CODE_REPOSITORIES_GROUP = 'GCN-CodeRepositoriesGroup';
const DEFAULT_COMPARTMENT_ACCESS_POLICY = 'CompartmentAccessPolicy';
const BUILD_IMAGE = 'OL7_X86_64_STANDARD_10';

// PENDING: the waitForResourceCompletionStatus will be replicated for each API, but the semantic should be consistent;
// must invent some abstraction that allows to extract the loop / result inspection algorithm

/**
 * Waits for the work request ID to complete. The request is expected to work with a single resource only. The function terminates when the resource reaches 
 * either the success status, or one of the failure status(es). The returned Promise completes on Succeeded status with the resource's OCID; if the request
 * completes with Canceled or Failed status, the Promise will be rejected with an error that describes the state.
 * 
 * @param requestId the work request ID from the original operation
 * @param resourceDescription description of the resource operated on, for error reporting
 * @returns promise that will be completed with the operated resource's OCID after it finishes to Succeeded status.
 */
 export async function loggingWaitForResourceCompletionStatus(
    authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider,
    resourceDescription : string, requestId : string) : Promise<string> {
    
    // TODO: handle timeout, use increasing polling time.
    const logClient = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const req : logging.requests.GetWorkRequestRequest = {
        workRequestId : requestId,
    };

    let requestState : logging.models.WorkRequest | undefined;

    // TODO: make this configurable, in vscode/workspace options
    const maxWaitingTimeMillis = 60 * 1000; 
    const initialPollTime = 2000;
    W: for (let waitCount = (maxWaitingTimeMillis / initialPollTime); waitCount > 0; waitCount--) {
        // console.log(`>>> getRequest ${req.workRequestId}`);
        const response = await logClient.getWorkRequest(req);
        // console.log(`>>> getRequest ${req.workRequestId} = ${response.workRequest.status}`);
        switch (response.workRequest.status) {
            case logging.models.OperationStatus.Succeeded:
            case logging.models.OperationStatus.Failed:
            case logging.models.OperationStatus.Canceled:
                requestState = response.workRequest;
                break W;
        }
        await delay(2000);
    }
    if (!requestState) {
        throw `Timeout while creating ${resourceDescription}`;
    }
    if (requestState.status !== logging.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        let msg : string = `Creation of ${resourceDescription} failed`;
        throw msg;
    }
    // PENDING: what exactly do the 'affected resources' mean ???
    return requestState.resources[0].identifier;
}

/**
 * Waits for the work request ID to complete. The request is expected to work with a single resource only. The function terminates when the resource reaches 
 * either the success status, or one of the failure status(es). The returned Promise completes on Succeeded status with the resource's OCID; if the request
 * completes with Canceled or Failed status, the Promise will be rejected with an error that describes the state.
 * 
 * @param requestId the work request ID from the original operation
 * @param resourceDescription description of the resource operated on, for error reporting
 * @returns promise that will be completed with the operated resource's OCID after it finishes to Succeeded status.
 */
 export async function admWaitForResourceCompletionStatus(
    authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider,
    resourceDescription : string, requestId : string) : Promise<string> {
    
    // TODO: handle timeout, use increasing polling time.
    const admClient = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const req : adm.requests.GetWorkRequestRequest = {
        workRequestId : requestId,
    };

    let requestState : adm.models.WorkRequest | undefined;

    // TODO: make this configurable, in vscode/workspace options
    const maxWaitingTimeMillis = 60 * 1000; 
    const initialPollTime = 2000;
    W: for (let waitCount = (maxWaitingTimeMillis / initialPollTime); waitCount > 0; waitCount--) {
        // console.log(`>>> getRequest ${req.workRequestId}`);
        const response = await admClient.getWorkRequest(req);
        // console.log(`>>> getRequest ${req.workRequestId} = ${response.workRequest.status}`);
        switch (response.workRequest.status) {
            case adm.models.OperationStatus.Succeeded:
            case adm.models.OperationStatus.Failed:
            case adm.models.OperationStatus.Canceled:
                requestState = response.workRequest;
                break W;
        }
        await delay(2000);
    }
    if (!requestState) {
        throw `Timeout while creating ${resourceDescription}`;
    }
    if (requestState.status !== adm.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        let msg : string = `Creation of ${resourceDescription} failed`;
        throw msg;
    }
    // PENDING: what exactly do the 'affected resources' mean ???
    return requestState.resources[0].identifier;
}

/**
 * Waits for the work request ID to complete. The request is expected to work with a single resource only. The function terminates when the resource reaches 
 * either the success status, or one of the failure status(es). The returned Promise completes on Succeeded status with the resource's OCID; if the request
 * completes with Canceled or Failed status, the Promise will be rejected with an error that describes the state.
 * 
 * @param requestId the work request ID from the original operation
 * @param resourceDescription description of the resource operated on, for error reporting
 * @returns promise that will be completed with the operated resource's OCID after it finishes to Succeeded status.
 */
export async function devopsWaitForResourceCompletionStatus(
    authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider,
    resourceDescription : string, requestId : string) : Promise<string> {
    
    // TODO: handle timeout, use increasing polling time.
    const devClient = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const req : devops.requests.GetWorkRequestRequest = {
        workRequestId : requestId,
    };

    let requestState : devops.models.WorkRequest | undefined;

    // TODO: make this configurable, in vscode/workspace options
    const maxWaitingTimeMillis = 60 * 1000; 
    const initialPollTime = 2000;
    W: for (let waitCount = (maxWaitingTimeMillis / initialPollTime); waitCount > 0; waitCount--) {
        // console.log(`>>> getRequest ${req.workRequestId}`);
        const response = await devClient.getWorkRequest(req);
        // console.log(`>>> getRequest ${req.workRequestId} = ${response.workRequest.status}`);
        switch (response.workRequest.status) {
            case devops.models.OperationStatus.Succeeded:
            case devops.models.OperationStatus.Failed:
            case devops.models.OperationStatus.Canceled:
                requestState = response.workRequest;
                break W;
        }
        await delay(2000);
    }
    if (!requestState) {
        throw `Timeout while creating ${resourceDescription}`;
    }
    if (requestState.status !== devops.models.OperationStatus.Succeeded) {
        // PENDING: make some abortion exception that can carry WorkRequest errors, should be caught top-level & reported to the user instead of plain message.
        let msg : string = `Creation of ${resourceDescription} failed`;
        throw msg;
    }
    // PENDING: what exactly do the 'affected resources' mean ???
    return requestState.resources[0].identifier;
}

export async function getUser(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.models.User> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.GetUserRequest = {
        userId: authenticationDetailsProvider.getUser()
    };
    return client.getUser(request).then(response => response.user);
}

export async function getTenancy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.models.Tenancy> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.GetTenancyRequest = {
        tenancyId: authenticationDetailsProvider.getTenantId()
    };
    return client.getTenancy(request).then(response => response.tenancy);
}

export async function listCompartments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider): Promise<identity.models.Compartment[]> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.ListCompartmentsRequest = {
        compartmentId: authenticationDetailsProvider.getTenantId(),
        compartmentIdInSubtree: true,
        lifecycleState: identity.models.Compartment.LifecycleState.Active,
        accessLevel: identity.requests.ListCompartmentsRequest.AccessLevel.Accessible,
        limit: 1000
    };
    const result: identity.models.Compartment[] = [];
    do {
        const response = await client.listCompartments(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getCompartment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<identity.models.Compartment> {
    const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: identity.requests.GetCompartmentRequest = {
        compartmentId: compartmentID
    };
    return client.getCompartment(request).then(response => response.compartment);
}

export async function listDevOpsProjects(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<devops.models.ProjectSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListProjectsRequest = {
        compartmentId: compartmentID,
        lifecycleState: devops.models.Project.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.ProjectSummary[] = [];
    do {
        const response = await client.listProjects(request);
        result.push(...response.projectCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDevopsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectId: string): Promise<devops.models.Project> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetProjectRequest = {
        projectId: projectId
    };
    return client.getProject(request).then(response => response.project);
}

export async function deleteDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectId: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    client.deleteProject({ projectId: projectId });
}

export async function listCodeRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.RepositorySummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListRepositoriesRequest = {
        projectId: projectID,
        lifecycleState: devops.models.Repository.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.RepositorySummary[] = [];
    do {
        const response = await client.listRepositories(request);
        result.push(...response.repositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, envID: string): Promise<devops.models.DeployEnvironment> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeployEnvironmentRequest = {
        deployEnvironmentId: envID
    };
    return client.getDeployEnvironment(request).then(response => response.deployEnvironment);
}

export function asOkeDeployEnvironemnt(env?: devops.models.DeployEnvironment): devops.models.OkeClusterDeployEnvironment | undefined {
    if (env?.deployEnvironmentType === devops.models.OkeClusterDeployEnvironment.deployEnvironmentType) {
        return env as devops.models.OkeClusterDeployEnvironment;
    }
    return undefined;
}

export async function getCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<devops.models.Repository> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetRepositoryRequest = {
        repositoryId: repositoryID
    };
    return client.getRepository(request).then(response => response.repository);
}

export async function deleteCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repo: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    client.deleteRepository({ repositoryId: repo });
}

export async function getBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.BuildPipeline> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetBuildPipelineRequest = {
        buildPipelineId: pipelineID
    };
    return client.getBuildPipeline(request).then(response => response.buildPipeline);
}

export async function listBuildPipelines(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.BuildPipelineSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListBuildPipelinesRequest = {
        projectId: projectID,
        lifecycleState: devops.models.BuildPipeline.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.BuildPipelineSummary[] = [];
    do {
        const response = await client.listBuildPipelines(request);
        result.push(...response.buildPipelineCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipeId: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteBuildPipeline({ buildPipelineId : pipeId });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting build pipeline", (await response).opcWorkRequestId);
    }
}

export async function listBuildPipelineStages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.BuildPipelineStageSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListBuildPipelineStagesRequest = {
        buildPipelineId: pipelineID,
        lifecycleState: devops.models.BuildPipelineStage.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.BuildPipelineStageSummary[] = [];
    do {
        const response = await client.listBuildPipelineStages(request);
        result.push(...response.buildPipelineStageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteBuildPipelineStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, stage: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteBuildPipelineStage({ buildPipelineStageId : stage });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting build pipeline stage", (await response).opcWorkRequestId);
    }
}

export async function listBuildPipelinesByCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, repositoryID: string): Promise<devops.models.BuildPipelineSummary[]> {
    const buildPipelines = await listBuildPipelines(authenticationDetailsProvider, projectID);
    const buildPipelineSummaries: devops.models.BuildPipelineSummary[] = [];
    if (buildPipelines) {
        for (const buildPipeline of buildPipelines) {
            const stages = await listBuildPipelineStages(authenticationDetailsProvider, buildPipeline.id);
            if (stages) {
                let buildPipelineSummary: devops.models.BuildPipelineSummary | undefined = undefined;
                for (const stage of stages) {
                    if (stage.buildPipelineStageType === devops.models.BuildStage.buildPipelineStageType) {
                        const buildStage = stage as devops.models.BuildStage;
                        for (const buildSource of buildStage.buildSourceCollection.items) {
                            if (buildSource.connectionType === devops.models.DevopsCodeRepositoryBuildSource.connectionType) {
                                const devopsBuildSource = buildSource as devops.models.DevopsCodeRepositoryBuildSource;
                                if (devopsBuildSource.repositoryId === repositoryID) {
                                    buildPipelineSummary = buildPipeline;
                                    break;
                                }
                            }
                        }
                        if (buildPipelineSummary) {
                            break;
                        }
                    }
                }
                if (buildPipelineSummary) {
                    buildPipelineSummaries.push(buildPipelineSummary);
                }
            }
        }
    }
    return buildPipelineSummaries;
}

export async function listDeployPipelines(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.DeployPipelineSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployPipelinesRequest = {
        projectId: projectID,
        lifecycleState: devops.models.DeployPipeline.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployPipelineSummary[] = [];
    do {
        const response = await client.listDeployPipelines(request);
        result.push(...response.deployPipelineCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.DeployPipeline> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeployPipelineRequest = {
        deployPipelineId: pipelineID
    };
    return client.getDeployPipeline(request).then(response => response.deployPipeline);
}

export async function deleteDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipeId: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteDeployPipeline({ deployPipelineId : pipeId });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy pipeline", (await response).opcWorkRequestId);
    }
}

export async function listDeployStages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.models.DeployStageSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployStagesRequest = {
        deployPipelineId: pipelineID,
        lifecycleState: devops.models.DeployStage.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployStageSummary[] = [];
    do {
        const response = await client.listDeployStages(request);
        result.push(...response.deployStageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteDeployStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, stage: string, wait: boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const response = client.deleteDeployStage({ deployStageId: stage });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy stage", (await response).opcWorkRequestId);
    }
}

export async function listArtifactRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<artifacts.models.RepositorySummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListRepositoriesRequest = {
        compartmentId: compartmentID,
        lifecycleState: artifacts.models.Repository.LifecycleState.Available,
        limit: 1000
    };
    const result: artifacts.models.RepositorySummary[] = [];
    do {
        const response = await client.listRepositories(request);
        result.push(...response.repositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getArtifactRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<artifacts.models.Repository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetRepositoryRequest = {
        repositoryId: repositoryID
    };
    return client.getRepository(request).then(response => response.repository);
}

export async function deleteArtifactsRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string) {
    const items = await listGenericArtifacts(authenticationDetailsProvider, compartmentID, repositoryID);
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    if (items) {
        for (const item of items) {
            const deleteGenericArtifactRequest: artifacts.requests.DeleteGenericArtifactRequest = {
                artifactId: item.id
            };
            await client.deleteGenericArtifact(deleteGenericArtifactRequest);
        }
    }
    client.deleteRepository({ repositoryId: repositoryID });
}

export async function listGenericArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string, artifactPath?: string): Promise<artifacts.models.GenericArtifactSummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListGenericArtifactsRequest = {
        compartmentId: compartmentID,
        repositoryId: repositoryID,
        artifactPath: artifactPath, // NOTE: artifactPath filtering uses startsWith, not exact match!
        lifecycleState: artifactPath ? undefined : artifacts.models.GenericArtifact.LifecycleState.Available,
        sortBy: artifactPath ? artifacts.requests.ListGenericArtifactsRequest.SortBy.Timecreated : artifacts.requests.ListGenericArtifactsRequest.SortBy.Displayname,
        limit: 1000
    };
    const result: artifacts.models.GenericArtifactSummary[] = [];
    do {
        const response = await client.listGenericArtifacts(request);
        result.push(...response.genericArtifactCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getGenericArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<artifacts.models.GenericArtifact> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetGenericArtifactRequest = {
        artifactId: artifactID
    };
    return client.getGenericArtifact(request).then(response => response.genericArtifact);
}

export async function getGenericArtifactContent(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<any> {
    const client = new genericartifactscontent.GenericArtifactsContentClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: genericartifactscontent.requests.GetGenericArtifactContentRequest = {
        artifactId: artifactID
    };
    return client.getGenericArtifactContent(request).then(response => response.value);
}

export async function deleteDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactId: string, wait : boolean = false) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    // console.log(`> deleteDeployArtifact ${artifactId}`);
    const response = client.deleteDeployArtifact({ deployArtifactId : artifactId });
    if (wait) {
        await devopsWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting deploy artifact", (await response).opcWorkRequestId);
    }
}

export async function listDeployArtifacts(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.DeployArtifactSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployArtifactsRequest = {
        projectId: projectID,
        lifecycleState: devops.models.DeployArtifact.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployArtifactSummary[] = [];
    do {
        const response = await client.listDeployArtifacts(request);
        result.push(...response.deployArtifactCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, artifactID: string): Promise<devops.models.DeployArtifact> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.GetDeployArtifactRequest = {
        deployArtifactId: artifactID
    };
    return client.getDeployArtifact(request).then(response => response.deployArtifact);
}

export async function listContainerRepositories(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<artifacts.models.ContainerRepositorySummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListContainerRepositoriesRequest = {
        compartmentId: compartmentID,
        lifecycleState: artifacts.models.ContainerRepository.LifecycleState.Available,
        limit: 1000
    };
    const result: artifacts.models.ContainerRepositorySummary[] = [];
    do {
        const response = await client.listContainerRepositories(request);
        result.push(...response.containerRepositoryCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string): Promise<artifacts.models.ContainerRepository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetContainerRepositoryRequest = {
        repositoryId: repositoryID
    };
    return client.getContainerRepository(request).then(response => response.containerRepository);
}

export async function deleteContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string) {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    client.deleteContainerRepository({ repositoryId : repositoryID});
}

export async function listContainerImages(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, repositoryID: string): Promise<artifacts.models.ContainerImageSummary[]> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.ListContainerImagesRequest = {
        compartmentId: compartmentID,
        repositoryId: repositoryID,
        lifecycleState: artifacts.models.ContainerImage.LifecycleState.Available,
        limit: 1000
    };
    const result: artifacts.models.ContainerImageSummary[] = [];
    do {
        const response = await client.listContainerImages(request);
        result.push(...response.containerImageCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getContainerImage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, imageID: string): Promise<artifacts.models.ContainerImage> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: artifacts.requests.GetContainerImageRequest = {
        imageId: imageID
    };
    return client.getContainerImage(request).then(response => response.containerImage);
}

export async function listDeployEnvironments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string): Promise<devops.models.DeployEnvironmentSummary[]> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.ListDeployEnvironmentsRequest = {
        projectId: projectID,
        lifecycleState: devops.models.DeployEnvironment.LifecycleState.Active,
        limit: 1000
    };
    const result: devops.models.DeployEnvironmentSummary[] = [];
    do {
        const response = await client.listDeployEnvironments(request);
        result.push(...response.deployEnvironmentCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function deleteDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, envID: string) {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: devops.requests.DeleteDeployEnvironmentRequest = {
        deployEnvironmentId: envID
    };
    client.deleteDeployEnvironment(request);
}

export async function listKnowledgeBases(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<adm.models.KnowledgeBaseSummary[]> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.ListKnowledgeBasesRequest = {
        compartmentId: compartmentID,
        lifecycleState: adm.models.KnowledgeBase.LifecycleState.Active,
        limit: 1000
    };
    const result: adm.models.KnowledgeBaseSummary[] = [];
    do {
        const response = await client.listKnowledgeBases(request);
        result.push(...response.knowledgeBaseCollection.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function getKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, knowledgeBaseID: string): Promise<adm.models.KnowledgeBase> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.GetKnowledgeBaseRequest = {
        knowledgeBaseId: knowledgeBaseID
    };
    return client.getKnowledgeBase(request).then(response => response.knowledgeBase);
}

export async function deleteKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, knowledgeId: string, wait: boolean = false) {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    let response = client.deleteKnowledgeBase({ knowledgeBaseId : knowledgeId});
    if (wait) {
        admWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting knowledge base", (await response).opcWorkRequestId);
    }
}    

export async function listVulnerabilityAudits(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, knowledgeBaseID: string, limit: number | undefined = 10): Promise<adm.models.VulnerabilityAuditSummary[]> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.ListVulnerabilityAuditsRequest = {
        compartmentId: compartmentID,
        knowledgeBaseId: knowledgeBaseID,
        lifecycleState: adm.models.VulnerabilityAudit.LifecycleState.Active,
        limit: limit ? Math.min(1000, limit) : 1000
    };
    const result: adm.models.VulnerabilityAuditSummary[] = [];
    do {
        const response = await client.listVulnerabilityAudits(request);
        result.push(...response.vulnerabilityAuditCollection.items);
        request.page = response.opcNextPage;
        if (limit) {
            request.limit = Math.min(1000, limit - result.length);
        }
    } while (request.page && (request.limit as number) > 0);
    return result;
}

export async function getVulnerabilityAudit(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, vulnerabilityAuditID: string): Promise<adm.models.VulnerabilityAudit> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: adm.requests.GetVulnerabilityAuditRequest = {
        vulnerabilityAuditId: vulnerabilityAuditID
    };
    return client.getVulnerabilityAudit(request).then(response => response.vulnerabilityAudit);
}

export async function listNotificationTopics(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<ons.models.NotificationTopicSummary[]> {
    const client = new ons.NotificationControlPlaneClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: ons.requests.ListTopicsRequest = {
        compartmentId:compartmentID,
        lifecycleState: ons.models.NotificationTopic.LifecycleState.Active,
        limit: 50
    };
    const result: ons.models.NotificationTopicSummary[] = [];
    do {
        const response = await client.listTopics(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function createKnowledgeBase(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, 
    compartmentID: string, projectName: string, flags?: { [key: string]: string } | undefined): Promise<string> {
    const client = new adm.ApplicationDependencyManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    
    // PENDING: displayName must match ".*(?:^[a-zA-Z_](-?[a-zA-Z_0-9])*$).*" -- transliterate invalid characters in name
    const displayName = `${projectName}Audits`;
    const request : adm.requests.CreateKnowledgeBaseRequest = {
        createKnowledgeBaseDetails : {
            "compartmentId" : compartmentID,
            "displayName": displayName,
            freeformTags: flags
        }
    }

    let response = await client.createKnowledgeBase(request);
    return admWaitForResourceCompletionStatus(authenticationDetailsProvider, `Create knowledge base ${displayName}`, response.opcWorkRequestId);
}

export async function createDefaultNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description?: string): Promise<ons.models.NotificationTopic> {
    const idClient = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const compartmentRequest: identity.requests.GetCompartmentRequest = {
        compartmentId: compartmentID
    };

    // PENDING: Creating a notification with a name already used within the tenancy (although in a different compartment) fails - whether it is a feature or a bug is not known.
    // Let's default the name to <Compartment-Name>+constant -- althoug even compartment name may not be unique (same name in 2 different parents). Should be the OCID there :) ?
    const compartmentResponse = await idClient.getCompartment(compartmentRequest);

    const client = new ons.NotificationControlPlaneClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createTopicDetails = {
        name: compartmentResponse.compartment.name.replace(/\W+/g,'') + DEFAULT_NOTIFICATION_TOPIC,
        compartmentId: compartmentID,
        description: description
    };
    const request: ons.requests.CreateTopicRequest = {
        createTopicDetails: createTopicDetails
    };
    return client.createTopic(request).then(response => response.notificationTopic);
}

export async function getOrCreateNotificationTopic(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description?: string): Promise<string> {
    const notificationTopics = await listNotificationTopics(authenticationDetailsProvider, compartmentID);
    if (notificationTopics) {
        if (notificationTopics.length > 0) {
            return notificationTopics[0].topicId;
        }
    }
    return createDefaultNotificationTopic(authenticationDetailsProvider, compartmentID, description).then(response => response.topicId);
}

export async function listClusters(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string): Promise<containerengine.models.ClusterSummary[]> {
    const client = new containerengine.ContainerEngineClient({
        authenticationDetailsProvider: authenticationDetailsProvider
    });
    const request: containerengine.requests.ListClustersRequest = {
        compartmentId: compartmentID,
        lifecycleState: [ containerengine.models.ClusterLifecycleState.Active ],
        limit: 1000
    };
    const result: containerengine.models.ClusterSummary[] = [];
    do {
        const response = await client.listClusters(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function createDevOpsProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectName: string, compartmentID: string, notificationTopicID: string, description?: string): Promise<devops.models.Project> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createProjectDetails = {
        name: projectName,
        description: description,
        notificationConfig: {
            topicId: notificationTopicID
        },
        compartmentId: compartmentID
    };
    const request: devops.requests.CreateProjectRequest = {
        createProjectDetails: createProjectDetails
    };
    return client.createProject(request).then(response => response.project);
}

export async function listLogGroups(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<logging.models.LogGroupSummary[]> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: logging.requests.ListLogGroupsRequest = {
        compartmentId: compartmentID,
        displayName: name,
        limit: 1000
    };
    const result: logging.models.LogGroupSummary[] = [];
    do {
        const response = await client.listLogGroups(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function listLogs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logGroupID: string): Promise<logging.models.LogSummary[]> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const request: logging.requests.ListLogsRequest = {
        logGroupId: logGroupID,
        lifecycleState: logging.models.LogLifecycleState.Active,
        limit: 1000
    };
    const result: logging.models.LogSummary[] = [];
    do {
        const response = await client.listLogs(request);
        result.push(...response.items);
        request.page = response.opcNextPage;
    } while (request.page);
    return result;
}

export async function searchLogs(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, logGroupID: string, logID: string, operation: 'buildRun' | 'deployment', operationID: string, timeStart: Date, timeEnd: Date): Promise<loggingsearch.models.SearchResult[] | undefined> {
    try {
        const client = new loggingsearch.LogSearchClient({ authenticationDetailsProvider: authenticationDetailsProvider });

        const searchLogsDetails = {
            timeStart: timeStart,
            timeEnd: timeEnd,
            searchQuery: `search "${compartmentID}/${logGroupID}/${logID}" | where data.${operation}Id = '${operationID}'`,
            isReturnFieldInfo: false
        };

        const result: loggingsearch.models.SearchResult[] = [];
        let nextPage;
        do {
            const searchLogsRequest: loggingsearch.requests.SearchLogsRequest = {
                searchLogsDetails: searchLogsDetails,
                limit: 1000,
                page: nextPage
            };
            const searchLogsResponse = await client.searchLogs(searchLogsRequest);
            if (searchLogsResponse.searchResponse.results?.length) {
                if (!result.length && !searchLogsResponse.opcNextPage) {
                    return searchLogsResponse.searchResponse.results;
                }
                result.push(...searchLogsResponse.searchResponse.results);
            }
            nextPage = searchLogsResponse.opcNextPage;
        } while (nextPage);

        return result;
    } catch (error) {
        console.log('>>> searchLogs ' + error);
        return undefined;
    }
}

export async function createDefaultLogGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description?: string): Promise<logging.responses.CreateLogGroupResponse | undefined> {
    try {
        const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createLogGroupDetails = {
            compartmentId: compartmentID,
            displayName: DEFAULT_LOG_GROUP,
            description: description
        };
        const createLogGroupRequest: logging.requests.CreateLogGroupRequest = {
            createLogGroupDetails: createLogGroupDetails
        };
        const createLogGroupResponse = await client.createLogGroup(createLogGroupRequest);
        if (createLogGroupResponse.opcWorkRequestId) {
            const getWorkRequestRequest: logging.requests.GetWorkRequestRequest = {
                workRequestId: createLogGroupResponse.opcWorkRequestId
            };
            await completion(2000, async () => (await client.getWorkRequest(getWorkRequestRequest)).workRequest.status);
        }
        return createLogGroupResponse;
    } catch (error) {
        console.log('>>> createLogGroup ' + error);
        return undefined;
    }
}

export async function getDefaultLogGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean, description?: string): Promise<string | undefined> {
    const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
    if (logGroup.length > 0) {
        return logGroup[0].id;
    }
    if (create) {
        const created = await createDefaultLogGroup(authenticationDetailsProvider, compartmentID, description);
        if (created) {
            const logGroup = await listLogGroups(authenticationDetailsProvider, compartmentID, DEFAULT_LOG_GROUP);
            if (logGroup.length > 0) {
                return logGroup[0].id;
            }
        }
    }
    return undefined;
}

export async function listDynamicGroups(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<identity.responses.ListDynamicGroupsResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDynamicGroupsRequest: identity.requests.ListDynamicGroupsRequest = {
            compartmentId: compartmentID,
            name
        };
        return client.listDynamicGroups(listDynamicGroupsRequest);
    } catch (error) {
        console.log('>>> listDynamicGroups ' + error);
        return undefined;
    }
}

export async function createDynamicGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name: string, description: string, matchingRule: string): Promise<identity.responses.CreateDynamicGroupResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDynamicGroupDetails = {
            compartmentId: compartmentID,
            name,
            description,
            matchingRule
        };
        const createTopicRequest: identity.requests.CreateDynamicGroupRequest = {
            createDynamicGroupDetails: createDynamicGroupDetails
        };
        return client.createDynamicGroup(createTopicRequest);
    } catch (error) {
        console.log('>>> createDynamicGroup ' + error);
        return undefined;
    }
}

export async function updateDynamicGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, groupID: string, details: identity.models.UpdateDynamicGroupDetails): Promise<identity.responses.UpdateDynamicGroupResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const updateDynamicGroupRequest: identity.requests.UpdateDynamicGroupRequest = {
            dynamicGroupId: groupID,
            updateDynamicGroupDetails: details
        };
        return client.updateDynamicGroup(updateDynamicGroupRequest);
    } catch (error) {
        console.log('>>> updateDynamicGroup ' + error);
        return undefined;
    }
}

export async function getDefaultBuildPipelinesGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<identity.models.DynamicGroup | undefined> {
    const tenancy = authenticationDetailsProvider.getTenantId();
    const rule = `ALL {resource.type = 'devopsbuildpipeline', resource.compartment.id = '${compartmentID}'}`;
    const group = (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_BUILD_PIPELINES_GROUP))?.items.find(g => DEFAULT_BUILD_PIPELINES_GROUP === g.name);
    if (group) {
        if (group.matchingRule.indexOf(rule) < 0) {
            const len = group.matchingRule.length;
            await updateDynamicGroup(authenticationDetailsProvider, group.id, { matchingRule: `${group.matchingRule.slice(0, len - 1)}, ${rule}${group.matchingRule.slice(len - 1)}`});
        }
        return group;
    }
    if (create) {
        const created = await createDynamicGroup(authenticationDetailsProvider, tenancy, DEFAULT_BUILD_PIPELINES_GROUP, 'Default group for build pipelines created from VS Code', `Any {${rule}}`);
        if (created) {
            return (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_BUILD_PIPELINES_GROUP))?.items.find(g => DEFAULT_BUILD_PIPELINES_GROUP === g.name);
        }
    }
    return undefined;
}

export async function getDefaultDeployPipelinesGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<identity.models.DynamicGroup | undefined> {
    const tenancy = authenticationDetailsProvider.getTenantId();
    const rule = `ALL {resource.type = 'devopsdeploypipeline', resource.compartment.id = '${compartmentID}'}`;
    const group = (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_DEPLOY_PIPELINES_GROUP))?.items.find(g => DEFAULT_DEPLOY_PIPELINES_GROUP === g.name);
    if (group) {
        if (group.matchingRule.indexOf(rule) < 0) {
            const len = group.matchingRule.length;
            await updateDynamicGroup(authenticationDetailsProvider, group.id, { matchingRule: `${group.matchingRule.slice(0, len - 1)}, ${rule}${group.matchingRule.slice(len - 1)}`});
        }
        return group;
    }
    if (create) {
        const created = await createDynamicGroup(authenticationDetailsProvider, tenancy, DEFAULT_DEPLOY_PIPELINES_GROUP, 'Default group for deployment pipelines created from VS Code', `Any {${rule}}`);
        if (created) {
            return (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_DEPLOY_PIPELINES_GROUP))?.items.find(g => DEFAULT_DEPLOY_PIPELINES_GROUP === g.name);
        }
    }
    return undefined;
}

export async function getDefaultCodeRepositoriesGroup(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, create?: boolean): Promise<identity.models.DynamicGroup | undefined> {
    const tenancy = authenticationDetailsProvider.getTenantId();
    const rule = `ALL {resource.type = 'devopsrepository', resource.compartment.id = '${compartmentID}'}`;
    const group = (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_CODE_REPOSITORIES_GROUP))?.items.find(g => DEFAULT_CODE_REPOSITORIES_GROUP === g.name);
    if (group) {
        if (group.matchingRule.indexOf(rule) < 0) {
            const len = group.matchingRule.length;
            await updateDynamicGroup(authenticationDetailsProvider, group.id, { matchingRule: `${group.matchingRule.slice(0, len - 1)}, ${rule}${group.matchingRule.slice(len - 1)}`});
        }
        return group;
    }
    if (create) {
        const created = await createDynamicGroup(authenticationDetailsProvider, tenancy, DEFAULT_CODE_REPOSITORIES_GROUP, 'Default group for code repositories created from VS Code', `Any {${rule}}`);
        if (created) {
            return (await listDynamicGroups(authenticationDetailsProvider, tenancy, DEFAULT_CODE_REPOSITORIES_GROUP))?.items.find(g => DEFAULT_CODE_REPOSITORIES_GROUP === g.name);
        }
    }
    return undefined;
}

export async function listPolicies(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, name?: string): Promise<identity.responses.ListPoliciesResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listPoliciesRequest: identity.requests.ListPoliciesRequest = {
            compartmentId: compartmentID,
            name,
        };
        return client.listPolicies(listPoliciesRequest);
    } catch (error) {
        console.log('>>> listPolicies ' + error);
        return undefined;
    }
}

export async function createPolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, description: string, statements: string[]): Promise<identity.responses.CreatePolicyResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createPolicyDetails = {
            compartmentId: compartmentID,
            name: DEFAULT_COMPARTMENT_ACCESS_POLICY,
            description,
            statements
        };
        const createPolicyRequest: identity.requests.CreatePolicyRequest = {
            createPolicyDetails: createPolicyDetails
        };
        return client.createPolicy(createPolicyRequest);
    } catch (error) {
        console.log('>>> createPolicy ' + error);
        return undefined;
    }
}

export async function updatePolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, policyID: string, details: identity.models.UpdatePolicyDetails): Promise<identity.responses.UpdatePolicyResponse | undefined> {
    try {
        const client = new identity.IdentityClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const updatePolicyRequest: identity.requests.UpdatePolicyRequest = {
            policyId: policyID,
            updatePolicyDetails: details
        };
        return client.updatePolicy(updatePolicyRequest);
    } catch (error) {
        console.log('>>> updatePolicy ' + error);
        return undefined;
    }
}

export async function getCompartmentAccessPolicy(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, buildPipelinesGroupName: string, deployPipelinesGroupName: string, codeRepositoriesGroupName: string, create?: boolean): Promise<string | undefined> {
    const buildPipelinesGroupRule = `Allow dynamic-group ${buildPipelinesGroupName} to manage all-resources in compartment id ${compartmentID}`;
    const deployPipelinesGroupRule = `Allow dynamic-group ${deployPipelinesGroupName} to manage all-resources in compartment id ${compartmentID}`;
    const codeRepositoriesGroupRule = `Allow dynamic-group ${codeRepositoriesGroupName} to manage all-resources in compartment id ${compartmentID}`;
    const policy = (await listPolicies(authenticationDetailsProvider, compartmentID, DEFAULT_COMPARTMENT_ACCESS_POLICY))?.items.find(p => DEFAULT_COMPARTMENT_ACCESS_POLICY === p.name);
    if (policy) {
        let statements = [...policy.statements];
        if (!policy.statements.includes(buildPipelinesGroupRule)) {
            statements.push(buildPipelinesGroupRule);
        }
        if (!policy.statements.includes(deployPipelinesGroupRule)) {
            statements.push(deployPipelinesGroupRule);
        }
        if (!policy.statements.includes(codeRepositoriesGroupRule)) {
            statements.push(codeRepositoriesGroupRule);
        }
        if (statements.length != policy.statements.length) {
            await updatePolicy(authenticationDetailsProvider, policy.id, { statements });
        }
        return policy.id;
    }
    if (create) {
        const created = await createPolicy(authenticationDetailsProvider, compartmentID, 'Default policy for accessing compartment resources created from VS Code', [
            buildPipelinesGroupRule,
            deployPipelinesGroupRule,
            codeRepositoriesGroupRule
        ]);
        if (created) {
            return (await listPolicies(authenticationDetailsProvider, compartmentID, DEFAULT_COMPARTMENT_ACCESS_POLICY))?.items.find(g => DEFAULT_COMPARTMENT_ACCESS_POLICY == g.name)?.id;
        }
    }
    return undefined;
}

export async function listLogsByProject(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentId : string, projectId : string) : Promise<logging.models.LogSummary[]> {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const value: logging.models.LogSummary[] = [];
    const groups = await listLogGroups(authenticationDetailsProvider, compartmentId);
    for (let lg of groups) {
        let logs = (await client.listLogs({ 
                logGroupId: lg.id, 
                sourceResource : projectId
            }))?.items;
        logs.forEach(l => {
            if (l.configuration?.source?.resource === projectId) {
                // for some reason, the filter for "sourceResource" in listLogs does not work.
                switch (l.lifecycleState) {
                    case logging.models.LogLifecycleState.Active:
                    case logging.models.LogLifecycleState.Creating:
                    case logging.models.LogLifecycleState.Updating:
                        value.push(l);
                        break;
                }
            }
        })
    }
    return value;
}

export async function deleteLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, logId : string, logGroupID: string, wait : boolean = false) {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    // console.log(`> deleteLog ${logId}`);
    const response = client.deleteLog({ 
        logGroupId : logGroupID, 
        logId : logId
    });
    if (wait) {
        await loggingWaitForResourceCompletionStatus(authenticationDetailsProvider, "Deleting project log", (await response).opcWorkRequestId);
    }
}

export async function createProjectLog(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, logGroupID: string, projectID: string, projectName: string) {
    const client = new logging.LoggingManagementClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createLogDetails = {
        displayName: `${projectName}Log`,
        logType: logging.models.CreateLogDetails.LogType.Service,
        isEnabled: true,
        configuration: {
            compartmentId: compartmentID,
            source: {
                sourceType: logging.models.OciService.sourceType,
                service: 'devops',
                resource: projectID,
                category: 'all',
                parameters: {}
            },
            archiving: {
                isEnabled: false
            }
        },
        retentionDuration: 30
    };
    const request: logging.requests.CreateLogRequest = {
        logGroupId: logGroupID,
        createLogDetails: createLogDetails
    };
    const response = await client.createLog(request);
    if (response.opcWorkRequestId) {
        const getWorkRequestRequest: logging.requests.GetWorkRequestRequest = {
            workRequestId: response.opcWorkRequestId
        };
        await completion(2000, async () => (await client.getWorkRequest(getWorkRequestRequest)).workRequest.status);
    }
}

export async function createArtifactsRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, projectName: string, flags? : { [key:string] : string } | undefined): Promise<artifacts.models.Repository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createRepositoryDetails = {
        repositoryType: artifacts.models.CreateGenericRepositoryDetails.repositoryType,
        displayName: `${projectName}ArtifactRepository`,
        compartmentId: compartmentID,
        description: `Artifact repository for devops project ${projectName}`,
        isImmutable: false,
        freeformTags: flags
    };
    const request: artifacts.requests.CreateRepositoryRequest = {
        createRepositoryDetails: createRepositoryDetails
    };
    return client.createRepository(request).then(response => response.repository);
}

export async function createContainerRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, compartmentID: string, projectName: string, codeRepositoryName: string, repositoryName: string): Promise<artifacts.models.ContainerRepository> {
    const client = new artifacts.ArtifactsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createContainerRepositoryDetails = {
        compartmentId: compartmentID,
        displayName: repositoryName.toLowerCase(),
        description: `Container repository for devops project ${projectName} & code repository ${codeRepositoryName}`,
        isImmutable: false,
        isPublic: true
    };
    const request: artifacts.requests.CreateContainerRepositoryRequest = {
        createContainerRepositoryDetails: createContainerRepositoryDetails
    };
    return client.createContainerRepository(request).then(response => response.containerRepository);
}

export async function createOkeDeployEnvironment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, projectName: string, clusterID: string): Promise<devops.models.DeployEnvironment> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createDeployEnvironmentDetails = {
        deployEnvironmentType: devops.models.CreateOkeClusterDeployEnvironmentDetails.deployEnvironmentType,
        displayName: `${projectName}OkeDeployEnvironment`,
        description: `OKE cluster environment for devops project ${projectName}`,
        projectId: projectID,
        clusterId: clusterID
    };
    const request: devops.requests.CreateDeployEnvironmentRequest = {
        createDeployEnvironmentDetails: createDeployEnvironmentDetails
    };
    return client.createDeployEnvironment(request).then(response => response.deployEnvironment);
}

export async function createCodeRepository(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, repositoryName: string, defaultBranchName: string, description?: string): Promise<devops.models.Repository> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createRepositoryDetails = {
        name: repositoryName,
        description: description,
        projectId: projectID,
        defaultBranch: defaultBranchName,
        repositoryType: devops.models.Repository.RepositoryType.Hosted
    };
    const request: devops.requests.CreateRepositoryRequest = {
        createRepositoryDetails: createRepositoryDetails
    };
    const response = await client.createRepository(request);
    if (response.opcWorkRequestId) {
        const getWorkRequestRequest: devops.requests.GetWorkRequestRequest = {
            workRequestId: response.opcWorkRequestId
        };
        await completion(2000, async () => (await client.getWorkRequest(getWorkRequestRequest)).workRequest.status);
    }
    return response.repository;
}

export async function createBuildPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, displayName: string, description?: string): Promise<devops.models.BuildPipeline> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createBuildPipelineDetails = {
        displayName: displayName,
        description: description,
        projectId: projectID
    };
    const request: devops.requests.CreateBuildPipelineRequest = {
        createBuildPipelineDetails: createBuildPipelineDetails
    };
    return client.createBuildPipeline(request).then(response => response.buildPipeline);
}

export async function createBuildPipelineBuildStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, repositoryID: string, repositoryName: string, repositoryUrl: string, buildSpecFile: string): Promise<devops.models.BuildPipelineStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createBuildPipelineStageDetails: devops.models.CreateBuildStageDetails = {
        displayName: 'Build',
        description: 'Build stage generated by VS Code',
        buildPipelineId: pipelineID,
        buildPipelineStagePredecessorCollection: {
            items: [
                {
                    id: pipelineID
                }
            ]
        },
        buildSpecFile: buildSpecFile,
        image: BUILD_IMAGE,
        buildSourceCollection: {
            items: [
                {
                    name: repositoryName,
                    repositoryUrl: repositoryUrl,
                    repositoryId: repositoryID,
                    branch: 'master',
                    connectionType: devops.models.DevopsCodeRepositoryBuildSource.connectionType
                }
            ] as devops.models.DevopsCodeRepositoryBuildSource[]
        },
        buildPipelineStageType: devops.models.CreateBuildStageDetails.buildPipelineStageType
    };
    const request: devops.requests.CreateBuildPipelineStageRequest = {
        createBuildPipelineStageDetails: createBuildPipelineStageDetails
    };
    return client.createBuildPipelineStage(request).then(response => response.buildPipelineStage);
}

export async function createBuildPipelineArtifactsStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, buildStageID: string, artifactID: string, artifactName: string): Promise<devops.models.BuildPipelineStage> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const createBuildPipelineStageDetails: devops.models.CreateDeliverArtifactStageDetails = {
        displayName: 'Artifacts',
        description: 'Artifacts stage generated by VS Code',
        buildPipelineId: pipelineID,
        buildPipelineStagePredecessorCollection: {
            items: [
                {
                    id: buildStageID
                }
            ]
        },
        deliverArtifactCollection: {
            items: [
                {
                    artifactName: artifactName,
                    artifactId: artifactID
                }
            ]
        },
        buildPipelineStageType: devops.models.CreateDeliverArtifactStageDetails.buildPipelineStageType
    };
    const request: devops.requests.CreateBuildPipelineStageRequest = {
        createBuildPipelineStageDetails: createBuildPipelineStageDetails
    };
    return client.createBuildPipelineStage(request).then(response => response.buildPipelineStage);
}

export async function createDeployPipeline(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, name: string, description?: string, params?: devops.models.DeployPipelineParameter[], tags?: { [key:string]: string }): Promise<devops.responses.CreateDeployPipelineResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployPipelineDetails: devops.models.CreateDeployPipelineDetails = {
            displayName: name,
            description: description,
            projectId: projectID
        };
        if (params) {
            createDeployPipelineDetails.deployPipelineParameters = { items: params };
        }
        if (tags) {
            createDeployPipelineDetails.freeformTags = tags;
        }
        const createDeployPipelineRequest: devops.requests.CreateDeployPipelineRequest = {
            createDeployPipelineDetails: createDeployPipelineDetails
        };
        return client.createDeployPipeline(createDeployPipelineRequest);
    } catch (error) {
        console.log('>>> createDeployPipeline ' + error);
        return undefined;
    }
}

export async function createDeployToOkeStage(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, environmentID: string, deployArtifactID: string): Promise<devops.responses.CreateDeployStageResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployStageDetails = {
            displayName: 'Deploy to OKE',
            description: 'Deployment stage generated by VS Code',
            deployPipelineId: pipelineID,
            deployStagePredecessorCollection: {
                items: [
                    { id: pipelineID }
                ]
            },
            kubernetesManifestDeployArtifactIds: [
                deployArtifactID
            ],
            okeClusterDeployEnvironmentId: environmentID,
            deployStageType: devops.models.CreateOkeDeployStageDetails.deployStageType
        };
        const createDeployStageRequest: devops.requests.CreateDeployStageRequest = {
            createDeployStageDetails: createDeployStageDetails
        };
        return await client.createDeployStage(createDeployStageRequest);
    } catch (error) {
        console.log('>>> createDeployToOkeStage ' + error);
        return undefined;
    }
}

export async function listBuildRuns(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildPipelineID: string): Promise<devops.responses.ListBuildRunsResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listBuildRunsRequest: devops.requests.ListBuildRunsRequest = {
            buildPipelineId: buildPipelineID,
            limit: 10
        };
        return client.listBuildRuns(listBuildRunsRequest);
    } catch (error) {
        console.log('>>> listBuildRuns ' + error);
        return undefined;
    }
}

export async function getBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, buildRunID: string): Promise<devops.responses.GetBuildRunResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
    const getBuildRunRequest: devops.requests.GetBuildRunRequest = {
        buildRunId: buildRunID
    };
    return client.getBuildRun(getBuildRunRequest);
}

export async function createBuildRun(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, name: string, params: { name: string, value: string }[] = [], commitInfo?: devops.models.CommitInfo): Promise<devops.responses.CreateBuildRunResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createBuildRunDetails: devops.models.CreateBuildRunDetails = {
            displayName: name,
            buildPipelineId: pipelineID,
            buildRunArguments: {
                items: params
            },
            commitInfo
        };
        const createBuildRunRequest: devops.requests.CreateBuildRunRequest = {
            createBuildRunDetails: createBuildRunDetails
        };
        return client.createBuildRun(createBuildRunRequest);
    } catch (error) {
        console.log('>>> createBuildRun ' + error);
        return undefined;
    }
}

export async function listDeployments(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string): Promise<devops.responses.ListDeploymentsResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const listDeploymentsRequest: devops.requests.ListDeploymentsRequest = {
            deployPipelineId: pipelineID,
            limit: 10
        };
        return client.listDeployments(listDeploymentsRequest);
    } catch (error) {
        console.log('>>> listDeployments ' + error);
        return undefined;
    }
}

export async function getDeployment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, deploymentID: string): Promise<devops.responses.GetDeploymentResponse> {
    const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const getDeploymentRequest: devops.requests.GetDeploymentRequest = {
        deploymentId: deploymentID
    };
    return client.getDeployment(getDeploymentRequest);
}

export async function createDeployment(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, pipelineID: string, name: string, args?: devops.models.DeploymentArgument[], tags?: { [key:string]: string }): Promise<devops.responses.CreateDeploymentResponse | undefined> {
    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeploymentDetails: devops.models.CreateDeployPipelineDeploymentDetails = {
            displayName: name,
            deploymentType: devops.models.CreateDeployPipelineDeploymentDetails.deploymentType,
            deployPipelineId: pipelineID
        };
        if (args) {
            createDeploymentDetails.deploymentArguments = { items: args };
        }
        if (tags) {
            createDeploymentDetails.freeformTags = tags;
        }
        const createDeploymentRequest: devops.requests.CreateDeploymentRequest = {
            createDeploymentDetails: createDeploymentDetails
        };
        return client.createDeployment(createDeploymentRequest);
    } catch (error) {
        console.log('>>> createDeployment ' + error);
        return undefined;
    }
}

export async function createProjectDevArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, repositoryID: string, projectID: string, artifactPath: string, artifactName: string, artifactDescription: string): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.GenericFile, {
        repositoryId: repositoryID,
        deployArtifactPath: artifactPath,
        deployArtifactVersion: 'dev',
        deployArtifactSourceType: devops.models.GenericDeployArtifactSource.deployArtifactSourceType
    });
}

export async function createProjectDockerArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, imageURI: string, artifactName: string, artifactDescription: string): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.DockerImage, {
        imageUri: imageURI,
        deployArtifactSourceType: devops.models.OcirDeployArtifactSource.deployArtifactSourceType
    });
}

export async function createOkeDeployConfigurationArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, artifactInlineContent: string, artifactName: string, artifactDescription: string): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {
    return createDeployArtifact(authenticationDetailsProvider, projectID, artifactName, artifactDescription, devops.models.DeployArtifact.DeployArtifactType.KubernetesManifest, {
        base64EncodedContent: Buffer.from(artifactInlineContent, 'binary').toString('base64'),
        deployArtifactSourceType: devops.models.InlineDeployArtifactSource.deployArtifactSourceType
    });
}

async function createDeployArtifact(authenticationDetailsProvider: common.ConfigFileAuthenticationDetailsProvider, projectID: string, displayName: string, description: string, deployArtifactType: string, deployArtifactSource: devops.models.GenericDeployArtifactSource | devops.models.OcirDeployArtifactSource | devops.models.InlineDeployArtifactSource): Promise<devops.responses.CreateDeployArtifactResponse | undefined> {    try {
        const client = new devops.DevopsClient({ authenticationDetailsProvider: authenticationDetailsProvider });
        const createDeployArtifactDetails = {
            displayName,
            description,
            deployArtifactType,
            deployArtifactSource,
            argumentSubstitutionMode: devops.models.DeployArtifact.ArgumentSubstitutionMode.SubstitutePlaceholders,
            projectId: projectID
        };
        const createDeployArtifactRequest: devops.requests.CreateDeployArtifactRequest = {
            createDeployArtifactDetails: createDeployArtifactDetails
        };
        return await client.createDeployArtifact(createDeployArtifactRequest);
    } catch (error) {
        console.log('>>> createProjectDevArtifact ' + error);
        return undefined;
    }
}

export async function completion(initialPollTime: number, getState: () => Promise<string | undefined>): Promise<string | undefined> {
    try {
        // TODO: use increasing polling time
        const pollTime = initialPollTime;
        let state: string | undefined;
        do {
            await delay(pollTime);
            state = await getState();
        } while (isRunning(state));
        return state;
    } catch (error) {
        console.log('>>> completion ' + error);
        return undefined;
    }
}

export function isRunning(state?: string) {
    return state === 'ACCEPTED' || state === 'IN_PROGRESS' || state === 'CANCELING';
}

export function isSuccess(state?: string) {
    return state === 'SUCCEEDED';
}

export function getTimestamp(): string {
    const date = new Date();
    const year = date.getFullYear();
    let month = (date.getMonth() + 1).toString();
    if (month.length === 1) month = `0${month}`;
    let day = date.getDate().toString();
    if (day.length === 1) day = `0${day}`;
    let hours = date.getHours().toString();
    if (hours.length === 1) hours = `0${hours}`;
    let minutes = date.getMinutes().toString();
    if (minutes.length === 1) minutes = `0${minutes}`;
    return `${year}${month}${day}-${hours}${minutes}`;
}

export function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
