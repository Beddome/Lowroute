const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const localDirBlock = /[/\\]\.local[/\\].*/;
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = existingBlockList
  ? (Array.isArray(existingBlockList)
      ? [...existingBlockList, localDirBlock]
      : [existingBlockList, localDirBlock])
  : localDirBlock;

const originalResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "react-native-maps") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "stubs/react-native-maps-stub.js"),
    };
  }
  if (originalResolver) {
    return originalResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
