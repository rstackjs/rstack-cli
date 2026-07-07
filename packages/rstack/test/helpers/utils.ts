export const toPosixPath: (filePath: string) => string = (filePath) => filePath.replace(/\\/g, '/');
