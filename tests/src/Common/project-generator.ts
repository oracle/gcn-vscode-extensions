/*
 * Copyright (c) 2023, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as Common from '../../../gcn/out/common';
import { NodeFileHandler } from '../../../gcn/out/gcnProjectCreate';

import * as jdkUtils from 'jdk-utils';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BuildTool, Feature, SupportedJava } from './types';

interface CreateOptions {
  homeDir: string;
  options: Common.CreateOptions;
}

function generateUID(): string {
  const fullUUID = uuidv4();
  const shortUUID = fullUUID.substr(0, 8);
  return shortUUID;
}

export async function getCreateOptions(
  ourBuildTool: BuildTool,
  java: SupportedJava,
  services: string[],
): Promise<CreateOptions> {
  let javaRuntimes;

  javaRuntimes = await jdkUtils.findRuntimes({ checkJavac: true });

  const selectedJavaRuntime = javaRuntimes.find((x) => x.homedir.includes(java));

  // javaRuntimes.forEach(x => console.log(x.homedir));

  if (selectedJavaRuntime === null || selectedJavaRuntime === undefined) {
    throw new Error(
      `${java} was not found, only these GraalVMs are present:` + javaRuntimes.map((x) => x.homedir).join(';\n'),
    );
  }
  // console.log("selected runtime is: " + selectedJavaRuntime.homedir);

  return {
    homeDir: selectedJavaRuntime.homedir,
    options: {
      micronautVersion: {
        label: '4.0.0',
        serviceUrl: '',
      },
      applicationType: 'APPLICATION',
      buildTool: ourBuildTool,
      language: 'JAVA',
      testFramework: 'JUNIT',
      basePackage: 'com.example',
      projectName: 'demo',
      javaVersion: `JDK_17`, // TODO make a variable
      clouds: ['OCI'],
      services: [...services],
      features: undefined,
    },
  };
}

function getName(buildTool: BuildTool, services: string[]) {
  let name: string = buildTool + '_';
  if (services.length > 0) {
    name += services.join('_') + '_';
  }

  name += generateUID();
  return name;
}

/**
 * Creates GCN project with given specification
 * @param buildTool is a tool you want the project to be initialized with
 * @param services are services you want the project to be initialized with
 * @param java is a java runtime you want the project to be initialized with
 * @returns path to the created project
 */
export async function createGcnProject(
  buildTool: BuildTool,
  services: Feature[],
  relAbsPath: string[] | string,
  java: SupportedJava = SupportedJava.AnyJava,
): Promise<string> {
  try {
    await Common.initialize();

    const options = await getCreateOptions(buildTool, java, services);

    const projFolder: string = resolveProjFolder(relAbsPath, getName(buildTool, services));

    if (!fs.existsSync(projFolder)) {
      fs.mkdirSync(projFolder, { recursive: true });
    }
    await Common.writeProjectContents(options.options, new NodeFileHandler(vscode.Uri.file(projFolder)));

    return projFolder;
  } catch (e: any) {
    assert.fail('Project options were not resolved properly: ' + e.message);
  }
}

function resolveProjFolder(relAbsPath: string[] | string, ending: string): string {
  if (typeof relAbsPath === 'string') return path.join(relAbsPath, ending);
  else {
    const relPath = path.join('..', '..', ...relAbsPath, ending);
    return path.resolve(__dirname, relPath);
  }
}
