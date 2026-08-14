// Metro configuration for a pnpm monorepo.
//
// Two things are needed beyond the Expo defaults:
//   1. watchFolders — so edits in packages/shared trigger a rebuild
//   2. nodeModulesPaths — so imports resolve against the workspace root too
//
// See also pnpm-workspace.yaml (nodeLinker: hoisted), which keeps node_modules
// flat so Metro's directory walk behaves like a single-package project.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('node:path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

module.exports = config
