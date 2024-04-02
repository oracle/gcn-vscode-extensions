/*
 * Copyright (c) 2024, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * Licensed under the Universal Permissive License v 1.0 as shown at https://oss.oracle.com/licenses/upl.
 */

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as jdk from './jdk';
import * as parameters from './parameters';
// import * as logUtils from './logUtils';


export type RunningProcess = {
    readonly pid: number;
    readonly displayName: string;
};

export async function select(ignore?: number[]): Promise<RunningProcess | undefined> {
    const jdkPath = await jdk.getPath();
    if (!jdkPath) {
        return undefined;
    }
    const jpsPath = jdk.getJpsPath(jdkPath);
    if (!jpsPath) {
        return undefined;
    }
    try {
        const processes: Promise<QuickPickProcess[]> = new Promise(async (resolve) => {
            const parts1 = await processJpsCommand(`"${jpsPath}" -v`);
            const parts2 = await processJpsCommand(`"${jpsPath}" -lm`);
            const processes: QuickPickProcess[] = [];
            parts1.forEach(p1 => {
                const p2 = parts2.find(p2 => p2.pid === p1.pid);
                if (p2 && !ignore?.includes(p2.pid) && !p2.displayName.includes('--branding visualvm')) { // TODO: filter out jps process
                    processes.push(new QuickPickProcess(p1.pid, p1.displayName, p2.displayName));
                }
            });
            resolve(processes);
        });
        const selected = await vscode.window.showQuickPick(processes, {
             title: 'Select Running Java Process',
             placeHolder: 'Select the process to be monitored by VisualVM'
        });
        if (selected) {
            return { pid: selected.pid, displayName: selected.label };
        } else {
            return undefined;
        }
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to read running Java processes: ${err}`);
        return undefined;
    }
}

class QuickPickProcess implements vscode.QuickPickItem{
    
    label: string;
    description: string;
    detail?: string;
    
    constructor(public readonly pid: number, info1: string, info2: string) {
        this.label = '';
        const infos1 = info1.split(' ');
        const vmArgDisplayName = parameters.vmArgDisplayName('', false);
        for (const info of infos1) {
            if (info.startsWith(vmArgDisplayName)) {
                this.label = info.substring(vmArgDisplayName.length).replace(/\%PID/g, '').replace(/\%pid/g, '');
                break;
            }
        }
        this.label = this.label || infos1[0] || 'Java Process';
        this.description = `(pid ${pid})`;
        this.detail = this.normalize(info2 || info1 || 'no details available', 1000); // VS Code fails to display long string in tooltip
    }

    private normalize(string: string, limit: number): string {
        string = string.trim();
        const length = string.length;
        return length <= limit ? string : string.substring(0, limit);
    }
    
}

async function processJpsCommand(cmd: string): Promise<RunningProcess[]> {
    return new Promise<RunningProcess[]>((resolve, reject) => {
        cp.exec(cmd, async (error: any, stdout: string) => {
            if (error) {
                reject(error);
            }
            const lines = stdout.split('\n');
            const parts: RunningProcess[] = [];
            lines.forEach(line => {
                const index = line.trim().indexOf(' ');
                if (index >= 0) {
                    parts.push({ pid: Number.parseInt(line.slice(0, index)), displayName: line.slice(index + 1, line.length) });
                } else {
                    parts.push({ pid: Number.parseInt(line), displayName: '' });
                }
            });
            resolve(parts);
        });
    });
}

const SEARCH_PROCESSES_TIMEOUT = 120;   // [s] Time to search for a process before triggering onTimeout()
const SEARCH_PROCESSES_INTERVAL = 1000; // [ms] Interval between calling the jps command
const SEARCHED_PROCESSES: SearchedProcess[] = [];

let SEARCH_PROCESSES_JPS_PATH: string | undefined;

type SearchedProcess = {
    searchParameter: string;
    onFound: (pid: number) => void;
    onTimeout: () => void;
    timeoutTime: number; // timestamp after which onTimeout() will be triggered
};

export function setJpsPath(jpsPath: string) {
    SEARCH_PROCESSES_JPS_PATH = jpsPath;
}

export async function searchByParameter(searchParameter: string, onFound: (pid: number) => void, onTimeout: () => void, searchTimeout: number = SEARCH_PROCESSES_TIMEOUT * 1000) {
    SEARCHED_PROCESSES.push({
        searchParameter: searchParameter,
        onFound: onFound,
        onTimeout: onTimeout,
        timeoutTime: Date.now() + searchTimeout
    });
    
    if (SEARCHED_PROCESSES.length === 1) {
        searchProcesses();
    }
}

export function stopSearching(searchParameter: string) {
    for (let index = 0; index < SEARCHED_PROCESSES.length; index++) {
        if (SEARCHED_PROCESSES[index].searchParameter === searchParameter) {
            SEARCHED_PROCESSES.splice(index, 1);
            break;
        }
    }
}

function searchProcesses() {
    const now = Date.now();
    for (let index = SEARCHED_PROCESSES.length - 1; index >= 0; index--) {
        const process = SEARCHED_PROCESSES[index];
        if (process.timeoutTime <= now) {
            setTimeout(() => { process.onTimeout(); }, 0);
            SEARCHED_PROCESSES.splice(index, 1);
        }
    }
    if (SEARCHED_PROCESSES.length) {
        if (SEARCH_PROCESSES_JPS_PATH) {
            processJpsCommand(`"${SEARCH_PROCESSES_JPS_PATH}" -v`).then(results => {
                if (results.length) {
                    for (let index = SEARCHED_PROCESSES.length - 1; index >= 0; index--) {
                        const process = SEARCHED_PROCESSES[index];
                        for (const result of results) {
                            if (result.displayName.includes(process.searchParameter)) {
                                setTimeout(() => { process.onFound(result.pid); }, 0);
                                SEARCHED_PROCESSES.splice(index, 1);
                                break;
                            }
                        }
                    }
                }
                if (SEARCHED_PROCESSES.length) {
                    setTimeout(() => { searchProcesses(); }, SEARCH_PROCESSES_INTERVAL);
                }
            });
        }
    }
}
