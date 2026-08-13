export type ContextCaptureTier = 'metadata' | 'deep';

export type ContextConfig = {
  enabled?: boolean;
  capture?: 'off' | ContextCaptureTier;
  variant?: string;
};

export const resolveContextCapture = (
  config: ContextConfig | undefined,
  override: string | undefined = process.env.RSTACK_CONTEXT,
): ContextCaptureTier | 'off' => {
  if (override === '0' || config?.capture === 'off') return 'off';
  if (override === '1') return config?.capture === 'deep' ? 'deep' : 'metadata';
  if (config?.enabled !== true) return 'off';
  return config.capture ?? 'metadata';
};
