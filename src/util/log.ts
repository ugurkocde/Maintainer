import * as core from '@actions/core';

export const log = {
  info: (msg: string): void => core.info(msg),
  warn: (msg: string): void => core.warning(msg),
  error: (msg: string): void => core.error(msg),
  debug: (msg: string): void => core.debug(msg),
  group: <T>(name: string, fn: () => Promise<T>): Promise<T> => core.group(name, fn),
};
