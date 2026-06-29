export type RsbuildCommonOptions = {
  root?: string;
};

export type BuildOptions = {
  root?: string;
  watch?: boolean;
};

export type DevOptions = RsbuildCommonOptions;

export type PreviewOptions = RsbuildCommonOptions;
