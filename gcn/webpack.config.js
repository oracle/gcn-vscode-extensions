//@ts-check

'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

    entry: {
        extension: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    },
    output: { // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: "commonjs2",
        devtoolModuleFilenameTemplate: "../[resource-path]",
    },
    devtool: 'eval-cheap-module-source-map',
    externals: {
        vscode: "commonjs2 vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    },
    resolve: { // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js', '.json'],
        modules: ['node_modules'],
        mainFields: ['main', 'module'],
        byDependency: {
            'node-fetch': {
                mainFields: ['main', 'module']
            },
            'isomorphic-fetch': {
                mainFields: ['main', 'module']
            }
        },
        symlinks: false,
        cacheWithContext: false
    },
    module: {
        rules: [{
            test: /\.ts$/,
            exclude: /node_modules/,
            include: path.resolve(__dirname, 'src'),
            use: [{
                loader: 'ts-loader',
                options: {
                    transpileOnly: true,
                }
            }]
        }]
    },
}

module.exports = config;
